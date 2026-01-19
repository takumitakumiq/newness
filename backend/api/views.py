"""
MATSU - API Views
"""
from rest_framework import viewsets, status, generics
from rest_framework.decorators import api_view, action, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.shortcuts import render
from django.views import View
from django.contrib.admin.views.decorators import staff_member_required
from django.utils.decorators import method_decorator
from django.http import HttpResponse
import os
import json
import csv
import shutil
from datetime import timedelta
from datetime import datetime
import secrets
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction, models
from django.db.models import Count
from django.contrib.auth.models import User
from django.db.models.deletion import ProtectedError

from .models import (
    EntrySlot, AttributeConfig, Reservation, Ticket, CheckInLog, Announcement,
    ChatMessage, SystemSetting, ChatMessageRead, AdminActionLog, TicketShareLink,
    EmailDeliveryLog, ShareLinkAccessLog, UserProfile, SystemSettingHistory
)
from .serializers import (
    EntrySlotSerializer, AttributeConfigSerializer,
    ReservationSerializer, ReservationListSerializer, TicketSerializer,
    CheckoutRequestSerializer, CheckoutResponseSerializer,
    CheckInRequestSerializer, CheckInResponseSerializer,
    UserRegistrationSerializer, UserSerializer, UserProfileUpdateSerializer,
    TicketUpdateSerializer, TicketCancelSerializer,
    AnnouncementSerializer
)
from .permissions import ShareAccessThrottle, EmailOpsThrottle
from .passkit import build_pass_payload, build_pkpass

PASSKIT_REQUIRED_ENV = [
    "PASSKIT_TEAM_ID",
    "PASSKIT_PASS_TYPE_ID",
    "PASSKIT_ORG_NAME",
    "PASSKIT_CERT_PATH",
    "PASSKIT_KEY_PATH",
    "PASSKIT_WWDR_CERT_PATH",
]


def _parse_before_datetime(before: str):
    if not before:
        return None
    try:
        return parse_datetime(before)
    except (ValueError, TypeError):
        return None


def _paginate_with_has_more(queryset, limit: int):
    messages = list(queryset[:limit + 1])
    has_more = len(messages) > limit
    if has_more:
        messages = messages[:limit]
    return messages, has_more


def _build_sales_trend(days: int = 7):
    today = timezone.now().date()
    last_days = [today - timedelta(days=i) for i in range(days - 1, -1, -1)]
    trend = []
    for date in last_days:
        count = Ticket.objects.filter(created_at__date=date).count()
        trend.append({
            'date': date.strftime('%Y-%m-%d'),
            'count': count
        })
    return trend


def _build_recent_activity(limit: int = 10):
    recent_activity = CheckInLog.objects.select_related('ticket__reservation').order_by('-created_at')[:limit]
    return [
        {
            'action': log.action,
            'ticket_id': str(log.ticket.id),
            'user_name': log.ticket.reservation.user_name if log.ticket and log.ticket.reservation else 'Unknown',
            'timestamp': log.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            'success': log.success
        }
        for log in recent_activity
    ]


def _build_chat_response(data, messages, has_more: bool):
    response = Response(data)
    response['X-Has-More'] = 'true' if has_more else 'false'
    if messages:
        response['X-Oldest-Id'] = str(messages[-1].id)
        response['X-Oldest-Created-At'] = messages[-1].created_at.isoformat()
    return response


def _log_admin_action(request, action: str, target_type: str = "", target_id: str = "", metadata: dict | None = None):
    AdminActionLog.objects.create(
        actor=request.user if request and request.user.is_authenticated else None,
        action=action,
        target_type=target_type or "",
        target_id=str(target_id) if target_id else "",
        metadata=metadata or {},
    )


GROUP_ADMIN_READ = "admin_read"
GROUP_ADMIN_OPS = "admin_ops"
GROUP_ADMIN_EMERGENCY = "admin_emergency"


def _user_in_group(user, group_name: str) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return user.groups.filter(name=group_name).exists()


