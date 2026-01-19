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

router = DefaultRouter()
router.register(r'slots', views.EntrySlotViewSet, basename='slots')
router.register(r'attributes', views.AttributeConfigViewSet, basename='attributes')
router.register(r'reservations', views.ReservationViewSet, basename='reservations')
router.register(r'tickets', views.TicketViewSet, basename='tickets')
router.register(r'announcements', views.AnnouncementViewSet, basename='announcements')

urlpatterns = [
    path('', include(router.urls)),
    path('checkout/', views.CheckoutView.as_view(), name='checkout'),
    path('checkin/', views.CheckInView.as_view(), name='checkin'),
    path('checkin/batch/', views.BatchCheckInView.as_view(), name='batch_checkin'),
    path('admin/checkin/revert/', views.CheckInRevertView.as_view(), name='checkin_revert'),
    path('health/', views.health_check, name='health'),
    path('admin/statistics/', views.AdminStatisticsView.as_view(), name='admin_statistics'),
    path('admin/manual-checkin/', views.ManualCheckInView.as_view(), name='manual_checkin'),
    path('admin/realtime-monitor/', views.RealtimeMonitorView.as_view(), name='realtime_monitor'),
    
    # Authentication endpoints
    path('auth/register/', views.UserRegistrationView.as_view(), name='register'),
    path('auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/logout/', TokenBlacklistView.as_view(), name='token_blacklist'),
    path('auth/me/', views.UserProfileView.as_view(), name='user_profile'),
    
    # Mypage endpoints
    path('mypage/reservations/', views.MyReservationsView.as_view(), name='my_reservations'),
    path('mypage/tickets/', views.MyTicketsView.as_view(), name='my_tickets'),
    path('mypage/wallet-pass/<uuid:ticket_id>/', views.WalletPassView.as_view(), name='wallet_pass'),

    # Ticket share endpoints (view-only)
    path('shares/create/', views.TicketShareCreateView.as_view(), name='ticket_share_create'),
    path('shares/revoke/', views.TicketShareRevokeView.as_view(), name='ticket_share_revoke'),
    path('shares/<str:token>/', views.TicketShareDetailView.as_view(), name='ticket_share_detail'),
    
    # Chat endpoints
    path('chat/messages/', views.ChatMessageView.as_view(), name='chat_messages'),
    path('chat/unread/', views.ChatUnreadCountView.as_view(), name='chat_unread'),
    
    # Emergency & Device Statistics
    path('emergency-status/', views.EmergencyStopCheckView.as_view(), name='emergency_status'),
    path('admin/emergency/', views.EmergencyStopView.as_view(), name='admin_emergency'),
    path('admin/device-stats/', views.DeviceStatisticsView.as_view(), name='device_stats'),
    
    # System Administration endpoints
    path('admin/system/health/', views.SystemHealthView.as_view(), name='system_health'),
    path('admin/system/backup/', views.DatabaseBackupView.as_view(), name='database_backup'),
    path('admin/system/logs/', views.SystemLogsView.as_view(), name='system_logs'),
    path('admin/system/cleanup/', views.DataCleanupView.as_view(), name='data_cleanup'),
    path('admin/system/cache/', views.CacheManagementView.as_view(), name='cache_management'),
    path('admin/system/users/', views.UserManagementView.as_view(), name='user_management'),
    path('admin/system/export/', views.DataExportView.as_view(), name='data_export'),
    path('admin/system/settings/history/', views.SystemSettingHistoryView.as_view(), name='system_setting_history'),
    path('admin/system/settings/rollback/', views.SystemSettingRollbackView.as_view(), name='system_setting_rollback'),
    path('admin/audit/search/', views.AdminAuditSearchView.as_view(), name='admin_audit_search'),
    path('admin/audit/export/', views.AdminAuditExportView.as_view(), name='admin_audit_export'),
    path('admin/support/search/', views.AdminSupportSearchView.as_view(), name='admin_support_search'),
    path('admin/support/action/', views.AdminSupportActionView.as_view(), name='admin_support_action'),
    path('admin/bulk/', views.AdminBulkOperationView.as_view(), name='admin_bulk'),
    
    # Email Settings endpoints
    path('admin/email-settings/', views.EmailSettingsView.as_view(), name='email_settings'),
    path('admin/email-test/', views.EmailTestView.as_view(), name='email_test'),
]
