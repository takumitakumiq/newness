"""
MATSU - API URL Configuration
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenBlacklistView,
)
from . import views

router = DefaultRouter(trailing_slash=False)
router.register(r'slots', views.EntrySlotViewSet, basename='slots')
router.register(r'attributes', views.AttributeConfigViewSet, basename='attributes')
router.register(r'reservations', views.ReservationViewSet, basename='reservations')
router.register(r'tickets', views.TicketViewSet, basename='tickets')
router.register(r'announcements', views.AnnouncementViewSet, basename='announcements')
router.register(r'promocodes', views.PromoCodeViewSet, basename='promocodes')
router.register(r'chat', views.ChatMessageViewSet, basename='chat')

urlpatterns = [
    path('', include(router.urls)),
    path('checkout', views.CheckoutView.as_view(), name='checkout'),
    path('checkin', views.CheckInView.as_view(), name='checkin'),
    path('health', views.health_check, name='health'),
    path('admin/statistics', views.AdminStatisticsView.as_view(), name='admin_statistics'),
    path('admin/manual-checkin', views.ManualCheckInView.as_view(), name='manual_checkin'),
    path('admin/realtime-monitor', views.RealtimeMonitorView.as_view(), name='realtime_monitor'),
    
    # Authentication endpoints
    path('auth/register', views.UserRegistrationView.as_view(), name='register'),
    path('auth/login', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/logout', TokenBlacklistView.as_view(), name='token_blacklist'),
    path('auth/me', views.UserProfileView.as_view(), name='user_profile'),
    
    # Mypage endpoints
    path('mypage/reservations', views.MyReservationsView.as_view(), name='my_reservations'),
    path('mypage/tickets', views.MyTicketsView.as_view(), name='my_tickets'),
    path('mypage/transfers', views.MyTransfersView.as_view(), name='my_transfers'),
    
    # Ticket Transfer endpoints
    path('transfers/create', views.TicketTransferCreateView.as_view(), name='transfer_create'),
    path('transfers/accept', views.TicketTransferAcceptView.as_view(), name='transfer_accept'),
]