def _require_group(request, group_name: str):
    if _user_in_group(request.user, group_name):
        return None
    return Response({'success': False, 'message': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)


def _require_any_group(request, group_names: list[str]):
    if any(_user_in_group(request.user, name) for name in group_names):
        return None
    return Response({'success': False, 'message': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)


def _build_diff(before: dict, after: dict):
    diff = {}
    for key in set(before.keys()) | set(after.keys()):
        if before.get(key) != after.get(key):
            diff[key] = {
                "before": before.get(key),
                "after": after.get(key)
            }
    return diff


def _mask_setting_snapshot(snapshot: dict) -> dict:
    masked = dict(snapshot)
    if masked.get("sendgrid_api_key"):
        api_key = masked.get("sendgrid_api_key") or ""
        masked["sendgrid_api_key"] = api_key[:4] + "*" * max(0, len(api_key) - 8) + api_key[-4:]
    return masked


def _create_system_setting_history(setting: SystemSetting, request, action: str):
    SystemSettingHistory.objects.create(
        system_setting=setting,
        action=action,
        snapshot=setting.to_snapshot(),
        created_by=request.user if request and request.user.is_authenticated else None,
    )


def _get_client_ip(request) -> str:
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def _check_checkout_block(setting: SystemSetting):
    if setting.emergency_stop:
        return Response({"success": False, "message": setting.emergency_message or "緊急停止中です"}, status=status.HTTP_423_LOCKED)
    if setting.maintenance_mode:
        return Response({"success": False, "message": "メンテナンス中のため購入できません"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    if setting.operation_mode in [
        SystemSetting.OperationMode.READ_ONLY,
        SystemSetting.OperationMode.PURCHASE_STOP,
        SystemSetting.OperationMode.CHECKIN_ONLY,
    ]:
        return Response({"success": False, "message": "現在、購入が停止されています"}, status=status.HTTP_423_LOCKED)
    return None


def _check_checkin_block(setting: SystemSetting):
    if setting.emergency_stop:
        return Response({"success": False, "message": setting.emergency_message or "緊急停止中です"}, status=status.HTTP_423_LOCKED)
    if setting.maintenance_mode:
        return Response({"success": False, "message": "メンテナンス中のためチェックインできません"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    if setting.operation_mode == SystemSetting.OperationMode.READ_ONLY:
        return Response({"success": False, "message": "読み取り専用モードのためチェックインできません"}, status=status.HTTP_423_LOCKED)
    return None


def _get_checkin_block_info(ticket: Ticket):
    if ticket.slot and getattr(ticket.slot, "entry_closed", False):
        return {
            "action": "entry_closed",
            "message": "この入場枠は締切済みです",
            "status": "entry_closed",
            "http_status": status.HTTP_423_LOCKED,
        }
    if ticket.status == Ticket.Status.ENTERED:
        return {
            "action": "already_entered",
            "message": "既に入場済みです",
            "status": "already_entered",
            "http_status": status.HTTP_409_CONFLICT,
        }
    if ticket.status == Ticket.Status.CANCELLED:
        return {
            "action": "cancelled",
            "message": "このチケットは無効です",
            "status": "cancelled",
            "http_status": status.HTTP_410_GONE,
        }
    return None


class EntrySlotViewSet(viewsets.ModelViewSet):
    """
    API endpoint for entry slots.
    GET /api/slots/ - List all active slots
    GET /api/slots/{id}/ - Get slot detail
    POST /api/slots/ - Create new slot (admin only)
    PUT/PATCH /api/slots/{id}/ - Update slot (admin only)
    DELETE /api/slots/{id}/ - Delete slot (admin only)
    """
    queryset = EntrySlot.objects.all()
    serializer_class = EntrySlotSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['event_date', 'is_active']
    
    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAdminUser()]
    
    def get_queryset(self):
        if self.request.user.is_staff:
            return EntrySlot.objects.all()
        return EntrySlot.objects.filter(is_active=True)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            # 予約済みチケットがある枠は物理削除できないため無効化に切替
            instance.is_active = False
            instance.entry_closed = True
            instance.save(update_fields=["is_active", "entry_closed"])
            return Response(
                {
                    "success": True,
                    "soft_deleted": True,
                    "message": "予約済みチケットがあるため、時間枠を無効化しました",
                }
            )


class AttributeConfigViewSet(viewsets.ModelViewSet):
    """
    API endpoint for attribute configurations.
    GET /api/attributes/ - List all attributes
    GET /api/attributes/{id}/ - Get attribute detail
    PATCH /api/attributes/{id}/ - Update attribute (admin only)
    """
    serializer_class = AttributeConfigSerializer
    
    def get_queryset(self):
        # 管理者は全て見れる、一般ユーザーはactiveのみ
        if self.request.user.is_authenticated and self.request.user.is_staff:
            return AttributeConfig.objects.all().order_by('sort_order')
        return AttributeConfig.objects.filter(is_active=True).order_by('sort_order')
    
    def get_permissions(self):
        # 編集・削除は管理者のみ
        if self.action in ['update', 'partial_update', 'destroy', 'create']:
            return [IsAdminUser()]
        return [AllowAny()]


class ReservationViewSet(viewsets.ModelViewSet):
    """
    API endpoint for reservations.
    GET /api/reservations/ - List reservations (filterable by guest_identifier)
    GET /api/reservations/{id}/ - Get reservation detail with tickets
    PATCH /api/reservations/{id}/ - Update reservation (admin only)
    DELETE /api/reservations/{id}/ - Delete reservation (admin only)
    """
    queryset = Reservation.objects.all()
    permission_classes = [IsAdminUser]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['guest_identifier']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ReservationListSerializer
        return ReservationSerializer


class TicketViewSet(viewsets.ModelViewSet):
    """
    API endpoint for tickets.
    GET /api/tickets/ - List tickets (filterable by reservation, status)
    GET /api/tickets/{id}/ - Get ticket detail
    PATCH /api/tickets/{id}/ - Update ticket (admin only)
    DELETE /api/tickets/{id}/ - Delete ticket (admin only)
    """
    queryset = Ticket.objects.all()
    serializer_class = TicketSerializer
    permission_classes = [IsAdminUser]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['reservation', 'status', 'slot']
    
    @action(detail=False, methods=['get'])
    def by_user(self, request):
        """Get tickets by guest_identifier (via reservation)."""
        guest_identifier = request.query_params.get('guest_identifier')
        user_id = request.query_params.get('user_id')
        if not guest_identifier and not user_id:
            return Response(
                {"success": False, "message": "guest_identifier or user_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        if guest_identifier:
            tickets = Ticket.objects.filter(
                reservation__guest_identifier=guest_identifier
            )
        else:
            tickets = Ticket.objects.filter(
                reservation__user__id=user_id
            )
        tickets = tickets.select_related('slot', 'attribute', 'reservation')
        serializer = self.get_serializer(tickets, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def cancel(self, request, pk=None):
        """チケットをキャンセルする"""
        ticket = self.get_object()
        
        # 権限チェック: 予約者本人か確認
        if ticket.reservation.user != request.user:
            return Response(
                {"success": False, "message": "このチケットをキャンセルする権限がありません。"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # キャンセル処理
        with transaction.atomic():
            # ロック取得後に再検証
            ticket = Ticket.objects.select_for_update().select_related('attribute', 'slot', 'reservation').get(id=ticket.id)
            serializer = TicketCancelSerializer(data={}, context={'ticket': ticket})
            if not serializer.is_valid():
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

            ticket.status = Ticket.Status.CANCELLED
            ticket.save()
            
            # 在庫を戻す
            EntrySlot.objects.filter(id=ticket.slot_id).update(
                booked_count=models.F('booked_count') - 1
            )

        _log_admin_action(
            request,
            action="ticket_cancel",
            target_type="ticket",
            target_id=str(ticket.id),
            metadata={"reservation_id": str(ticket.reservation_id)}
        )

        return Response({"status": "cancelled", "message": "チケットをキャンセルしました。"})

    @action(detail=True, methods=['patch'], permission_classes=[IsAuthenticated])
    def update_info(self, request, pk=None):
        """チケット情報を修正する"""
        ticket = self.get_object()
        
        # 権限チェック: 予約者本人か確認
        if ticket.reservation.user != request.user:
            return Response(
                {"success": False, "message": "このチケットを編集する権限がありません。"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        serializer = TicketUpdateSerializer(ticket, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(TicketSerializer(ticket).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CheckoutView(APIView):
    """
    POST /api/checkout/
    Process ticket checkout with atomic transaction and inventory locking.
    """
    
    def post(self, request):
        setting = SystemSetting.get_instance()
        blocked = _check_checkout_block(setting)
        if blocked:
            return blocked
        serializer = CheckoutRequestSerializer(data=request.data, context={'request': request})
        
        if not serializer.is_valid():
            return Response(
                {"errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            reservation = serializer.save()

            # 予約完了メール（失敗しても購入は成功扱い）
            try:
                if reservation.user_email:
                    from .email_service import email_service
                    ticket_rows = []
                    for t in reservation.tickets.select_related('slot', 'attribute'):
                        ticket_rows.append({
                            'guest_name': t.guest_info.get('name', '未入力') if t.guest_info else '未入力',
                            'slot_date': t.slot.event_date.isoformat() if t.slot else '',
                            'slot_time': t.slot.start_time.strftime('%H:%M') if t.slot else '',
                            'attribute_name': t.attribute.display_name if t.attribute else ''
                        })
                    user_name = reservation.user_name or reservation.guest_identifier or "お客様"
                    email_service.send_reservation_confirmation(
                        reservation.user_email,
                        reservation.id,
                        user_name,
                        ticket_rows,
                        context={"reservation": reservation}
                    )
            except Exception:
                pass
            
            response_data = {
                'reservation_id': reservation.id,
                'ticket_ids': [str(t.id) for t in reservation.tickets.all()],
                'total_tickets': reservation.total_tickets,
                'created_at': reservation.created_at
            }
            
            return Response(
                CheckoutResponseSerializer(response_data).data,
                status=status.HTTP_201_CREATED
            )
        
        except Exception as e:
            return Response(
                {"success": False, "message": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class CheckInView(APIView):
    """
    POST /api/checkin/
    Process QR code check-in at the gate.
    
    Status codes:
    - 200: Success - ticket validated and marked as entered
    - 409: Conflict - ticket already used (entered)
    - 410: Gone - ticket is cancelled/invalid
    - 404: Not found - ticket doesn't exist
    """
    permission_classes = [IsAdminUser]
    
    @transaction.atomic
    def post(self, request):
        setting = SystemSetting.get_instance()
        blocked = _check_checkin_block(setting)
        if blocked:
            return blocked
        serializer = CheckInRequestSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(
                {"success": False, "message": "無効なリクエストです", "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        ticket_uuid = serializer.validated_data['ticket_uuid']
        device_id = serializer.validated_data.get('device_id', '')
        # 🔒 セキュリティ修正: operatorは常にログインユーザーから取得（偽装防止）
        operator = request.user.username
        
        # Find ticket
        try:
            ticket = Ticket.objects.select_for_update().get(id=ticket_uuid)
        except Ticket.DoesNotExist:
            self._log_checkin(ticket_uuid, 'not_found', False, 'チケットが見つかりません', device_id, operator)
            return Response(
                {"success": False, "message": "チケットが見つかりません"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        block_info = _get_checkin_block_info(ticket)
        if block_info:
            self._log_checkin(ticket, block_info["action"], False, block_info["message"], device_id, operator)
            payload = {"success": False, "message": block_info["message"]}
            if block_info["action"] == "already_entered":
                payload["ticket"] = TicketSerializer(ticket).data
            return Response(payload, status=block_info["http_status"])
        
        # Valid ticket - mark as entered
        ticket.status = Ticket.Status.ENTERED
        ticket.entered_at = timezone.now()
        ticket.save()
        
        self._log_checkin(ticket, 'checkin', True, '入場成功', device_id, operator)
        
        return Response(
            {
                "success": True,
                "message": "入場成功",
                "ticket": TicketSerializer(ticket).data
            },
            status=status.HTTP_200_OK
        )
    
    def _log_checkin(self, ticket_or_uuid, action, success, message, device_id, operator):
        """Create audit log for check-in attempt."""
        if isinstance(ticket_or_uuid, Ticket):
            CheckInLog.objects.create(
                ticket=ticket_or_uuid,
                action=action,
                success=success,
                message=message,
                device_id=device_id,
                operator=operator
            )


class BatchCheckInView(APIView):
    """
    POST /api/checkin/batch/
    オフライン時に蓄積したチェックインを一括処理
    
    Body: {
        "checkins": [
            { "ticket_uuid": "...", "device_id": "...", "scanned_at": "ISO datetime" },
            ...
        ]
    }
    
    Response: {
        "results": [
            { "ticket_uuid": "...", "success": true/false, "message": "...", "status": "entered/already_entered/..." },
            ...
        ],
        "summary": { "success": N, "failed": M }
    }
    """
    permission_classes = [IsAdminUser]
    
    def post(self, request):
        setting = SystemSetting.get_instance()
        blocked = _check_checkin_block(setting)
        if blocked:
            return blocked
        checkins = request.data.get('checkins', [])
        if not checkins:
            return Response(
                {"success": False, "message": "No checkins provided"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        results = []
        success_count = 0
        failed_count = 0
        operator = request.user.username
        
        for item in checkins:
            ticket_uuid = item.get('ticket_uuid')
            device_id = item.get('device_id', '')
            scanned_at = item.get('scanned_at')
            
            if not ticket_uuid:
                results.append({
                    "ticket_uuid": ticket_uuid,
                    "success": False,
                    "message": "ticket_uuid is required",
                    "status": "invalid"
                })
                failed_count += 1
                continue
            
            # 各チケットを個別トランザクションで処理
            try:
                with transaction.atomic():
                    try:
                        ticket = Ticket.objects.select_for_update().get(id=ticket_uuid)
                    except Ticket.DoesNotExist:
                        results.append({
                            "ticket_uuid": ticket_uuid,
                            "success": False,
                            "message": "チケットが見つかりません",
                            "status": "not_found"
                        })
                        failed_count += 1
                        continue
                    
                    block_info = _get_checkin_block_info(ticket)
                    if block_info:
                        results.append({
                            "ticket_uuid": ticket_uuid,
                            "success": False,
                            "message": block_info["message"],
                            "status": block_info["status"]
                        })
                        failed_count += 1
                        continue
                    
                    # 入場処理
                    ticket.status = Ticket.Status.ENTERED
                    ticket.entered_at = timezone.now()
                    ticket.save()
                    
                    # ログ記録
                    CheckInLog.objects.create(
                        ticket=ticket,
                        action='batch_checkin',
                        success=True,
                        message=f'バッチ処理で入場 (scanned_at: {scanned_at})',
                        device_id=device_id,
                        operator=operator
                    )
                    
                    results.append({
                        "ticket_uuid": str(ticket_uuid),
                        "success": True,
                        "message": "入場成功",
                        "status": "entered"
                    })
                    success_count += 1
                    
            except Exception as e:
                results.append({
                    "ticket_uuid": str(ticket_uuid),
                    "success": False,
                    "message": str(e),
                    "status": "error"
                })
                failed_count += 1
        
        return Response({
            "results": results,
            "summary": {
                "success": success_count,
                "failed": failed_count,
                "total": len(checkins)
            }
        })


class CheckInRevertView(APIView):
    """
    POST /api/admin/checkin/revert/
    誤スキャンを取り消し（入場済み→有効に戻す）
    
    Body: { "ticket_id": "...", "reason": "..." }
    """
    permission_classes = [IsAdminUser]
    
    @transaction.atomic
    def post(self, request):
        ticket_id = request.data.get('ticket_id')
        reason = request.data.get('reason', '')
        
        if not ticket_id:
            return Response(
                {"success": False, "message": "ticket_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            ticket = Ticket.objects.select_for_update().get(id=ticket_id)
        except Ticket.DoesNotExist:
            return Response(
                {"success": False, "message": "チケットが見つかりません"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        if ticket.status != Ticket.Status.ENTERED:
            return Response(
                {"success": False, "message": "このチケットは入場済みではありません"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # 入場取り消し
        ticket.status = Ticket.Status.VALID
        ticket.entered_at = None
        ticket.save()
        
        # 監査ログ
        CheckInLog.objects.create(
            ticket=ticket,
            action='revert',
            success=True,
            message=f'入場取り消し: {reason}',
            device_id='admin',
            operator=request.user.username
        )
        
        return Response({
            "success": True,
            "message": "入場を取り消しました",
            "ticket": TicketSerializer(ticket).data
        })


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """Health check endpoint."""
    return Response({"status": "ok", "service": "MATSU API"})


# === Authentication & User Views ===

class UserRegistrationView(generics.CreateAPIView):
    """
    POST /api/auth/register/
    ユーザー登録
    """
    queryset = User.objects.all()
    permission_classes = [AllowAny]
    serializer_class = UserRegistrationSerializer


class UserProfileView(generics.RetrieveUpdateAPIView):
    """
    GET /api/auth/me/ - 現在のユーザー情報取得
    PATCH /api/auth/me/ - ユーザー情報更新
    """
    permission_classes = [IsAuthenticated]
    
    def get_object(self):
        return self.request.user
    
    def get_serializer_class(self):
        if self.request.method == 'PATCH':
            return UserProfileUpdateSerializer
        return UserSerializer


class MyReservationsView(generics.ListAPIView):
    """
    GET /api/mypage/reservations/
    ログインユーザーの予約一覧を取得
    """
    permission_classes = [IsAuthenticated]
    serializer_class = ReservationSerializer
    
    def get_queryset(self):
        return Reservation.objects.filter(user=self.request.user).prefetch_related('tickets')


class MyTicketsView(generics.ListAPIView):
    """
    GET /api/mypage/tickets/
    ログインユーザーのチケット一覧を取得
    """
    permission_classes = [IsAuthenticated]
    serializer_class = TicketSerializer
    
    def get_queryset(self):
        return Ticket.objects.filter(
            reservation__user=self.request.user
        ).select_related('slot', 'attribute', 'reservation')


class TicketShareCreateView(APIView):
    """
    POST /api/shares/create
    閲覧専用の共有リンクを作成
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ticket_id = request.data.get('ticket_id')
        expires_in_hours = request.data.get('expires_in_hours', 24)
        max_accesses = request.data.get('max_accesses', 0)

        if not ticket_id:
            return Response(
                {"success": False, "message": "ticket_id is required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            expires_in_hours = int(expires_in_hours)
        except (TypeError, ValueError):
            expires_in_hours = 24

        try:
            max_accesses = int(max_accesses)
        except (TypeError, ValueError):
            max_accesses = 0

        expires_in_hours = max(1, min(expires_in_hours, 168))

        ticket = Ticket.objects.select_related('reservation').filter(id=ticket_id).first()
        if not ticket or ticket.reservation.user != request.user:
            return Response(
                {"success": False, "message": "チケットが見つかりません"},
                status=status.HTTP_404_NOT_FOUND
            )

        token = secrets.token_urlsafe(24)[:64]
        expires_at = timezone.now() + timedelta(hours=expires_in_hours)

        share = TicketShareLink.objects.create(
            token=token,
            ticket=ticket,
            created_by=request.user,
            expires_at=expires_at,
            max_accesses=max(0, max_accesses)
        )

        _log_admin_action(
            request,
            action="ticket_share_create",
            target_type="ticket",
            target_id=str(ticket.id),
            metadata={"expires_at": share.expires_at.isoformat(), "max_accesses": share.max_accesses}
        )

        return Response({
            "success": True,
            "token": share.token,
            "expires_at": share.expires_at.isoformat(),
            "max_accesses": share.max_accesses
        })


class TicketShareRevokeView(APIView):
    """
    POST /api/shares/revoke
    共有リンクを無効化
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = request.data.get('token')
        if not token:
            return Response(
                {"success": False, "message": "token is required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        share = TicketShareLink.objects.select_related('ticket__reservation').filter(
            token=token,
            revoked_at__isnull=True
        ).first()

        if not share or share.ticket.reservation.user != request.user:
            return Response(
                {"success": False, "message": "共有リンクが見つかりません"},
                status=status.HTTP_404_NOT_FOUND
            )

        share.revoked_at = timezone.now()
        share.save(update_fields=["revoked_at"])

        _log_admin_action(
            request,
            action="ticket_share_revoke",
            target_type="ticket",
            target_id=str(share.ticket_id)
        )

        return Response({"success": True})


class TicketShareDetailView(APIView):
    """
    GET /api/shares/<token>
    閲覧専用共有リンクの内容を取得
    """
    permission_classes = [AllowAny]
    throttle_classes = [ShareAccessThrottle]

    @transaction.atomic
    def get(self, request, token):
        share = TicketShareLink.objects.select_for_update().select_related(
            'ticket__reservation', 'ticket__slot', 'ticket__attribute'
        ).filter(token=token).first()
        if not share:
            return Response({"success": False, "message": "共有リンクが見つかりません"}, status=status.HTTP_404_NOT_FOUND)

        if not share.is_active():
            ShareLinkAccessLog.objects.create(
                share_link=share,
                ticket=share.ticket,
                ip_address=_get_client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", "")[:1000],
                success=False,
                message="invalid_or_expired",
            )
            return Response({"success": False, "message": "共有リンクの有効期限が切れています"}, status=status.HTTP_410_GONE)

        share.access_count = (share.access_count or 0) + 1
        share.last_accessed_at = timezone.now()
        share.save(update_fields=["access_count", "last_accessed_at"])

        ShareLinkAccessLog.objects.create(
            share_link=share,
            ticket=share.ticket,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", "")[:1000],
            success=True,
        )

        data = TicketSerializer(share.ticket).data

        return Response({
            "success": True,
            "ticket_id": str(share.ticket_id),
            "expires_at": share.expires_at.isoformat(),
            "access_count": share.access_count,
            "max_accesses": share.max_accesses,
            "ticket": data
        })


class WalletPassView(APIView):
    """
    GET /api/mypage/wallet-pass/<ticket_id>/
    Apple Wallet用のPKPassを発行する（要設定）
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, ticket_id):
        try:
            ticket = Ticket.objects.select_related('slot', 'attribute', 'reservation').get(id=ticket_id)
        except Ticket.DoesNotExist:
            return Response({"message": "チケットが見つかりません"}, status=status.HTTP_404_NOT_FOUND)

        # 権限チェック
        if not request.user.is_staff and ticket.reservation.user != request.user:
            return Response({"message": "権限がありません"}, status=status.HTTP_403_FORBIDDEN)

        missing = [k for k in PASSKIT_REQUIRED_ENV if not os.environ.get(k)]
        if missing:
            return Response(
                {
                    "message": "Apple Walletの発行設定が未完了です",
                    "missing": missing,
                },
                status=status.HTTP_501_NOT_IMPLEMENTED,
            )

        try:
            pass_data = build_pass_payload(ticket)
            pkpass_bytes = build_pkpass(pass_data)
        except Exception as e:
            return Response({"message": f"PKPass生成に失敗しました: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        response = HttpResponse(pkpass_bytes, content_type="application/vnd.apple.pkpass")
        response["Content-Disposition"] = f"attachment; filename=ticket-{ticket.id}.pkpass"
        return response




class AdminStatisticsView(APIView):
    """
    GET /api/admin/statistics/
    管理者用ダッシュボード統計情報
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        denied = _require_group(request, GROUP_ADMIN_READ)
        if denied:
            return denied
        total_reservations = Reservation.objects.count()
        total_tickets = Ticket.objects.count()
        checked_in_count = Ticket.objects.filter(status=Ticket.Status.ENTERED).count()
        cancelled_count = Ticket.objects.filter(status=Ticket.Status.CANCELLED).count()
        total_checkin_logs = CheckInLog.objects.count()
        failed_checkins = CheckInLog.objects.filter(success=False).count()
        total_emails = EmailDeliveryLog.objects.count()
        failed_emails = EmailDeliveryLog.objects.filter(success=False).count()
        admin_action_count = AdminActionLog.objects.count()
        share_access_count = ShareLinkAccessLog.objects.count()
        
        # Tickets by attribute
        tickets_by_attribute = Ticket.objects.values(
            'attribute__display_name'
        ).annotate(
            count=Count('id')
        ).order_by('-count')
        
        # Tickets by slot
        tickets_by_slot = Ticket.objects.values(
            'slot__event_date', 'slot__start_time'
        ).annotate(
            count=Count('id')
        ).order_by('slot__event_date', 'slot__start_time')

        sales_trend = _build_sales_trend()
        recent_activity_data = _build_recent_activity()

        share_spikes = ShareLinkAccessLog.objects.values('share_link_id', 'ticket_id').annotate(
            count=Count('id')
        ).filter(count__gte=20).order_by('-count')[:10]

        duplicate_checkins = CheckInLog.objects.values('ticket_id').annotate(
            total=Count('id'),
            device_count=Count('device_id', distinct=True)
        ).filter(device_count__gt=1).order_by('-device_count')[:10]

        return Response({
            "summary": {
                "total_reservations": total_reservations,
                "total_tickets": total_tickets,
                "checked_in_count": checked_in_count,
                "cancelled_count": cancelled_count,
                "check_in_rate": round((checked_in_count / total_tickets * 100), 1) if total_tickets > 0 else 0,
                "checkin_error_rate": round((failed_checkins / total_checkin_logs * 100), 1) if total_checkin_logs > 0 else 0,
                "email_failure_rate": round((failed_emails / total_emails * 100), 1) if total_emails > 0 else 0,
                "admin_action_count": admin_action_count,
                "share_access_count": share_access_count,
            },
            "by_attribute": tickets_by_attribute,
            "by_slot": tickets_by_slot,
            "sales_trend": sales_trend,
            "recent_activity": recent_activity_data,
            "anomalies": {
                "share_spikes": list(share_spikes),
                "duplicate_checkins": list(duplicate_checkins),
            }
        })


@method_decorator(staff_member_required, name='dispatch')
class AdminDashboardPageView(View):
    """
    GET /admin/dashboard/
    管理者用ダッシュボードページ（HTML）
    """
    def get(self, request):
        total_reservations = Reservation.objects.count()
        total_tickets = Ticket.objects.count()
        checked_in_count = Ticket.objects.filter(status=Ticket.Status.ENTERED).count()
        cancelled_count = Ticket.objects.filter(status=Ticket.Status.CANCELLED).count()
        
        tickets_by_attribute = list(Ticket.objects.values(
            'attribute__display_name'
        ).annotate(
            count=Count('id')
        ).order_by('-count'))
        
        tickets_by_slot = list(Ticket.objects.values(
            'slot__event_date', 'slot__start_time'
        ).annotate(
            count=Count('id')
        ).order_by('slot__event_date', 'slot__start_time'))
        
        # Convert time objects to string for JSON serialization
        for slot in tickets_by_slot:
            slot['slot__event_date'] = str(slot['slot__event_date'])
            slot['slot__start_time'] = str(slot['slot__start_time'])

        sales_trend = _build_sales_trend()
        recent_activity_data = _build_recent_activity()

        # All Tickets (for Visitor List)
        all_tickets = Ticket.objects.select_related('reservation', 'attribute', 'slot').order_by('-created_at')

        summary = {
            "total_reservations": total_reservations,
            "total_tickets": total_tickets,
            "checked_in_count": checked_in_count,
            "cancelled_count": cancelled_count,
            "check_in_rate": round((checked_in_count / total_tickets * 100), 1) if total_tickets > 0 else 0
        }

        context = {
            "summary": summary,
            "summary_json": json.dumps(summary),
            "by_attribute_json": json.dumps(tickets_by_attribute),
            "by_slot_json": json.dumps(tickets_by_slot, cls=DjangoJSONEncoder),
            "sales_trend_json": json.dumps(sales_trend),
            "recent_activity": recent_activity_data,
            "all_tickets": all_tickets,
            "title": "統計ダッシュボード"
        }
        
        return render(request, 'admin/statistics.html', context)


# === CSV Export Views ===

@method_decorator(staff_member_required, name='dispatch')
class AdminCSVExportView(View):
    """
    GET /admin/export/csv/
    予約・チケット情報をCSV形式でエクスポート
    """
    def get(self, request):
        export_type = request.GET.get('type', 'tickets')
        
        response = HttpResponse(content_type='text/csv; charset=utf-8-sig')
        response['Content-Disposition'] = f'attachment; filename="{export_type}_{timezone.now().strftime("%Y%m%d_%H%M%S")}.csv"'
        
        writer = csv.writer(response)
        
        if export_type == 'reservations':
            writer.writerow(['予約ID', '予約者氏名', '予約者メール', 'チケット数', 'ユーザーID', '予約日時'])
            reservations = Reservation.objects.all().select_related('user').order_by('-created_at')
            for r in reservations:
                writer.writerow([
                    str(r.id), 
                    r.user_name, 
                    r.user_email, 
                    r.total_tickets,
                    r.user.username if r.user else '',
                    r.created_at.strftime('%Y-%m-%d %H:%M:%S')
                ])
        elif export_type == 'checkins':
            writer.writerow(['チケットID', '入場者名', '入場日', '入場枠', '予約者名', 'チケット種別', 'ステータス', '入場日時'])
            tickets = Ticket.objects.filter(status=Ticket.Status.ENTERED).select_related(
                'slot', 'attribute', 'reservation'
            ).order_by('-entered_at')
            for t in tickets:
                guest_name = t.guest_info.get('name', '') if t.guest_info else ''
                writer.writerow([
                    str(t.id), 
                    guest_name,
                    str(t.slot.event_date), 
                    f"{t.slot.start_time.strftime('%H:%M')}-{t.slot.end_time.strftime('%H:%M')}",
                    t.reservation.user_name, 
                    t.attribute.display_name,
                    t.get_status_display(),
                    t.entered_at.strftime('%Y-%m-%d %H:%M:%S') if t.entered_at else ''
                ])
        else:  # tickets
            writer.writerow(['チケットID', '入場者名', '入場日', '入場枠', '予約者名', '予約者メール', 'チケット種別', 'ステータス', '入場者情報', '作成日時'])
            tickets = Ticket.objects.all().select_related(
                'slot', 'attribute', 'reservation'
            ).order_by('-created_at')
            for t in tickets:
                guest_name = t.guest_info.get('name', '') if t.guest_info else ''
                # guest_infoの他のフィールドをまとめる
                other_info = ''
                if t.guest_info:
                    other_fields = {k: v for k, v in t.guest_info.items() if k != 'name' and v}
                    if other_fields:
                        other_info = ', '.join([f"{k}:{v}" for k, v in other_fields.items()])
                writer.writerow([
                    str(t.id), 
                    guest_name,
                    str(t.slot.event_date),
                    f"{t.slot.start_time.strftime('%H:%M')}-{t.slot.end_time.strftime('%H:%M')}",
                    t.reservation.user_name,
                    t.reservation.user_email,
                    t.attribute.display_name, 
                    t.get_status_display(),
                    other_info,
                    t.created_at.strftime('%Y-%m-%d %H:%M:%S')
                ])
        
        return response


# === Manual Check-in View ===

class ManualCheckInView(APIView):
    """
    POST /api/admin/manual-checkin/
    管理者による手動チェックイン（名前・メール検索）
    """
    permission_classes = [IsAdminUser]
    
    def get(self, request):
        """検索機能"""
        query = request.query_params.get('q', '')
        if len(query) < 2:
            return Response({"results": []})
        
        tickets = Ticket.objects.filter(
            models.Q(id__icontains=query) |
            models.Q(reservation__user_name__icontains=query) |
            models.Q(reservation__user_email__icontains=query) |
            models.Q(guest_info__name__icontains=query)
        ).select_related(
            'slot', 'attribute', 'reservation'
        ).order_by('-created_at')[:20]
        
        return Response({
            "results": TicketSerializer(tickets, many=True).data
        })
    
    @transaction.atomic
    def post(self, request):
        setting = SystemSetting.get_instance()
        blocked = _check_checkin_block(setting)
        if blocked:
            return blocked
        """手動チェックイン実行"""
        ticket_id = request.data.get('ticket_id')
        # 🔒 セキュリティ修正: operatorは常にログインユーザーから取得（偽装防止）
        operator = request.user.username
        
        try:
            ticket = Ticket.objects.select_for_update().get(id=ticket_id)
        except Ticket.DoesNotExist:
            return Response(
                {"success": False, "message": "チケットが見つかりません"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        block_info = _get_checkin_block_info(ticket)
        if block_info:
            message = "このチケットはキャンセル済みです" if block_info["action"] == "cancelled" else block_info["message"]
            return Response(
                {"success": False, "message": message},
                status=block_info["http_status"]
            )
        
        ticket.status = Ticket.Status.ENTERED
        ticket.entered_at = timezone.now()
        ticket.save()
        
        CheckInLog.objects.create(
            ticket=ticket,
            action='manual_checkin',
            success=True,
            message='管理者による手動チェックイン',
            operator=operator
        )
        
        return Response({
            "success": True,
            "message": "入場処理が完了しました",
            "ticket": TicketSerializer(ticket).data
        })


# === Real-time Monitor View ===

class RealtimeMonitorView(APIView):
    """
    GET /api/admin/realtime-monitor/
    リアルタイム入場状況モニター
    """
    permission_classes = [IsAdminUser]
    
    def get(self, request):
        # Current stats
        total_tickets = Ticket.objects.exclude(status=Ticket.Status.CANCELLED).count()
        entered_count = Ticket.objects.filter(status=Ticket.Status.ENTERED).count()
        
        # Stats by slot (today only by default)
        today = timezone.now().date()
        slot_filter = request.query_params.get('date', str(today))
        
        slots_data = []
        slots = EntrySlot.objects.filter(event_date=slot_filter, is_active=True)
        for slot in slots:
            slot_tickets = Ticket.objects.filter(slot=slot).exclude(status=Ticket.Status.CANCELLED)
            slot_entered = slot_tickets.filter(status=Ticket.Status.ENTERED).count()
            slot_total = slot_tickets.count()
            
            slots_data.append({
                "slot_id": str(slot.id),
                "start_time": str(slot.start_time),
                "end_time": str(slot.end_time) if slot.end_time else None,
                "capacity": slot.capacity,
                "booked": slot_total,
                "entered": slot_entered,
                "entry_rate": round((slot_entered / slot_total * 100), 1) if slot_total > 0 else 0
            })
        
        # Recent check-ins (last 10)
        recent_checkins = CheckInLog.objects.filter(
            success=True,
            action__in=['checkin', 'manual_checkin']
        ).select_related('ticket__reservation').order_by('-created_at')[:10]
        
        recent_data = [{
            "ticket_id": str(log.ticket_id),
            "name": log.ticket.reservation.user_name if log.ticket else '',
            "action": log.action,
            "time": log.created_at.strftime('%H:%M:%S')
        } for log in recent_checkins]
        
        return Response({
            "summary": {
                "total_tickets": total_tickets,
                "entered_count": entered_count,
                "remaining": total_tickets - entered_count,
                "entry_rate": round((entered_count / total_tickets * 100), 1) if total_tickets > 0 else 0
            },
            "slots": slots_data,
            "recent_checkins": recent_data,
            "timestamp": timezone.now().isoformat()
        })


# === Announcement Views ===

class AnnouncementViewSet(viewsets.ModelViewSet):
    """
    お知らせ管理 CRUD
    GET /api/announcements/ - 有効なお知らせ一覧（公開）
    POST /api/announcements/ - 新規作成（管理者のみ）
    """
    queryset = Announcement.objects.all()
    serializer_class = AnnouncementSerializer
    
    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAdminUser()]
    
    def get_queryset(self):
        if self.request.user.is_staff:
            return Announcement.objects.all()
        return Announcement.objects.filter(is_active=True)


# === Chat Views ===

class ChatMessageView(APIView):
    """
    GET /api/chat/messages - チャットメッセージ一覧を取得
    POST /api/chat/messages - チャットメッセージを送信
    
    Query params:
      - limit: 取得件数 (default: 50, max: 100)
      - before: このcreated_at(ISO形式)以前のメッセージを取得（過去ログ読み込み用）
    
    レスポンス: 配列形式（フロント互換維持）
    ページネーション情報は X-Has-More / X-Oldest-Id ヘッダで返す
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        limit = min(int(request.query_params.get('limit', 50)), 100)
        before = request.query_params.get('before')  # ISO datetime string
        
        queryset = ChatMessage.objects.select_related('sender').order_by('-created_at')
        
        # created_at ベースのカーソル（UUIDではなく時刻で安定させる）
        before_dt = _parse_before_datetime(before)
        if before_dt:
            queryset = queryset.filter(created_at__lt=before_dt)
        
        # limit+1 方式で has_more を判定（count() より効率的）
        messages, has_more = _paginate_with_has_more(queryset, limit)
        
        data = [msg.to_payload() for msg in reversed(messages)]
        
        # 配列形式で返す（フロント互換維持）
        # ページネーション情報はヘッダで返す
        return _build_chat_response(data, messages, has_more)
    
    def post(self, request):
        content = request.data.get('content', '').strip()
        if not content:
            return Response(
                {"success": False, "message": "メッセージを入力してください。"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if len(content) > 500:
            return Response(
                {"success": False, "message": "メッセージは500文字以内で入力してください。"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        msg = ChatMessage.objects.create(
            sender=request.user,
            content=content
        )
        
        return Response(msg.to_payload(), status=status.HTTP_201_CREATED)


class ChatUnreadCountView(APIView):
    """
    GET /api/chat/unread
    未読メッセージ数を取得
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        try:
            read_status = ChatMessageRead.objects.get(user=request.user)
            last_read_at = read_status.last_read_at
        except ChatMessageRead.DoesNotExist:
            # 一度も既読にしていない場合は全て未読
            last_read_at = None
        
        if last_read_at:
            unread_count = ChatMessage.objects.filter(
                created_at__gt=last_read_at
            ).exclude(sender=request.user).count()
        else:
            unread_count = ChatMessage.objects.exclude(sender=request.user).count()
        
        return Response({
            "unread_count": unread_count,
            "last_read_at": last_read_at.isoformat() if last_read_at else None
        })
    
    def post(self, request):
        """全て既読にする"""
        ChatMessageRead.objects.update_or_create(
            user=request.user,
            defaults={"last_read_at": timezone.now()}
        )
        return Response({"success": True, "message": "全て既読にしました"})


# === System Administration Views ===

from django.conf import settings as django_settings


class SystemHealthView(APIView):
    """
    GET /api/admin/system/health
    詳細なシステムヘルスチェック
    """
    permission_classes = [IsAdminUser]
    
    def get(self, request):
        denied = _require_group(request, GROUP_ADMIN_READ)
        if denied:
            return denied
        health_data = {
            'timestamp': timezone.now().isoformat(),
            'status': 'healthy',
            'checks': {}
        }
        
        # Database check
        try:
            from django.db import connection
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
            health_data['checks']['database'] = {
                'status': 'healthy',
                'message': 'Database connection successful'
            }
        except Exception as e:
            health_data['checks']['database'] = {
                'status': 'unhealthy',
                'message': str(e)
            }
            health_data['status'] = 'unhealthy'
        
        # Disk space check
        try:
            base_path = django_settings.BASE_DIR
            total, used, free = shutil.disk_usage(base_path)
            disk_percent = (used / total) * 100
            health_data['checks']['disk'] = {
                'status': 'healthy' if disk_percent < 90 else 'warning',
                'total_gb': round(total / (1024**3), 2),
                'used_gb': round(used / (1024**3), 2),
                'free_gb': round(free / (1024**3), 2),
                'percent_used': round(disk_percent, 2)
            }
        except Exception as e:
            health_data['checks']['disk'] = {
                'status': 'error',
                'message': str(e)
            }
        
        # Memory usage (if psutil available)
        try:
            import psutil
            memory = psutil.virtual_memory()
            health_data['checks']['memory'] = {
                'status': 'healthy' if memory.percent < 90 else 'warning',
                'total_gb': round(memory.total / (1024**3), 2),
                'used_gb': round(memory.used / (1024**3), 2),
                'available_gb': round(memory.available / (1024**3), 2),
                'percent_used': memory.percent
            }
        except ImportError:
            health_data['checks']['memory'] = {
                'status': 'unknown',
                'message': 'psutil not installed'
            }
        
        # Database size
        try:
            db_path = os.path.join(django_settings.BASE_DIR, 'db.sqlite3')
            if os.path.exists(db_path):
                db_size = os.path.getsize(db_path)
                health_data['checks']['database_size'] = {
                    'size_mb': round(db_size / (1024**2), 2),
                    'path': db_path
                }
        except Exception as e:
            pass
        
        # Application stats
        health_data['checks']['app_stats'] = {
            'total_users': User.objects.count(),
            'total_tickets': Ticket.objects.count(),
            'total_reservations': Reservation.objects.count(),
            'active_slots': EntrySlot.objects.filter(is_active=True).count()
        }
        
        return Response(health_data)


class DatabaseBackupView(APIView):
    """
    POST /api/admin/system/backup
    データベースバックアップを作成
    GET /api/admin/system/backup
    バックアップ一覧を取得
    """
    permission_classes = [IsAdminUser]
    
    def get(self, request):
        """バックアップ一覧を取得"""
        denied = _require_group(request, GROUP_ADMIN_READ)
        if denied:
            return denied
        backup_dir = os.path.join(django_settings.BASE_DIR, 'backups')
        backups = []
        
        if os.path.exists(backup_dir):
            for filename in sorted(os.listdir(backup_dir), reverse=True):
                if filename.endswith('.sqlite3') or filename.endswith('.json'):
                    filepath = os.path.join(backup_dir, filename)
                    stat = os.stat(filepath)
                    backups.append({
                        'filename': filename,
                        'size_mb': round(stat.st_size / (1024**2), 2),
                        'created_at': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    })
        
        return Response({
            'backups': backups[:20],  # 最新20件
            'backup_directory': backup_dir
        })
    
    def post(self, request):
        """バックアップを作成"""
        denied = _require_group(request, GROUP_ADMIN_OPS)
        if denied:
            return denied
        backup_type = request.data.get('type', 'sqlite')
        
        backup_dir = os.path.join(django_settings.BASE_DIR, 'backups')
        os.makedirs(backup_dir, exist_ok=True)
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        try:
            if backup_type == 'sqlite':
                # SQLiteファイルをコピー
                src = os.path.join(django_settings.BASE_DIR, 'db.sqlite3')
                dst = os.path.join(backup_dir, f'backup_{timestamp}.sqlite3')
                shutil.copy2(src, dst)
                
                response = Response({
                    'success': True,
                    'message': 'バックアップを作成しました',
                    'filename': f'backup_{timestamp}.sqlite3',
                    'path': dst,
                    'size_mb': round(os.path.getsize(dst) / (1024**2), 2)
                }, status=status.HTTP_201_CREATED)
                _log_admin_action(
                    request,
                    action="backup_create",
                    target_type="backup",
                    target_id=f'backup_{timestamp}.sqlite3',
                    metadata={
                        "type": "sqlite",
                        "size_mb": round(os.path.getsize(dst) / (1024**2), 2),
                    },
                )
                return response
            
            elif backup_type == 'json':
                # JSONダンプ
                dst = os.path.join(backup_dir, f'backup_{timestamp}.json')
                from django.core import serializers
                
                data = {
                    'users': json.loads(serializers.serialize('json', User.objects.all())),
                    'slots': json.loads(serializers.serialize('json', EntrySlot.objects.all())),
                    'attributes': json.loads(serializers.serialize('json', AttributeConfig.objects.all())),
                    'reservations': json.loads(serializers.serialize('json', Reservation.objects.all())),
                    'tickets': json.loads(serializers.serialize('json', Ticket.objects.all())),
                    'announcements': json.loads(serializers.serialize('json', Announcement.objects.all())),
                    'timestamp': timestamp
                }
                
                with open(dst, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2, cls=DjangoJSONEncoder)
                
                response = Response({
                    'success': True,
                    'message': 'JSONバックアップを作成しました',
                    'filename': f'backup_{timestamp}.json',
                    'path': dst,
                    'size_mb': round(os.path.getsize(dst) / (1024**2), 2)
                }, status=status.HTTP_201_CREATED)
                _log_admin_action(
                    request,
                    action="backup_create",
                    target_type="backup",
                    target_id=f'backup_{timestamp}.json',
                    metadata={
                        "type": "json",
                        "size_mb": round(os.path.getsize(dst) / (1024**2), 2),
                    },
                )
                return response
            
            else:
                return Response({
                    'success': False,
                    'message': 'Invalid backup type. Use "sqlite" or "json"'
                }, status=status.HTTP_400_BAD_REQUEST)
                
        except Exception as e:
            return Response({
                'success': False,
                'message': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def delete(self, request):
        """バックアップを削除"""
        denied = _require_group(request, GROUP_ADMIN_OPS)
        if denied:
            return denied
        filename = request.data.get('filename')
        if not filename:
            return Response({'success': False, 'message': 'filename is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        backup_dir = os.path.join(django_settings.BASE_DIR, 'backups')
        filepath = os.path.join(backup_dir, filename)
        
        # セキュリティ: パス外のファイルを削除させない
        if not os.path.abspath(filepath).startswith(os.path.abspath(backup_dir)):
            return Response({'success': False, 'message': 'Invalid filename'}, status=status.HTTP_400_BAD_REQUEST)
        
        if os.path.exists(filepath):
            os.remove(filepath)
            _log_admin_action(
                request,
                action="backup_delete",
                target_type="backup",
                target_id=filename,
            )
            return Response({'success': True, 'message': f'{filename} を削除しました'})
        else:
            return Response({'success': False, 'message': 'File not found'}, status=status.HTTP_404_NOT_FOUND)


class SystemLogsView(APIView):
    """
    GET /api/admin/system/logs
    システムログを取得
    """
    permission_classes = [IsAdminUser]
    
    def get(self, request):
        denied = _require_group(request, GROUP_ADMIN_READ)
        if denied:
            return denied
        log_type = request.query_params.get('type', 'checkin')
        limit = int(request.query_params.get('limit', 100))
        
        if log_type == 'checkin':
            logs = CheckInLog.objects.select_related('ticket').order_by('-created_at')[:limit]
            return Response({
                'logs': [
                    {
                        'id': log.id,
                        'ticket_id': str(log.ticket.id),
                        'created_at': log.created_at.isoformat(),
                        'device_id': log.device_id,
                        'operator': log.operator
                    }
                    for log in logs
                ]
            })

        if log_type == 'admin':
            logs = AdminActionLog.objects.select_related('actor').order_by('-created_at')[:limit]
            return Response({
                'logs': [
                    {
                        'id': str(log.id),
                        'action': log.action,
                        'target_type': log.target_type,
                        'target_id': log.target_id,
                        'metadata': log.metadata,
                        'actor': log.actor.username if log.actor else None,
                        'created_at': log.created_at.isoformat(),
                    }
                    for log in logs
                ]
            })
        
        return Response({'logs': []})


class AdminAuditSearchView(APIView):
    """
    GET /api/admin/audit/search
    監査ログの横断検索
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        denied = _require_any_group(request, [GROUP_ADMIN_READ, "admin_audit"])
        if denied:
            return denied

        start = parse_datetime(request.query_params.get('from'))
        end = parse_datetime(request.query_params.get('to'))
        actor = request.query_params.get('actor')
        user_id = request.query_params.get('user_id')
        ticket_id = request.query_params.get('ticket_id')
        log_type = request.query_params.get('type')

        items = []

        if not log_type or log_type == 'admin':
            logs = AdminActionLog.objects.select_related('actor').all()
            if start:
                logs = logs.filter(created_at__gte=start)
            if end:
                logs = logs.filter(created_at__lte=end)
            if actor:
                logs = logs.filter(actor__username__icontains=actor)
            if user_id:
                logs = logs.filter(
                    models.Q(target_type="user", target_id=str(user_id)) |
                    models.Q(metadata__user_id=str(user_id))
                )
            if ticket_id:
                logs = logs.filter(
                    models.Q(target_type="ticket", target_id=str(ticket_id)) |
                    models.Q(metadata__ticket_id=str(ticket_id))
                )
            for log in logs[:500]:
                before = log.metadata.get("before") if isinstance(log.metadata, dict) else None
                after = log.metadata.get("after") if isinstance(log.metadata, dict) else None
                diff = _build_diff(before, after) if isinstance(before, dict) and isinstance(after, dict) else {}
                items.append({
                    "type": "admin",
                    "id": str(log.id),
                    "action": log.action,
                    "actor": log.actor.username if log.actor else None,
                    "target_type": log.target_type,
                    "target_id": log.target_id,
                    "ticket_id": log.metadata.get("ticket_id") if isinstance(log.metadata, dict) else None,
                    "user_id": log.metadata.get("user_id") if isinstance(log.metadata, dict) else None,
                    "message": log.metadata.get("message") if isinstance(log.metadata, dict) else "",
                    "metadata": log.metadata or {},
                    "diff": diff,
                    "created_at": log.created_at.isoformat(),
                })

        if not log_type or log_type == 'checkin':
            logs = CheckInLog.objects.select_related('ticket__reservation').all()
            if start:
                logs = logs.filter(created_at__gte=start)
            if end:
                logs = logs.filter(created_at__lte=end)
            if actor:
                logs = logs.filter(operator__icontains=actor)
            if ticket_id:
                logs = logs.filter(ticket__id=ticket_id)
            for log in logs[:500]:
                items.append({
                    "type": "checkin",
                    "id": str(log.id),
                    "action": log.action,
                    "actor": log.operator,
                    "ticket_id": str(log.ticket_id),
                    "user_id": log.ticket.reservation.user_id if log.ticket and log.ticket.reservation else None,
                    "message": log.message,
                    "metadata": {"device_id": log.device_id, "success": log.success},
                    "diff": {},
                    "created_at": log.created_at.isoformat(),
                })

        if not log_type or log_type == 'email':
            logs = EmailDeliveryLog.objects.select_related('reservation', 'ticket', 'created_by').all()
            if start:
                logs = logs.filter(created_at__gte=start)
            if end:
                logs = logs.filter(created_at__lte=end)
            if actor:
                logs = logs.filter(created_by__username__icontains=actor)
            if ticket_id:
                logs = logs.filter(ticket_id=ticket_id)
            if user_id:
                logs = logs.filter(reservation__user_id=user_id)
            for log in logs[:500]:
                items.append({
                    "type": "email",
                    "id": str(log.id),
                    "action": "email_send",
                    "actor": log.created_by.username if log.created_by else None,
                    "ticket_id": str(log.ticket_id) if log.ticket_id else None,
                    "user_id": log.reservation.user_id if log.reservation else None,
                    "message": log.provider_message,
                    "metadata": {
                        "to_email": log.to_email,
                        "subject": log.subject,
                        "mode": log.mode,
                        "success": log.success,
                    },
                    "diff": {},
                    "created_at": log.created_at.isoformat(),
                })

        if not log_type or log_type == 'share':
            logs = ShareLinkAccessLog.objects.select_related('ticket', 'share_link').all()
            if start:
                logs = logs.filter(created_at__gte=start)
            if end:
                logs = logs.filter(created_at__lte=end)
            if ticket_id:
                logs = logs.filter(ticket_id=ticket_id)
            for log in logs[:500]:
                items.append({
                    "type": "share",
                    "id": str(log.id),
                    "action": "share_access",
                    "actor": None,
                    "ticket_id": str(log.ticket_id),
                    "user_id": log.ticket.reservation.user_id if log.ticket and log.ticket.reservation else None,
                    "message": log.message,
                    "metadata": {
                        "ip_address": log.ip_address,
                        "user_agent": log.user_agent,
                        "success": log.success,
                    },
                    "diff": {},
                    "created_at": log.created_at.isoformat(),
                })

        items = sorted(items, key=lambda x: x["created_at"], reverse=True)[:500]

        return Response({"logs": items})


class AdminAuditExportView(APIView):
    """
    GET /api/admin/audit/export
    監査ログCSV出力
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        denied = _require_any_group(request, [GROUP_ADMIN_READ, "admin_audit"])
        if denied:
            return denied

        data = AdminAuditSearchView().get(request).data.get("logs", [])
        if not data:
            return Response({"success": False, "message": "No data to export"}, status=status.HTTP_404_NOT_FOUND)

        response = HttpResponse(content_type='text/csv; charset=utf-8-sig')
        response['Content-Disposition'] = f'attachment; filename="audit_{timezone.now().strftime("%Y%m%d_%H%M%S")}.csv"'
        writer = csv.writer(response)
        writer.writerow(["type", "action", "actor", "user_id", "ticket_id", "message", "created_at"])
        for row in data:
            writer.writerow([
                row.get("type"), row.get("action"), row.get("actor"),
                row.get("user_id"), row.get("ticket_id"), row.get("message"),
                row.get("created_at"),
            ])

        _log_admin_action(
            request,
            action="audit_export",
            target_type="audit",
            metadata={"count": len(data)},
        )

        return response


class AdminSupportSearchView(APIView):
    """
    GET /api/admin/support/search
    顧客サポート用検索
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        denied = _require_any_group(request, [GROUP_ADMIN_READ, "admin_support"])
        if denied:
            return denied

        query = request.query_params.get('q', '').strip()
        if len(query) < 2:
            return Response({"success": True, "results": []})

        user = None
        reservation = None
        ticket = None

        if query.startswith("R-"):
            reservation = Reservation.objects.filter(id=query).first()
            user = reservation.user if reservation else None
        else:
            ticket = Ticket.objects.filter(id=query).select_related('reservation').first()
            if ticket:
                reservation = ticket.reservation
                user = reservation.user if reservation else None
            if not user:
                user = User.objects.filter(models.Q(username__icontains=query) | models.Q(email__icontains=query)).first()

        if not reservation and user:
            reservation = Reservation.objects.filter(user=user).order_by('-created_at').first()

        reservations = Reservation.objects.filter(user=user).prefetch_related('tickets').order_by('-created_at') if user else []
        tickets = Ticket.objects.filter(reservation__user=user).select_related('slot', 'attribute', 'reservation') if user else []
        checkins = CheckInLog.objects.filter(ticket__reservation__user=user).order_by('-created_at')[:50] if user else []
        share_links = TicketShareLink.objects.filter(ticket__reservation__user=user).order_by('-created_at')[:50] if user else []
        email_logs = EmailDeliveryLog.objects.filter(reservation__user=user).order_by('-created_at')[:50] if user else []

        profile = None
        if user:
            profile, _ = UserProfile.objects.get_or_create(user=user)

        return Response({
            "success": True,
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "is_active": user.is_active,
            } if user else None,
            "profile": {
                "support_note": profile.support_note,
                "verification_status": profile.verification_status,
                "verification_note": profile.verification_note,
                "verification_updated_at": profile.verification_updated_at.isoformat() if profile and profile.verification_updated_at else None,
            } if profile else None,
            "reservations": ReservationListSerializer(reservations, many=True).data if reservations else [],
            "tickets": TicketSerializer(tickets, many=True).data if tickets else [],
            "checkins": [
                {
                    "id": str(log.id),
                    "ticket_id": str(log.ticket_id),
                    "action": log.action,
                    "success": log.success,
                    "message": log.message,
                    "created_at": log.created_at.isoformat(),
                }
                for log in checkins
            ],
            "share_links": [
                {
                    "id": str(link.id),
                    "token": link.token,
                    "ticket_id": str(link.ticket_id),
                    "expires_at": link.expires_at.isoformat(),
                    "revoked_at": link.revoked_at.isoformat() if link.revoked_at else None,
                    "access_count": link.access_count,
                    "max_accesses": link.max_accesses,
                }
                for link in share_links
            ],
            "email_logs": [
                {
                    "id": str(log.id),
                    "to_email": log.to_email,
                    "subject": log.subject,
                    "mode": log.mode,
                    "success": log.success,
                    "created_at": log.created_at.isoformat(),
                }
                for log in email_logs
            ],
        })


class AdminSupportActionView(APIView):
    """
    POST /api/admin/support/action
    顧客サポート操作
    """
    permission_classes = [IsAdminUser]

    def post(self, request):
        denied = _require_any_group(request, ["admin_support", GROUP_ADMIN_OPS])
        if denied:
            return denied

        action = request.data.get("action")
        if action == "resend_confirmation":
            reservation_id = request.data.get("reservation_id")
            reservation = Reservation.objects.prefetch_related('tickets__slot', 'tickets__attribute').filter(id=reservation_id).first()
            if not reservation or not reservation.user_email:
                return Response({"success": False, "message": "予約が見つからないか、メールが未設定です"}, status=status.HTTP_404_NOT_FOUND)

            from .email_service import email_service
            ticket_rows = []
            for t in reservation.tickets.all():
                ticket_rows.append({
                    'guest_name': t.guest_info.get('name', '未入力') if t.guest_info else '未入力',
                    'slot_date': t.slot.event_date.isoformat() if t.slot else '',
                    'slot_time': t.slot.start_time.strftime('%H:%M') if t.slot else '',
                    'attribute_name': t.attribute.display_name if t.attribute else ''
                })
            user_name = reservation.user_name or reservation.guest_identifier or "お客様"
            result = email_service.send_reservation_confirmation(
                reservation.user_email,
                reservation.id,
                user_name,
                ticket_rows,
                context={"reservation": reservation, "created_by": request.user}
            )

            _log_admin_action(
                request,
                action="support_resend_confirmation",
                target_type="reservation",
                target_id=str(reservation.id),
            )

            return Response({"success": True, "result": result})

        if action == "revoke_share":
            token = request.data.get("token")
            share = TicketShareLink.objects.filter(token=token, revoked_at__isnull=True).first()
            if not share:
                return Response({"success": False, "message": "共有リンクが見つかりません"}, status=status.HTTP_404_NOT_FOUND)
            share.revoked_at = timezone.now()
            share.save(update_fields=["revoked_at"])
            _log_admin_action(
                request,
                action="support_share_revoke",
                target_type="ticket",
                target_id=str(share.ticket_id),
            )
            return Response({"success": True})

        if action == "update_note":
            user_id = request.data.get("user_id")
            note = request.data.get("note", "")
            user = User.objects.filter(id=user_id).first()
            if not user:
                return Response({"success": False, "message": "ユーザーが見つかりません"}, status=status.HTTP_404_NOT_FOUND)
            profile, _ = UserProfile.objects.get_or_create(user=user)
            profile.support_note = note
            profile.save(update_fields=["support_note", "updated_at"])
            _log_admin_action(
                request,
                action="support_note_update",
                target_type="user",
                target_id=str(user.id),
            )
            return Response({"success": True})

        if action == "update_verification":
            user_id = request.data.get("user_id")
            status_value = request.data.get("status")
            note = request.data.get("note", "")
            user = User.objects.filter(id=user_id).first()
            if not user:
                return Response({"success": False, "message": "ユーザーが見つかりません"}, status=status.HTTP_404_NOT_FOUND)
            profile, _ = UserProfile.objects.get_or_create(user=user)
            if status_value and status_value not in UserProfile.VerificationStatus.values:
                return Response({"success": False, "message": "Invalid status"}, status=status.HTTP_400_BAD_REQUEST)
            profile.verification_status = status_value or profile.verification_status
            profile.verification_note = note
            profile.verification_updated_at = timezone.now()
            profile.verification_updated_by = request.user
            profile.save(update_fields=["verification_status", "verification_note", "verification_updated_at", "verification_updated_by", "updated_at"])
            _log_admin_action(
                request,
                action="support_verification_update",
                target_type="user",
                target_id=str(user.id),
                metadata={"status": profile.verification_status},
            )
            return Response({"success": True})

        return Response({"success": False, "message": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)


class AdminBulkOperationView(APIView):
    """
    POST /api/admin/bulk
    一括オペレーション
    """
    permission_classes = [IsAdminUser]

    def post(self, request):
        denied = _require_any_group(request, ["admin_bulk", GROUP_ADMIN_OPS])
        if denied:
            return denied

        action = request.data.get("action")
        if action == "close_entry":
            slot_id = request.data.get("slot_id")
            slot = EntrySlot.objects.filter(id=slot_id).first()
            if not slot:
                return Response({"success": False, "message": "入場枠が見つかりません"}, status=status.HTTP_404_NOT_FOUND)
            slot.entry_closed = True
            slot.save(update_fields=["entry_closed"])
            _log_admin_action(request, action="bulk_close_entry", target_type="slot", target_id=str(slot.id))
            return Response({"success": True})

        if action == "open_entry":
            slot_id = request.data.get("slot_id")
            slot = EntrySlot.objects.filter(id=slot_id).first()
            if not slot:
                return Response({"success": False, "message": "入場枠が見つかりません"}, status=status.HTTP_404_NOT_FOUND)
            slot.entry_closed = False
            slot.save(update_fields=["entry_closed"])
            _log_admin_action(request, action="bulk_open_entry", target_type="slot", target_id=str(slot.id))
            return Response({"success": True})

        if action == "checkin_revert":
            slot_id = request.data.get("slot_id")
            with transaction.atomic():
                tickets = Ticket.objects.select_for_update().filter(slot_id=slot_id, status=Ticket.Status.ENTERED)
                count = tickets.count()
                tickets.update(status=Ticket.Status.VALID, entered_at=None)
            _log_admin_action(request, action="bulk_checkin_revert", target_type="slot", target_id=str(slot_id), metadata={"count": count})
            return Response({"success": True, "count": count})

        if action == "move_slot":
            from_slot_id = request.data.get("from_slot_id")
            to_slot_id = request.data.get("to_slot_id")
            if not from_slot_id or not to_slot_id:
                return Response({"success": False, "message": "slot_id is required"}, status=status.HTTP_400_BAD_REQUEST)
            with transaction.atomic():
                to_slot = EntrySlot.objects.select_for_update().get(id=to_slot_id)
                tickets = Ticket.objects.select_for_update().filter(slot_id=from_slot_id)
                count = tickets.count()
                if to_slot.remaining < count:
                    return Response({"success": False, "message": "移動先の残枠が不足しています"}, status=status.HTTP_409_CONFLICT)
                tickets.update(slot_id=to_slot_id)
                to_slot.booked_count += count
                to_slot.save(update_fields=["booked_count"])
                EntrySlot.objects.filter(id=from_slot_id).update(booked_count=models.F('booked_count') - count)
            _log_admin_action(request, action="bulk_move_slot", target_type="slot", target_id=str(to_slot_id), metadata={"count": count, "from": from_slot_id})
            return Response({"success": True, "count": count})

        if action == "reminder_email":
            slot_id = request.data.get("slot_id")
            if not slot_id:
                return Response({"success": False, "message": "slot_id is required"}, status=status.HTTP_400_BAD_REQUEST)
            reservations = Reservation.objects.filter(tickets__slot_id=slot_id).distinct()
            from .email_service import email_service
            sent = 0
            for reservation in reservations:
                if not reservation.user_email:
                    continue
                result = email_service.send_reservation_confirmation(
                    reservation.user_email,
                    reservation.id,
                    reservation.user_name or reservation.guest_identifier or "お客様",
                    [],
                    context={"reservation": reservation, "created_by": request.user}
                )
                sent += 1
            _log_admin_action(request, action="bulk_reminder_email", target_type="slot", target_id=str(slot_id), metadata={"count": sent})
            return Response({"success": True, "count": sent})

        return Response({"success": False, "message": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)


class DataCleanupView(APIView):
    """
    POST /api/admin/system/cleanup
    古いデータのクリーンアップ
    """
    permission_classes = [IsAdminUser]
    
    def get(self, request):
        """クリーンアップ対象のデータ量を取得"""
        denied = _require_group(request, GROUP_ADMIN_READ)
        if denied:
            return denied
        thirty_days_ago = timezone.now() - timedelta(days=30)
        ninety_days_ago = timezone.now() - timedelta(days=90)
        
        return Response({
            'preview': {
                'old_chat_messages': ChatMessage.objects.filter(created_at__lt=thirty_days_ago).count(),
                'old_checkin_logs': CheckInLog.objects.filter(created_at__lt=ninety_days_ago).count(),
            }
        })
    
    def post(self, request):
        """クリーンアップを実行"""
        denied = _require_group(request, GROUP_ADMIN_OPS)
        if denied:
            return denied
        action = request.data.get('action')
        results = {}
        
        if action == 'old_chat':
            thirty_days_ago = timezone.now() - timedelta(days=30)
            count, _ = ChatMessage.objects.filter(created_at__lt=thirty_days_ago).delete()
            results['deleted_messages'] = count
        
        elif action == 'old_logs':
            ninety_days_ago = timezone.now() - timedelta(days=90)
            count, _ = CheckInLog.objects.filter(created_at__lt=ninety_days_ago).delete()
            results['deleted_logs'] = count
        
        else:
            return Response({'success': False, 'message': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        
        response = Response({
            'success': True,
            'results': results
        })
        _log_admin_action(
            request,
            action="cleanup_execute",
            target_type="cleanup",
            metadata={
                "action": action,
                "results": results,
            },
        )
        return response


class CacheManagementView(APIView):
    """
    POST /api/admin/system/cache
    キャッシュ管理
    """
    permission_classes = [IsAdminUser]
    
    def post(self, request):
        action = request.data.get('action')
        
        if action == 'clear':
            denied = _require_group(request, GROUP_ADMIN_OPS)
            if denied:
                return denied
            try:
                from django.core.cache import cache
                cache.clear()
                _log_admin_action(request, action="cache_clear", target_type="cache")
                return Response({
                    'success': True,
                    'message': 'キャッシュをクリアしました'
                })
            except Exception as e:
                return Response({
                    'success': False,
                    'message': str(e)
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        return Response({'success': False, 'message': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)


class UserManagementView(APIView):
    """
    GET /api/admin/system/users
    ユーザー管理
    """
    permission_classes = [IsAdminUser]
    
    def get(self, request):
        denied = _require_group(request, GROUP_ADMIN_READ)
        if denied:
            return denied
        users = User.objects.all().order_by('-date_joined')[:100]
        return Response({
            'users': [
                {
                    'id': u.id,
                    'username': u.username,
                    'email': u.email,
                    'first_name': u.first_name,
                    'last_name': u.last_name,
                    'is_staff': u.is_staff,
                    'is_superuser': u.is_superuser,
                    'is_active': u.is_active,
                    'date_joined': u.date_joined.isoformat(),
                    'last_login': u.last_login.isoformat() if u.last_login else None,
                }
                for u in users
            ],
            'total_count': User.objects.count()
        })
    
    def patch(self, request):
        """ユーザー情報を更新"""
        denied = _require_group(request, GROUP_ADMIN_OPS)
        if denied:
            return denied
        user_id = request.data.get('user_id')
        if not user_id:
            return Response({'success': False, 'message': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        if ('is_staff' in request.data or 'is_superuser' in request.data) and not request.user.is_superuser:
            return Response({'success': False, 'message': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        if request.data.get('reset_password') and not request.user.is_superuser:
            return Response({'success': False, 'message': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'success': False, 'message': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        before = {
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'is_staff': user.is_staff,
            'is_superuser': user.is_superuser,
            'is_active': user.is_active,
        }
        
        # 更新可能なフィールド
        if 'username' in request.data:
            new_username = request.data['username'].strip()
            if new_username and new_username != user.username:
                if User.objects.filter(username=new_username).exists():
                    return Response({'success': False, 'message': 'このユーザー名は既に使用されています'}, status=status.HTTP_400_BAD_REQUEST)
                user.username = new_username
        
        if 'email' in request.data:
            user.email = request.data['email'].strip()
        
        if 'first_name' in request.data:
            user.first_name = request.data['first_name'].strip()
        
        if 'last_name' in request.data:
            user.last_name = request.data['last_name'].strip()
        
        if 'is_staff' in request.data:
            user.is_staff = request.data['is_staff']
        
        if 'is_superuser' in request.data:
            # 管理者権限の変更は現在のユーザーがスーパーユーザーの場合のみ
            if request.user.is_superuser:
                # 自分自身の管理者権限は変更不可
                if user.id != request.user.id:
                    user.is_superuser = request.data['is_superuser']
                    # 管理者に昇格する場合はスタッフ権限も付与
                    if request.data['is_superuser']:
                        user.is_staff = True
        
        if 'is_active' in request.data:
            user.is_active = request.data['is_active']
        
        # パスワードリセット
        if request.data.get('reset_password'):
            new_password = request.data.get('new_password')
            if new_password and len(new_password) >= 6:
                user.set_password(new_password)
            else:
                return Response({'success': False, 'message': 'パスワードは6文字以上で入力してください'}, status=status.HTTP_400_BAD_REQUEST)
        
        user.save()

        changes = {}
        for key, old_value in before.items():
            new_value = getattr(user, key)
            if old_value != new_value:
                changes[key] = {'from': old_value, 'to': new_value}

        _log_admin_action(
            request,
            action="user_update",
            target_type="user",
            target_id=user.id,
            metadata={
                'changes': changes,
                'reset_password': bool(request.data.get('reset_password')),
            }
        )
        
        return Response({
            'success': True,
            'message': f'{user.username} を更新しました',
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'is_staff': user.is_staff,
                'is_superuser': user.is_superuser,
                'is_active': user.is_active,
            }
        })
    
    def delete(self, request):
        """ユーザーを削除"""
        denied = _require_group(request, GROUP_ADMIN_OPS)
        if denied:
            return denied
        user_id = request.data.get('user_id')
        if not user_id:
            return Response({'success': False, 'message': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'success': False, 'message': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        
        # スーパーユーザーは削除不可
        if user.is_superuser:
            return Response({'success': False, 'message': '管理者ユーザーは削除できません'}, status=status.HTTP_400_BAD_REQUEST)
        
        # 自分自身は削除不可
        if user.id == request.user.id:
            return Response({'success': False, 'message': '自分自身は削除できません'}, status=status.HTTP_400_BAD_REQUEST)
        
        username = user.username
        user.delete()

        _log_admin_action(
            request,
            action="user_delete",
            target_type="user",
            target_id=user_id,
            metadata={
                'username': username,
            }
        )
        
        return Response({
            'success': True,
            'message': f'{username} を削除しました'
        })


class DataExportView(APIView):
    """
    GET /api/admin/system/export
    データエクスポート
    """
    permission_classes = [IsAdminUser]
    
    def get(self, request):
        denied = _require_group(request, GROUP_ADMIN_OPS)
        if denied:
            return denied
        export_type = request.query_params.get('type', 'tickets')
        format_type = request.query_params.get('format', 'json')
        
        if export_type == 'tickets':
            tickets = Ticket.objects.select_related('reservation', 'attribute', 'slot').all()
            data = [
                {
                    'id': str(t.id),
                    'status': t.status,
                    'guest_info': t.guest_info,
                    'attribute': t.attribute.display_name if t.attribute else None,
                    'slot_date': t.slot.event_date.isoformat() if t.slot else None,
                    'slot_time': t.slot.start_time.strftime('%H:%M') if t.slot else None,
                    'created_at': t.created_at.isoformat(),
                    'entered_at': t.entered_at.isoformat() if t.entered_at else None,
                }
                for t in tickets
            ]
        
        elif export_type == 'reservations':
            reservations = Reservation.objects.all()
            data = [
                {
                    'id': str(r.id),
                    'guest_identifier': r.guest_identifier,
                    'total_amount': r.total_amount,
                    'created_at': r.created_at.isoformat(),
                }
                for r in reservations
            ]
        
        elif export_type == 'users':
            users = User.objects.all()
            data = [
                {
                    'id': u.id,
                    'username': u.username,
                    'email': u.email,
                    'is_staff': u.is_staff,
                    'date_joined': u.date_joined.isoformat(),
                }
                for u in users
            ]
        
        else:
            return Response({'success': False, 'message': 'Invalid export type'}, status=status.HTTP_400_BAD_REQUEST)
        
        if format_type == 'csv':
            if not data:
                return Response({'success': False, 'message': 'No data to export'}, status=status.HTTP_404_NOT_FOUND)
            
            response = HttpResponse(content_type='text/csv')
            response['Content-Disposition'] = f'attachment; filename="{export_type}_export.csv"'
            
            writer = csv.DictWriter(response, fieldnames=data[0].keys())
            writer.writeheader()
            for row in data:
                writer.writerow(row)

            _log_admin_action(
                request,
                action="data_export",
                target_type="export",
                metadata={
                    "type": export_type,
                    "format": format_type,
                    "count": len(data),
                },
            )
            
            return response

        _log_admin_action(
            request,
            action="data_export",
            target_type="export",
            metadata={
                "type": export_type,
                "format": format_type,
                "count": len(data),
            },
        )

        return Response({
            'type': export_type,
            'count': len(data),
            'data': data
        })


# === Emergency Stop & Device Statistics ===

class EmergencyStopView(APIView):
    """
    GET /api/admin/emergency/
    緊急停止状態を取得
    
    POST /api/admin/emergency/
    緊急停止を切り替え
    
    Body: { "emergency_stop": true/false, "message": "optional message" }
    """
    permission_classes = [IsAdminUser]
    
    def get(self, request):
        denied = _require_group(request, GROUP_ADMIN_READ)
        if denied:
            return denied
        setting = SystemSetting.get_instance()
        return Response({
            "emergency_stop": setting.emergency_stop,
            "emergency_message": setting.emergency_message,
            "maintenance_mode": setting.maintenance_mode,
            "operation_mode": setting.operation_mode,
            "updated_at": setting.updated_at.isoformat() if setting.updated_at else None,
            "updated_by": setting.updated_by.username if setting.updated_by else None,
        })
    
    def post(self, request):
        denied = _require_group(request, GROUP_ADMIN_EMERGENCY)
        if denied:
            return denied
        setting = SystemSetting.get_instance()
        before = {
            "emergency_stop": setting.emergency_stop,
            "emergency_message": setting.emergency_message,
            "maintenance_mode": setting.maintenance_mode,
            "operation_mode": setting.operation_mode,
                "operation_mode": setting.operation_mode,
        }
        
        if 'emergency_stop' in request.data:
            setting.emergency_stop = request.data['emergency_stop']
        
        if 'emergency_message' in request.data:
            setting.emergency_message = request.data['emergency_message']
        
        if 'maintenance_mode' in request.data:
            setting.maintenance_mode = request.data['maintenance_mode']

        if 'operation_mode' in request.data:
            setting.operation_mode = request.data['operation_mode']
        
        setting.updated_by = request.user
        setting.save()

        _create_system_setting_history(setting, request, "emergency_update")

        _log_admin_action(
            request,
            action="emergency_update",
            target_type="system_setting",
            target_id=getattr(setting, "id", ""),
            metadata={
                "before": before,
                "after": {
                    "emergency_stop": setting.emergency_stop,
                    "emergency_message": setting.emergency_message,
                    "maintenance_mode": setting.maintenance_mode,
                },
            },
        )
        
        return Response({
            "success": True,
            "message": "設定を更新しました。",
            "emergency_stop": setting.emergency_stop,
            "emergency_message": setting.emergency_message,
            "maintenance_mode": setting.maintenance_mode,
            "operation_mode": setting.operation_mode,
        })


class DeviceStatisticsView(APIView):
    """
    GET /api/admin/device-stats/
    端末IDごとのチェックイン集計
    
    Query params:
      - date: 対象日 (YYYY-MM-DD形式、省略時は今日)
    """
    permission_classes = [IsAdminUser]
    
    def get(self, request):
        denied = _require_group(request, GROUP_ADMIN_READ)
        if denied:
            return denied
        from django.db.models.functions import TruncHour
        from datetime import date as date_type
        
        date_str = request.query_params.get('date')
        if date_str:
            try:
                target_date = timezone.datetime.strptime(date_str, '%Y-%m-%d').date()
            except ValueError:
                return Response(
                    {"success": False, "message": "Invalid date format. Use YYYY-MM-DD."},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            target_date = timezone.now().date()
        
        # 端末IDごとの集計
        device_stats = CheckInLog.objects.filter(
            created_at__date=target_date,
            success=True
        ).values('device_id').annotate(
            total=Count('id'),
        ).order_by('-total')
        
        # 時間帯別の集計（端末別）
        hourly_stats = CheckInLog.objects.filter(
            created_at__date=target_date,
            success=True
        ).annotate(
            hour=TruncHour('created_at')
        ).values('device_id', 'hour').annotate(
            count=Count('id')
        ).order_by('hour', 'device_id')
        
        # 時間帯別に整形
        hourly_by_device = {}
        for stat in hourly_stats:
            device_id = stat['device_id'] or 'unknown'
            hour_str = stat['hour'].strftime('%H:00') if stat['hour'] else 'unknown'
            if device_id not in hourly_by_device:
                hourly_by_device[device_id] = {}
            hourly_by_device[device_id][hour_str] = stat['count']
        
        return Response({
            "date": target_date.isoformat(),
            "device_totals": list(device_stats),
            "hourly_by_device": hourly_by_device,
            "total_checkins": sum(d['total'] for d in device_stats),
        })


class EmergencyStopCheckView(APIView):
    """
    GET /api/emergency-status/
    緊急停止状態を取得（認証不要、フロントからのポーリング用）
    """
    permission_classes = [AllowAny]
    
    def get(self, request):
        setting = SystemSetting.get_instance()
        return Response({
            "emergency_stop": setting.emergency_stop,
            "emergency_message": setting.emergency_message,
            "maintenance_mode": setting.maintenance_mode,
            "operation_mode": setting.operation_mode,
        })


class EmailSettingsView(APIView):
    """
    GET /api/admin/email-settings/
    メール設定を取得
    
    POST /api/admin/email-settings/
    メール設定を更新
    """
    permission_classes = [IsAdminUser]
    
    def get(self, request):
        denied = _require_group(request, GROUP_ADMIN_READ)
        if denied:
            return denied
        setting = SystemSetting.get_instance()
        return Response({
            "email_mode": setting.email_mode,
            "sendgrid_api_key_set": bool(setting.sendgrid_api_key),
            "sendgrid_api_key_masked": self._mask_api_key(setting.sendgrid_api_key),
            "email_from_address": setting.email_from_address,
            "email_from_name": setting.email_from_name,
            "operation_mode": setting.operation_mode,
            "updated_at": setting.updated_at.isoformat() if setting.updated_at else None,
            "updated_by": setting.updated_by.username if setting.updated_by else None,
        })
    
    def post(self, request):
        denied = _require_group(request, GROUP_ADMIN_OPS)
        if denied:
            return denied
        setting = SystemSetting.get_instance()
        before = {
            "email_mode": setting.email_mode,
            "email_from_address": setting.email_from_address,
            "email_from_name": setting.email_from_name,
            "sendgrid_api_key_set": bool(setting.sendgrid_api_key),
        }
        
        if 'email_mode' in request.data:
            setting.email_mode = request.data['email_mode']
        
        if 'sendgrid_api_key' in request.data:
            # 空文字列でクリア、値があれば設定
            setting.sendgrid_api_key = request.data['sendgrid_api_key']
        
        if 'email_from_address' in request.data:
            setting.email_from_address = request.data['email_from_address']
        
        if 'email_from_name' in request.data:
            setting.email_from_name = request.data['email_from_name']
        
        setting.updated_by = request.user
        setting.save()

        _create_system_setting_history(setting, request, "email_settings_update")

        _log_admin_action(
            request,
            action="email_settings_update",
            target_type="system_setting",
            target_id=getattr(setting, "id", ""),
            metadata={
                "before": before,
                "after": {
                    "email_mode": setting.email_mode,
                    "email_from_address": setting.email_from_address,
                    "email_from_name": setting.email_from_name,
                    "sendgrid_api_key_set": bool(setting.sendgrid_api_key),
                },
                "sendgrid_api_key_changed": "sendgrid_api_key" in request.data,
            },
        )
        
        return Response({
            "success": True,
            "message": "メール設定を更新しました",
            "email_mode": setting.email_mode,
            "sendgrid_api_key_set": bool(setting.sendgrid_api_key),
        })
    
    def _mask_api_key(self, api_key: str) -> str:
        """APIキーをマスクして表示"""
        if not api_key:
            return ""
        if len(api_key) <= 8:
            return "*" * len(api_key)
        return api_key[:4] + "*" * (len(api_key) - 8) + api_key[-4:]


class EmailTestView(APIView):
    """
    POST /api/admin/email-test/
    テストメール送信
    """
    permission_classes = [IsAdminUser]
    throttle_classes = [EmailOpsThrottle]
    
    def post(self, request):
        denied = _require_group(request, GROUP_ADMIN_OPS)
        if denied:
            return denied
        to_email = request.data.get('to_email', request.user.email)
        
        if not to_email:
            return Response(
                {"success": False, "message": "送信先メールアドレスを指定してください"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        from .email_service import email_service
        
        subject = "【MATSU】テストメール"
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="font-family: sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #4F46E5;">🎪 テストメール</h1>
                <p>このメールはMATSUシステムからのテスト送信です。</p>
                <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>送信日時:</strong> {timezone.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
                    <p><strong>送信者:</strong> {request.user.username}</p>
                </div>
                <p>正常に受信できていれば、メール設定は正しく動作しています。</p>
            </div>
        </body>
        </html>
        """
        
        result = email_service.send_email([to_email], subject, html_content)

        _log_admin_action(
            request,
            action="email_test",
            target_type="email",
            metadata={
                "to_email": to_email,
                "success": bool(result.get("success")) if isinstance(result, dict) else None,
                "email_mode": SystemSetting.get_instance().email_mode,
            },
        )

        return Response(result)


class SystemSettingHistoryView(APIView):
    """
    GET /api/admin/system/settings/history
    システム設定の変更履歴を取得
    """
    permission_classes = [IsAdminUser]
    throttle_classes = [EmailOpsThrottle]

    def get(self, request):
        denied = _require_any_group(request, [GROUP_ADMIN_READ, "admin_audit", GROUP_ADMIN_OPS])
        if denied:
            return denied
        histories = SystemSettingHistory.objects.select_related('created_by').order_by('-created_at')[:200]
        data = []
        for item in histories:
            data.append({
                "id": str(item.id),
                "action": item.action,
                "created_by": item.created_by.username if item.created_by else None,
                "created_at": item.created_at.isoformat(),
                "snapshot": _mask_setting_snapshot(item.snapshot or {}),
            })
        return Response({"histories": data})


class SystemSettingRollbackView(APIView):
    """
    POST /api/admin/system/settings/rollback
    変更履歴から設定をロールバック
    """
    permission_classes = [IsAdminUser]
    throttle_classes = [EmailOpsThrottle]

    @transaction.atomic
    def post(self, request):
        denied = _require_any_group(request, [GROUP_ADMIN_EMERGENCY, GROUP_ADMIN_OPS])
        if denied:
            return denied
        history_id = request.data.get("history_id")
        history = SystemSettingHistory.objects.select_related('system_setting').filter(id=history_id).first()
        if not history:
            return Response({"success": False, "message": "履歴が見つかりません"}, status=status.HTTP_404_NOT_FOUND)

        setting = SystemSetting.objects.select_for_update().get(id=history.system_setting_id)
        snapshot = history.snapshot or {}
        setting.emergency_stop = snapshot.get("emergency_stop", setting.emergency_stop)
        setting.emergency_message = snapshot.get("emergency_message", setting.emergency_message)
        setting.maintenance_mode = snapshot.get("maintenance_mode", setting.maintenance_mode)
        setting.operation_mode = snapshot.get("operation_mode", setting.operation_mode)
        setting.email_mode = snapshot.get("email_mode", setting.email_mode)
        setting.sendgrid_api_key = snapshot.get("sendgrid_api_key", setting.sendgrid_api_key)
        setting.email_from_address = snapshot.get("email_from_address", setting.email_from_address)
        setting.email_from_name = snapshot.get("email_from_name", setting.email_from_name)
        setting.updated_by = request.user
        setting.save()

        _create_system_setting_history(setting, request, "settings_rollback")
        _log_admin_action(
            request,
            action="settings_rollback",
            target_type="system_setting",
            target_id=str(setting.id),
            metadata={"history_id": str(history.id)},
        )

        return Response({"success": True})
