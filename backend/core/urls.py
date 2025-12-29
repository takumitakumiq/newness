"""URL configuration for MATSU project."""
from django.contrib import admin
from django.urls import path, include
from api.views import AdminDashboardPageView

urlpatterns = [
    path('admin/dashboard/', AdminDashboardPageView.as_view(), name='admin_dashboard'),
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
]
