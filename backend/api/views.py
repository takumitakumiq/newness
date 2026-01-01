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
from django.shortcuts import render
from django.views import View
from django.contrib.admin.views.decorators import staff_member_required
from django.utils.decorators import method_decorator
from django.http import HttpResponse
import json
import csv
import secrets
from datetime import timedelta
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction, models
from django.db.models import Count, Sum
from django.contrib.auth.models import User

from .models import EntrySlot, AttributeConfig, Reservation, Ticket, CheckInLog, Announcement, TicketTransfer, PromoCode, ChatMessage, SystemSetting, ChatMessageRead
from .serializers import (
    EntrySlotSerializer, AttributeConfigSerializer,
    ReservationSerializer, ReservationListSerializer, TicketSerializer,
    CheckoutRequestSerializer, CheckoutResponseSerializer,
    CheckInRequestSerializer, CheckInResponseSerializer,
    UserRegistrationSerializer, UserSerializer, UserProfileUpdateSerializer,
    TicketUpdateSerializer, TicketCancelSerializer,
    AnnouncementSerializer, TicketTransferSerializer,
    TicketTransferCreateSerializer, TicketTransferAcceptSerializer,
    PromoCodeSerializer
)


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
        guest_id = request.query_params.get('guest_identifier')
        if not guest_id:
            return Response(
                {"success": False, "message": "guest_identifier is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        tickets = Ticket.objects.filter(
            reservation__guest_identifier=guest_id
        ).select_related('slot', 'attribute', 'reservation')
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
        
        serializer = TicketCancelSerializer(data={}, context={'ticket': ticket})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        # キャンセル処理
        with transaction.atomic():
            ticket.status = Ticket.Status.CANCELLED
            ticket.save()
            
            # 在庫を戻す
            slot = ticket.slot
            EntrySlot.objects.filter(id=slot.id).update(
                booked_count=models.F('booked_count') - 1
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
        serializer = CheckoutRequestSerializer(data=request.data, context={'request': request})
        
        if not serializer.is_valid():
            return Response(
                {"errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            reservation = serializer.save()
            
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
        
        # Check status
        if ticket.status == Ticket.Status.ENTERED:
            self._log_checkin(ticket, 'already_entered', False, '既に入場済みです', device_id, operator)
            return Response(
                {
                    "success": False,
                    "message": "既に入場済みです",
                    "ticket": TicketSerializer(ticket).data
                },
                status=status.HTTP_409_CONFLICT
            )
        
        if ticket.status == Ticket.Status.CANCELLED:
            self._log_checkin(ticket, 'cancelled', False, 'このチケットは無効です', device_id, operator)
            return Response(
                {"success": False, "message": "このチケットは無効です"},
                status=status.HTTP_410_GONE
            )
        
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
                    
                    if ticket.status == Ticket.Status.ENTERED:
                        results.append({
                            "ticket_uuid": ticket_uuid,
                            "success": False,
                            "message": "既に入場済みです",
                            "status": "already_entered"
                        })
                        failed_count += 1
                        continue
                    
                    if ticket.status == Ticket.Status.CANCELLED:
                        results.append({
                            "ticket_uuid": ticket_uuid,
                            "success": False,
                            "message": "このチケットは無効です",
                            "status": "cancelled"
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


class AdminStatisticsView(APIView):
    """
    GET /api/admin/statistics/
    管理者用ダッシュボード統計情報
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        total_reservations = Reservation.objects.count()
        total_tickets = Ticket.objects.count()
        checked_in_count = Ticket.objects.filter(status=Ticket.Status.ENTERED).count()
        cancelled_count = Ticket.objects.filter(status=Ticket.Status.CANCELLED).count()
        
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

        # Sales Trend (Last 7 days)
        today = timezone.now().date()
        last_7_days = [today - timedelta(days=i) for i in range(6, -1, -1)]
        sales_trend = []
        
        for date in last_7_days:
            count = Ticket.objects.filter(created_at__date=date).count()
            sales_trend.append({
                'date': date.strftime('%Y-%m-%d'),
                'count': count
            })

        # Recent Activity (Check-ins)
        recent_activity = CheckInLog.objects.select_related('ticket__reservation').order_by('-created_at')[:10]
        recent_activity_data = []
        for log in recent_activity:
            recent_activity_data.append({
                'action': log.action,
                'ticket_id': str(log.ticket.id),
                'user_name': log.ticket.reservation.user_name if log.ticket and log.ticket.reservation else 'Unknown',
                'timestamp': log.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                'success': log.success
            })

        return Response({
            "summary": {
                "total_reservations": total_reservations,
                "total_tickets": total_tickets,
                "checked_in_count": checked_in_count,
                "cancelled_count": cancelled_count,
                "check_in_rate": round((checked_in_count / total_tickets * 100), 1) if total_tickets > 0 else 0
            },
            "by_attribute": tickets_by_attribute,
            "by_slot": tickets_by_slot,
            "sales_trend": sales_trend,
            "recent_activity": recent_activity_data
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

        # Sales Trend (Last 7 days)
        today = timezone.now().date()
        last_7_days = [today - timedelta(days=i) for i in range(6, -1, -1)]
        sales_trend = []
        
        for date in last_7_days:
            count = Ticket.objects.filter(created_at__date=date).count()
            sales_trend.append({
                'date': date.strftime('%Y-%m-%d'),
                'count': count
            })

        # Recent Activity (Check-ins)
        recent_activity = CheckInLog.objects.select_related('ticket__reservation').order_by('-created_at')[:10]
        recent_activity_data = []
        for log in recent_activity:
            recent_activity_data.append({
                'action': log.action,
                'ticket_id': str(log.ticket.id),
                'user_name': log.ticket.reservation.user_name if log.ticket and log.ticket.reservation else 'Unknown',
                'timestamp': log.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                'success': log.success
            })

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
        
        if ticket.status == Ticket.Status.ENTERED:
            return Response(
                {"success": False, "message": "既に入場済みです"},
                status=status.HTTP_409_CONFLICT
            )
        
        if ticket.status == Ticket.Status.CANCELLED:
            return Response(
                {"success": False, "message": "このチケットはキャンセル済みです"},
                status=status.HTTP_410_GONE
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


# === Ticket Transfer Views ===

class TicketTransferCreateView(APIView):
    """
    POST /api/transfers/create/
    チケット譲渡リンクを作成
    """
    permission_classes = [IsAuthenticated]
    
    @transaction.atomic
    def post(self, request):
        serializer = TicketTransferCreateSerializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        ticket_id = serializer.validated_data['ticket_id']
        ticket = Ticket.objects.get(id=ticket_id)
        intended_email = request.data.get('intended_email', '').strip() or None
        
        # Generate unique token
        transfer_token = secrets.token_urlsafe(32)
        
        # Create transfer (expires in 48 hours)
        transfer = TicketTransfer.objects.create(
            ticket=ticket,
            from_user=request.user,
            transfer_token=transfer_token,
            expires_at=timezone.now() + timedelta(hours=48),
            intended_email=intended_email
        )
        
        return Response({
            "success": True,
            "transfer_token": transfer_token,
            "transfer_url": f"/transfer/{transfer_token}",
            "expires_at": transfer.expires_at.isoformat()
        }, status=status.HTTP_201_CREATED)


class TicketTransferCancelView(APIView):
    """
    POST /api/transfers/cancel/
    チケット譲渡をキャンセル（送信者のみ可能）
    """
    permission_classes = [IsAuthenticated]
    
    @transaction.atomic
    def post(self, request):
        transfer_id = request.data.get('transfer_id')
        if not transfer_id:
            return Response(
                {"success": False, "message": "transfer_id is required."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            transfer = TicketTransfer.objects.select_for_update().get(id=transfer_id)
        except TicketTransfer.DoesNotExist:
            return Response(
                {"success": False, "message": "譲渡が見つかりません。"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # 権限チェック: 送信者のみキャンセル可能
        if transfer.from_user != request.user:
            return Response(
                {"success": False, "message": "この譲渡をキャンセルする権限がありません。"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # ステータスチェック: PENDING のみキャンセル可能
        if transfer.status != TicketTransfer.Status.PENDING:
            return Response(
                {"success": False, "message": "この譲渡は既に処理済みです。"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # キャンセル処理
        transfer.status = TicketTransfer.Status.CANCELLED
        transfer.save()
        
        return Response({
            "success": True,
            "message": "譲渡をキャンセルしました。"
        })


class TicketTransferPreviewView(APIView):
    """
    GET /api/transfers/preview?token=...
    譲渡チケットのプレビュー（受け取り前に内容確認）
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        token = request.query_params.get('token')
        if not token:
            return Response(
                {"success": False, "message": "token is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            transfer = TicketTransfer.objects.select_related(
                'ticket', 'ticket__slot', 'ticket__attribute', 'from_user'
            ).get(transfer_token=token)
        except TicketTransfer.DoesNotExist:
            return Response(
                {"success": False, "message": "譲渡リンクが見つかりません"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # ステータスチェック
        if transfer.status != TicketTransfer.Status.PENDING:
            return Response({
                "success": False,
                "message": "この譲渡は既に処理済みか期限切れです",
                "status": transfer.status
            })
        
        if timezone.now() > transfer.expires_at:
            return Response({
                "success": False,
                "message": "譲渡リンクの期限が切れています",
                "status": "expired"
            })
        
        # 譲渡先指定がある場合、このユーザーが対象かチェック
        is_intended = True
        if transfer.intended_email:
            is_intended = request.user.email.lower() == transfer.intended_email.lower()
        
        ticket = transfer.ticket
        return Response({
            "success": True,
            "transfer": {
                "id": str(transfer.id),
                "status": transfer.status,
                "expires_at": transfer.expires_at.isoformat(),
                "from_user": transfer.from_user.username,
                "intended_email": transfer.intended_email,
                "is_intended_recipient": is_intended,
            },
            "ticket": {
                "id": str(ticket.id),
                "status": ticket.status,
                "guest_info": ticket.guest_info,
                "slot": {
                    "event_date": ticket.slot.event_date.isoformat() if ticket.slot else None,
                    "start_time": ticket.slot.start_time.strftime('%H:%M') if ticket.slot else None,
                },
                "attribute": {
                    "display_name": ticket.attribute.display_name if ticket.attribute else None,
                }
            }
        })


class TicketTransferAcceptView(APIView):
    """
    POST /api/transfers/accept/
    チケット譲渡を受け取る
    """
    permission_classes = [IsAuthenticated]
    
    @transaction.atomic
    def post(self, request):
        serializer = TicketTransferAcceptSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        transfer_token = serializer.validated_data['transfer_token']
        
        try:
            # ロックを取得して譲渡レコードを取得
            transfer = TicketTransfer.objects.select_for_update().select_related('ticket').get(transfer_token=transfer_token)
        except TicketTransfer.DoesNotExist:
            return Response(
                {"success": False, "message": "譲渡リンクが見つかりません。"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # 🔒 ロック後に再検証（TOCTOU対策）
        if transfer.status != TicketTransfer.Status.PENDING:
            return Response(
                {"success": False, "message": "この譲渡は既に処理済みか期限切れです。"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if timezone.now() > transfer.expires_at:
            transfer.status = TicketTransfer.Status.EXPIRED
            transfer.save()
            return Response(
                {"success": False, "message": "譲渡リンクの期限が切れています。"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if transfer.ticket.status != Ticket.Status.VALID:
            return Response(
                {"success": False, "message": "このチケットは既にキャンセルまたは使用済みです。"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if user is trying to accept their own transfer
        if transfer.from_user == request.user:
            return Response(
                {"success": False, "message": "自分自身に譲渡することはできません。"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # 🔒 譲渡先メール指定チェック
        if transfer.intended_email:
            if request.user.email.lower() != transfer.intended_email.lower():
                return Response(
                    {"success": False, "message": "この譲渡は別のメールアドレス宛てに送信されています。"},
                    status=status.HTTP_403_FORBIDDEN
                )
        
        # Update transfer
        transfer.to_user = request.user
        transfer.status = TicketTransfer.Status.ACCEPTED
        transfer.accepted_at = timezone.now()
        transfer.save()
        
        # Update ticket's reservation to new user
        ticket = transfer.ticket
        old_reservation = ticket.reservation
        
        # Create new reservation for the new user
        new_reservation = Reservation.objects.create(
            user=request.user,
            user_name=f"{request.user.last_name} {request.user.first_name}".strip() or request.user.username,
            user_email=request.user.email,
            total_tickets=1
        )
        
        # Move ticket to new reservation
        ticket.reservation = new_reservation
        ticket.save()
        
        # Update old reservation count
        old_reservation.total_tickets = old_reservation.tickets.count()
        old_reservation.save()
        
        # フロント互換: success, message, ticket を返す
        return Response({
            "success": True,
            "message": "チケットを受け取りました。",
            "ticket": TicketSerializer(ticket).data
        })


class PromoCodeViewSet(viewsets.ModelViewSet):
    """
    API endpoint for promo codes.
    """
    queryset = PromoCode.objects.all()
    serializer_class = PromoCodeSerializer
    permission_classes = [IsAdminUser]


class MyTransfersView(generics.ListAPIView):
    """
    GET /api/mypage/transfers/
    自分の譲渡履歴
    """
    permission_classes = [IsAuthenticated]
    serializer_class = TicketTransferSerializer
    
    def get_queryset(self):
        return TicketTransfer.objects.filter(
            models.Q(from_user=self.request.user) | models.Q(to_user=self.request.user)
        ).select_related('ticket', 'from_user', 'to_user')


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
        if before:
            try:
                from django.utils.dateparse import parse_datetime
                before_dt = parse_datetime(before)
                if before_dt:
                    queryset = queryset.filter(created_at__lt=before_dt)
            except (ValueError, TypeError):
                pass
        
        # limit+1 方式で has_more を判定（count() より効率的）
        messages = list(queryset[:limit + 1])
        has_more = len(messages) > limit
        if has_more:
            messages = messages[:limit]
        
        data = []
        for msg in reversed(messages):
            data.append({
                'id': str(msg.id),
                'user_id': msg.sender.id,
                'username': msg.sender.username,
                'content': msg.content,
                'created_at': msg.created_at.isoformat(),
                'is_staff': msg.sender.is_staff
            })
        
        # 配列形式で返す（フロント互換維持）
        # ページネーション情報はヘッダで返す
        response = Response(data)
        response['X-Has-More'] = 'true' if has_more else 'false'
        if messages:
            response['X-Oldest-Id'] = str(messages[-1].id)
            response['X-Oldest-Created-At'] = messages[-1].created_at.isoformat()
        return response
    
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
        
        return Response({
            'id': str(msg.id),
            'user_id': msg.sender.id,
            'username': msg.sender.username,
            'content': msg.content,
            'created_at': msg.created_at.isoformat(),
            'is_staff': msg.sender.is_staff
        }, status=status.HTTP_201_CREATED)


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

import os
import shutil
import subprocess
from django.conf import settings as django_settings
from datetime import datetime


class SystemHealthView(APIView):
    """
    GET /api/admin/system/health
    詳細なシステムヘルスチェック
    """
    permission_classes = [IsAdminUser]
    
    def get(self, request):
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
                
                return Response({
                    'success': True,
                    'message': 'バックアップを作成しました',
                    'filename': f'backup_{timestamp}.sqlite3',
                    'path': dst,
                    'size_mb': round(os.path.getsize(dst) / (1024**2), 2)
                }, status=status.HTTP_201_CREATED)
            
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
                
                return Response({
                    'success': True,
                    'message': 'JSONバックアップを作成しました',
                    'filename': f'backup_{timestamp}.json',
                    'path': dst,
                    'size_mb': round(os.path.getsize(dst) / (1024**2), 2)
                }, status=status.HTTP_201_CREATED)
            
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
        
        return Response({'logs': []})


class DataCleanupView(APIView):
    """
    POST /api/admin/system/cleanup
    古いデータのクリーンアップ
    """
    permission_classes = [IsAdminUser]
    
    def get(self, request):
        """クリーンアップ対象のデータ量を取得"""
        thirty_days_ago = timezone.now() - timedelta(days=30)
        ninety_days_ago = timezone.now() - timedelta(days=90)
        
        return Response({
            'preview': {
                'old_chat_messages': ChatMessage.objects.filter(created_at__lt=thirty_days_ago).count(),
                'expired_transfers': TicketTransfer.objects.filter(
                    status='pending',
                    expires_at__lt=timezone.now()
                ).count(),
                'old_checkin_logs': CheckInLog.objects.filter(created_at__lt=ninety_days_ago).count(),
            }
        })
    
    def post(self, request):
        """クリーンアップを実行"""
        action = request.data.get('action')
        results = {}
        
        if action == 'expired_transfers':
            count, _ = TicketTransfer.objects.filter(
                status='pending',
                expires_at__lt=timezone.now()
            ).delete()
            results['deleted_transfers'] = count
        
        elif action == 'old_chat':
            thirty_days_ago = timezone.now() - timedelta(days=30)
            count, _ = ChatMessage.objects.filter(created_at__lt=thirty_days_ago).delete()
            results['deleted_messages'] = count
        
        elif action == 'old_logs':
            ninety_days_ago = timezone.now() - timedelta(days=90)
            count, _ = CheckInLog.objects.filter(created_at__lt=ninety_days_ago).delete()
            results['deleted_logs'] = count
        
        else:
            return Response({'success': False, 'message': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        
        return Response({
            'success': True,
            'results': results
        })


class CacheManagementView(APIView):
    """
    POST /api/admin/system/cache
    キャッシュ管理
    """
    permission_classes = [IsAdminUser]
    
    def post(self, request):
        action = request.data.get('action')
        
        if action == 'clear':
            try:
                from django.core.cache import cache
                cache.clear()
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
        user_id = request.data.get('user_id')
        if not user_id:
            return Response({'success': False, 'message': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'success': False, 'message': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        
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
            
            return response
        
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
        setting = SystemSetting.get_instance()
        return Response({
            "emergency_stop": setting.emergency_stop,
            "emergency_message": setting.emergency_message,
            "maintenance_mode": setting.maintenance_mode,
            "updated_at": setting.updated_at.isoformat() if setting.updated_at else None,
            "updated_by": setting.updated_by.username if setting.updated_by else None,
        })
    
    def post(self, request):
        setting = SystemSetting.get_instance()
        
        if 'emergency_stop' in request.data:
            setting.emergency_stop = request.data['emergency_stop']
        
        if 'emergency_message' in request.data:
            setting.emergency_message = request.data['emergency_message']
        
        if 'maintenance_mode' in request.data:
            setting.maintenance_mode = request.data['maintenance_mode']
        
        setting.updated_by = request.user
        setting.save()
        
        return Response({
            "success": True,
            "message": "設定を更新しました。",
            "emergency_stop": setting.emergency_stop,
            "emergency_message": setting.emergency_message,
            "maintenance_mode": setting.maintenance_mode,
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
        setting = SystemSetting.get_instance()
        return Response({
            "email_mode": setting.email_mode,
            "sendgrid_api_key_set": bool(setting.sendgrid_api_key),
            "sendgrid_api_key_masked": self._mask_api_key(setting.sendgrid_api_key),
            "email_from_address": setting.email_from_address,
            "email_from_name": setting.email_from_name,
            "updated_at": setting.updated_at.isoformat() if setting.updated_at else None,
            "updated_by": setting.updated_by.username if setting.updated_by else None,
        })
    
    def post(self, request):
        setting = SystemSetting.get_instance()
        
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
    
    def post(self, request):
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
        
        return Response(result)
