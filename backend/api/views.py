"""
MATSU - API Views
"""
import logging
from rest_framework import viewsets, status, generics
from rest_framework.decorators import api_view, action, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser
from rest_framework.throttling import UserRateThrottle, AnonRateThrottle
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from django.shortcuts import render
from django.views import View
from django.contrib.admin.views.decorators import staff_member_required
from django.utils.decorators import method_decorator
from django.http import HttpResponse
from django.utils.html import escape
import json
import csv
import secrets
from datetime import timedelta
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction, models
from django.db.models import Count, Sum
from django.contrib.auth.models import User

from .models import EntrySlot, AttributeConfig, Reservation, Ticket, CheckInLog, Announcement, TicketTransfer, PromoCode
from .serializers import (
    EntrySlotSerializer, AttributeConfigSerializer,
    ReservationSerializer, ReservationListSerializer, TicketSerializer,
    CheckoutRequestSerializer, CheckoutResponseSerializer,
    CheckInRequestSerializer, CheckInResponseSerializer,
    UserRegistrationSerializer, UserSerializer, UserProfileUpdateSerializer,
    TicketUpdateSerializer, TicketCancelSerializer,
    AnnouncementSerializer, TicketTransferSerializer,
    TicketTransferCreateSerializer, TicketTransferAcceptSerializer,
    PromoCodeSerializer, sanitize_string
)
from .email_notifications import (
    send_reservation_confirmation,
    send_ticket_transfer_notification,
    send_cancellation_notification
)

# Initialize logger
logger = logging.getLogger(__name__)


# Rate limiting classes
class CheckoutRateThrottle(UserRateThrottle):
    """Rate limit for checkout operations - 5 requests per minute"""
    rate = '5/min'


class CheckInRateThrottle(UserRateThrottle):
    """Rate limit for check-in operations - 30 requests per minute"""
    rate = '30/min'


class EntrySlotViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for entry slots.
    GET /api/slots/ - List all active slots
    GET /api/slots/{id}/ - Get slot detail
    """
    queryset = EntrySlot.objects.filter(is_active=True)
    serializer_class = EntrySlotSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['event_date', 'is_active']


class AttributeConfigViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for attribute configurations.
    GET /api/attributes/ - List all active attributes
    GET /api/attributes/{id}/ - Get attribute detail
    """
    queryset = AttributeConfig.objects.filter(is_active=True)
    serializer_class = AttributeConfigSerializer


class ReservationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for reservations.
    GET /api/reservations/ - List reservations (filterable by guest_identifier)
    GET /api/reservations/{id}/ - Get reservation detail with tickets
    """
    queryset = Reservation.objects.all()
    permission_classes = [IsAdminUser]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['guest_identifier']
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ReservationListSerializer
        return ReservationSerializer


class TicketViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for tickets.
    GET /api/tickets/ - List tickets (filterable by reservation, status)
    GET /api/tickets/{id}/ - Get ticket detail
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
                {"error": "guest_identifier is required"},
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
                {"error": "このチケットをキャンセルする権限がありません。"},
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
        
        # Send cancellation notification email
        try:
            send_cancellation_notification(ticket)
        except Exception as e:
            logger.warning(f"Failed to send cancellation email: {str(e)}")

        return Response({"status": "cancelled", "message": "チケットをキャンセルしました。"})

    @action(detail=True, methods=['patch'], permission_classes=[IsAuthenticated])
    def update_info(self, request, pk=None):
        """チケット情報を修正する"""
        ticket = self.get_object()
        
        # 権限チェック: 予約者本人か確認
        if ticket.reservation.user != request.user:
            return Response(
                {"error": "このチケットを編集する権限がありません。"},
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
    Rate limited to prevent abuse.
    """
    throttle_classes = [CheckoutRateThrottle]
    
    def post(self, request):
        logger.info(f"Checkout request received from user: {request.user if request.user.is_authenticated else 'anonymous'}")
        
        serializer = CheckoutRequestSerializer(data=request.data, context={'request': request})
        
        if not serializer.is_valid():
            logger.warning(f"Checkout validation failed: {serializer.errors}")
            return Response(
                {"errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            reservation = serializer.save()
            logger.info(f"Reservation created successfully: {reservation.id}")
            
            # Send confirmation email asynchronously (non-blocking)
            try:
                send_reservation_confirmation(reservation)
            except Exception as e:
                logger.warning(f"Failed to send confirmation email: {str(e)}")
            
            response_data = {
                'reservation_id': reservation.id,
                'ticket_ids': [str(t.id) for t in reservation.tickets.all()],
                'total_tickets': reservation.total_tickets,
                'discount_amount': reservation.discount_amount,
                'promo_code': reservation.promo_code.code if reservation.promo_code else None,
                'created_at': reservation.created_at
            }
            
            return Response(
                CheckoutResponseSerializer(response_data).data,
                status=status.HTTP_201_CREATED
            )
        
        except Exception as e:
            logger.error(f"Checkout failed: {str(e)}", exc_info=True)
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class CheckInView(APIView):
    """
    POST /api/checkin/
    Process QR code check-in at the gate.
    Rate limited to prevent abuse.
    
    Status codes:
    - 200: Success - ticket validated and marked as entered
    - 409: Conflict - ticket already used (entered)
    - 410: Gone - ticket is cancelled/invalid
    - 404: Not found - ticket doesn't exist
    """
    permission_classes = [IsAdminUser]
    throttle_classes = [CheckInRateThrottle]
    
    @transaction.atomic
    def post(self, request):
        serializer = CheckInRequestSerializer(data=request.data)
        
        if not serializer.is_valid():
            logger.warning(f"Check-in validation failed: {serializer.errors}")
            return Response(
                {"success": False, "message": "無効なリクエストです", "errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        ticket_uuid = serializer.validated_data['ticket_uuid']
        device_id = serializer.validated_data.get('device_id', '')
        operator = serializer.validated_data.get('operator', '')
        
        # Find ticket
        try:
            ticket = Ticket.objects.select_for_update().get(id=ticket_uuid)
        except Ticket.DoesNotExist:
            logger.warning(f"Check-in failed: Ticket not found - {ticket_uuid}")
            # Note: Cannot log to CheckInLog without a ticket reference
            return Response(
                {"success": False, "message": "チケットが見つかりません"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check status
        if ticket.status == Ticket.Status.ENTERED:
            logger.info(f"Check-in attempt on already entered ticket: {ticket.id}")
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
            logger.warning(f"Check-in attempt on cancelled ticket: {ticket.id}")
            self._log_checkin(ticket, 'cancelled', False, 'このチケットは無効です', device_id, operator)
            return Response(
                {"success": False, "message": "このチケットは無効です"},
                status=status.HTTP_410_GONE
            )
        
        # Valid ticket - mark as entered
        ticket.status = Ticket.Status.ENTERED
        ticket.entered_at = timezone.now()
        ticket.save()
        
        logger.info(f"Check-in successful: {ticket.id}")
        self._log_checkin(ticket, 'checkin', True, '入場成功', device_id, operator)
        
        return Response(
            {
                "success": True,
                "message": "入場成功",
                "ticket": TicketSerializer(ticket).data
            },
            status=status.HTTP_200_OK
        )
    
    def _log_checkin(self, ticket, action, success, message, device_id, operator):
        """
        Create audit log for check-in attempt.
        Note: Only accepts Ticket instances, not UUIDs.
        """
        CheckInLog.objects.create(
            ticket=ticket,
            action=action,
            success=success,
            message=message,
            device_id=device_id,
            operator=operator
        )


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
        logger.info(f"Admin statistics accessed by {request.user.username}")
        
        # Get filter parameters
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        
        # Base querysets
        reservations_qs = Reservation.objects.all()
        tickets_qs = Ticket.objects.all()
        
        # Apply date filters if provided
        if date_from:
            reservations_qs = reservations_qs.filter(created_at__date__gte=date_from)
            tickets_qs = tickets_qs.filter(created_at__date__gte=date_from)
        if date_to:
            reservations_qs = reservations_qs.filter(created_at__date__lte=date_to)
            tickets_qs = tickets_qs.filter(created_at__date__lte=date_to)
        
        total_reservations = reservations_qs.count()
        total_tickets = tickets_qs.count()
        checked_in_count = tickets_qs.filter(status=Ticket.Status.ENTERED).count()
        cancelled_count = tickets_qs.filter(status=Ticket.Status.CANCELLED).count()
        
        # Tickets by attribute
        tickets_by_attribute = tickets_qs.values(
            'attribute__display_name'
        ).annotate(
            count=Count('id')
        ).order_by('-count')
        
        # Tickets by slot
        tickets_by_slot = tickets_qs.values(
            'slot__event_date', 'slot__start_time'
        ).annotate(
            count=Count('id')
        ).order_by('slot__event_date', 'slot__start_time')

        # Sales Trend (Last 7 days)
        today = timezone.now().date()
        last_7_days = [today - timedelta(days=i) for i in range(6, -1, -1)]
        sales_trend = []
        
        for date in last_7_days:
            count = tickets_qs.filter(created_at__date=date).count()
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
                'user_name': escape(log.ticket.reservation.user_name if log.ticket and log.ticket.reservation else 'Unknown'),
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
        logger.info(f"Admin dashboard accessed by {request.user.username}")
        
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
            # Sanitize user input to prevent XSS
            user_name = escape(log.ticket.reservation.user_name if log.ticket and log.ticket.reservation else 'Unknown')
            recent_activity_data.append({
                'action': log.action,
                'ticket_id': str(log.ticket.id),
                'user_name': user_name,
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
            writer.writerow(['予約ID', '代表者名', 'メールアドレス', 'チケット数', '予約日時'])
            reservations = Reservation.objects.all().order_by('-created_at')
            for r in reservations:
                writer.writerow([
                    r.id, r.user_name, r.user_email, r.total_tickets,
                    r.created_at.strftime('%Y-%m-%d %H:%M:%S')
                ])
        elif export_type == 'checkins':
            writer.writerow(['チケットID', '入場日', '入場時間', '代表者名', '属性', 'ステータス', '入場日時'])
            tickets = Ticket.objects.filter(status=Ticket.Status.ENTERED).select_related(
                'slot', 'attribute', 'reservation'
            ).order_by('-entered_at')
            for t in tickets:
                writer.writerow([
                    str(t.id), str(t.slot.event_date), str(t.slot.start_time),
                    t.reservation.user_name, t.attribute.display_name,
                    t.get_status_display(),
                    t.entered_at.strftime('%Y-%m-%d %H:%M:%S') if t.entered_at else ''
                ])
        else:  # tickets
            writer.writerow(['チケットID', '予約ID', '入場日', '入場時間', '代表者名', '属性', 'ステータス', '作成日時'])
            tickets = Ticket.objects.all().select_related(
                'slot', 'attribute', 'reservation'
            ).order_by('-created_at')
            for t in tickets:
                writer.writerow([
                    str(t.id), t.reservation_id, str(t.slot.event_date),
                    str(t.slot.start_time), t.reservation.user_name,
                    t.attribute.display_name, t.get_status_display(),
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
        """検索機能 - Enhanced with more filters"""
        query = request.query_params.get('q', '')
        status = request.query_params.get('status', '')
        slot_id = request.query_params.get('slot_id', '')
        attribute_id = request.query_params.get('attribute_id', '')
        
        tickets = Ticket.objects.select_related(
            'slot', 'attribute', 'reservation'
        ).order_by('-created_at')
        
        # Text search
        if len(query) >= 2:
            tickets = tickets.filter(
                models.Q(id__icontains=query) |
                models.Q(reservation__user_name__icontains=query) |
                models.Q(reservation__user_email__icontains=query) |
                models.Q(reservation__id__icontains=query) |
                models.Q(guest_info__name__icontains=query)
            )
        
        # Status filter
        if status:
            tickets = tickets.filter(status=status)
        
        # Slot filter
        if slot_id:
            tickets = tickets.filter(slot_id=slot_id)
        
        # Attribute filter
        if attribute_id:
            tickets = tickets.filter(attribute_id=attribute_id)
        
        # Limit results
        tickets = tickets[:50]
        
        return Response({
            "results": TicketSerializer(tickets, many=True).data,
            "count": tickets.count()
        })
    
    @transaction.atomic
    def post(self, request):
        """手動チェックイン実行"""
        ticket_id = request.data.get('ticket_id')
        operator = request.data.get('operator', request.user.username)
        
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
        
        # Generate unique token
        transfer_token = secrets.token_urlsafe(32)
        
        # Create transfer (expires in 48 hours)
        transfer = TicketTransfer.objects.create(
            ticket=ticket,
            from_user=request.user,
            transfer_token=transfer_token,
            expires_at=timezone.now() + timedelta(hours=48)
        )
        
        return Response({
            "success": True,
            "transfer_token": transfer_token,
            "transfer_url": f"/transfer/{transfer_token}",
            "expires_at": transfer.expires_at.isoformat()
        }, status=status.HTTP_201_CREATED)


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
        transfer = TicketTransfer.objects.select_for_update().get(transfer_token=transfer_token)
        
        # Check if user is trying to accept their own transfer
        if transfer.from_user == request.user:
            return Response(
                {"error": "自分自身に譲渡することはできません。"},
                status=status.HTTP_400_BAD_REQUEST
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
        
        return Response({
            "status": "accepted",
            "message": "チケットを受け取りました。",
            "ticket_id": ticket.id
        })


class PromoCodeViewSet(viewsets.ModelViewSet):
    """
    API endpoint for promo codes.
    """
    queryset = PromoCode.objects.all()
    serializer_class = PromoCodeSerializer
    permission_classes = [IsAdminUser]
    
    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def validate_code(self, request):
        """
        GET /api/promocodes/validate_code/?code=XXX
        プロモーションコードの検証（公開エンドポイント）
        """
        code = sanitize_string(request.query_params.get('code', '')).upper().strip()
        
        if not code:
            return Response(
                {"valid": False, "message": "プロモーションコードを入力してください。"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            promo = PromoCode.objects.get(code=code, is_active=True)
        except PromoCode.DoesNotExist:
            return Response(
                {"valid": False, "message": "無効なプロモーションコードです。"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check validity period
        now = timezone.now()
        if promo.valid_from and now < promo.valid_from:
            return Response(
                {"valid": False, "message": "このプロモーションコードはまだ有効期間ではありません。"},
                status=status.HTTP_400_BAD_REQUEST
            )
        if promo.valid_until and now > promo.valid_until:
            return Response(
                {"valid": False, "message": "このプロモーションコードの有効期限が切れています。"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check usage limit
        if promo.usage_limit and promo.used_count >= promo.usage_limit:
            return Response(
                {"valid": False, "message": "このプロモーションコードは使用上限に達しています。"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Valid promo code
        return Response({
            "valid": True,
            "message": "プロモーションコードが適用されました。",
            "discount_amount": promo.discount_amount,
            "code": promo.code
        })


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
