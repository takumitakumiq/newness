"""URL configuration for MATSU project."""
from django.contrib import admin
from django.urls import path, include
from api.views import AdminDashboardPageView, AdminCSVExportView

urlpatterns = [
    path('admin/dashboard/', AdminDashboardPageView.as_view(), name='admin_dashboard'),
    path('admin/statistics/', AdminDashboardPageView.as_view(), name='admin_statistics'),
    path('admin/export/csv/', AdminCSVExportView.as_view(), name='admin_csv_export'),
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
]
