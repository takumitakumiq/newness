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
import json
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction, models
from django.db.models import Count, Sum
from django.contrib.auth.models import User

from .models import EntrySlot, AttributeConfig, Reservation, Ticket, CheckInLog
from .serializers import (
    EntrySlotSerializer, AttributeConfigSerializer,
    ReservationSerializer, ReservationListSerializer, TicketSerializer,
    CheckoutRequestSerializer, CheckoutResponseSerializer,
    CheckInRequestSerializer, CheckInResponseSerializer,
    UserRegistrationSerializer, UserSerializer, UserProfileUpdateSerializer,
    TicketUpdateSerializer, TicketCancelSerializer
)


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
                {"error": str(e)},
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
        operator = serializer.validated_data.get('operator', '')
        
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

        return Response({
            "summary": {
                "total_reservations": total_reservations,
                "total_tickets": total_tickets,
                "checked_in_count": checked_in_count,
                "cancelled_count": cancelled_count,
                "check_in_rate": round((checked_in_count / total_tickets * 100), 1) if total_tickets > 0 else 0
            },
            "by_attribute": tickets_by_attribute,
            "by_slot": tickets_by_slot
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
            "title": "統計ダッシュボード"
        }
        
        return render(request, 'admin/statistics.html', context)
