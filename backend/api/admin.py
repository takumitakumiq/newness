"""
MATSU - Django Admin Configuration with Unfold
"""
from django.contrib import admin
from unfold.admin import ModelAdmin
from .models import (
    EntrySlot, AttributeConfig, Reservation, Ticket, CheckInLog, Announcement,
    TicketShareLink, AdminActionLog, EmailDeliveryLog, ShareLinkAccessLog,
    SystemSetting, SystemSettingHistory, UserProfile
)


@admin.register(EntrySlot)
class EntrySlotAdmin(ModelAdmin):
    list_display = ['event_date', 'start_time', 'end_time', 'capacity', 'booked_count', 'remaining', 'occupancy_rate', 'is_active', 'entry_closed']
    list_filter = ['event_date', 'is_active', 'entry_closed']
    search_fields = ['event_date']
    ordering = ['event_date', 'start_time']
    
    def remaining(self, obj):
        return obj.remaining
    remaining.short_description = '残り'
    
    def occupancy_rate(self, obj):
        if obj.capacity == 0:
            return "0%"
        return f"{round(obj.booked_count / obj.capacity * 100, 1)}%"
    occupancy_rate.short_description = '占有率'


@admin.register(AttributeConfig)
class AttributeConfigAdmin(ModelAdmin):
    list_display = ['display_name', 'target_type', 'max_total_limit', 'total_sold_count', 'is_cancellable', 'is_modifiable', 'sort_order', 'is_active']
    list_filter = ['is_active', 'is_cancellable', 'is_modifiable']
    list_editable = ['is_cancellable', 'is_modifiable', 'is_active']
    search_fields = ['target_type', 'display_name']
    ordering = ['sort_order']
    
    def total_sold_count(self, obj):
        return Ticket.objects.filter(attribute=obj).count()
    total_sold_count.short_description = "販売数"

    fieldsets = (
        ('基本情報', {
            'fields': ('target_type', 'display_name', 'description', 'sort_order', 'is_active')
        }),
        ('購入制限', {
            'fields': ('max_total_limit',)
        }),
        ('キャンセル・変更設定', {
            'fields': ('is_cancellable', 'is_modifiable', 'cancel_deadline_hours'),
            'description': 'チケットのキャンセルや情報修正を許可するかどうかを設定します。'
        }),
        ('フォーム設定', {
            'fields': ('form_schema',),
            'classes': ('collapse',)
        }),
    )


@admin.register(Reservation)
class ReservationAdmin(ModelAdmin):
    list_display = ['id', 'user', 'user_name', 'user_email', 'total_tickets', 'created_at']
    list_filter = ['created_at']
    search_fields = ['id', 'guest_identifier', 'user_name', 'user_email', 'user__username']
    ordering = ['-created_at']
    readonly_fields = ['id', 'created_at', 'updated_at']
    raw_id_fields = ['user']


@admin.register(Ticket)
class TicketAdmin(ModelAdmin):
    list_display = ['id', 'reservation', 'slot', 'attribute', 'status', 'entered_at', 'created_at']
    list_filter = ['status', 'slot__event_date', 'attribute']
    search_fields = ['id', 'reservation__id', 'reservation__user_name']
    ordering = ['-created_at']
    readonly_fields = ['id', 'created_at']
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('reservation', 'slot', 'attribute')


@admin.register(CheckInLog)
class CheckInLogAdmin(ModelAdmin):
    list_display = ['ticket', 'action', 'success', 'device_id', 'operator', 'created_at']
    list_filter = ['success', 'action', 'created_at']
    search_fields = ['ticket__id', 'device_id', 'operator']
    ordering = ['-created_at']
    readonly_fields = ['id', 'ticket', 'action', 'success', 'message', 'device_id', 'operator', 'created_at']


@admin.register(Announcement)
class AnnouncementAdmin(ModelAdmin):
    list_display = ['title', 'priority', 'is_active', 'target_slot', 'created_at']
    list_filter = ['priority', 'is_active', 'created_at']
    list_editable = ['is_active']
    search_fields = ['title', 'content']
    ordering = ['-created_at']
    readonly_fields = ['id', 'created_at', 'updated_at']


@admin.register(TicketShareLink)
class TicketShareLinkAdmin(ModelAdmin):
    list_display = ['ticket', 'token', 'expires_at', 'revoked_at', 'created_by', 'access_count', 'max_accesses', 'created_at']
    list_filter = ['revoked_at', 'created_at']
    search_fields = ['token', 'ticket__id', 'created_by__username']
    ordering = ['-created_at']
    readonly_fields = ['id', 'token', 'ticket', 'created_by', 'expires_at', 'revoked_at', 'created_at', 'access_count', 'max_accesses', 'last_accessed_at']


@admin.register(AdminActionLog)
class AdminActionLogAdmin(ModelAdmin):
    list_display = ['actor', 'action', 'target_type', 'target_id', 'created_at']
    list_filter = ['action', 'created_at']
    search_fields = ['actor__username', 'target_id', 'target_type']
    ordering = ['-created_at']
    readonly_fields = ['id', 'actor', 'action', 'target_type', 'target_id', 'metadata', 'created_at']


@admin.register(EmailDeliveryLog)
class EmailDeliveryLogAdmin(ModelAdmin):
    list_display = ['to_email', 'subject', 'mode', 'success', 'created_at']
    list_filter = ['mode', 'success', 'created_at']
    search_fields = ['to_email', 'subject']
    ordering = ['-created_at']
    readonly_fields = ['id', 'to_email', 'subject', 'mode', 'success', 'provider_message', 'reservation', 'ticket', 'created_by', 'metadata', 'created_at']


@admin.register(ShareLinkAccessLog)
class ShareLinkAccessLogAdmin(ModelAdmin):
    list_display = ['share_link', 'ticket', 'success', 'ip_address', 'created_at']
    list_filter = ['success', 'created_at']
    search_fields = ['share_link__token', 'ticket__id', 'ip_address']
    ordering = ['-created_at']
    readonly_fields = ['id', 'share_link', 'ticket', 'ip_address', 'user_agent', 'success', 'message', 'created_at']


@admin.register(SystemSetting)
class SystemSettingAdmin(ModelAdmin):
    list_display = ['emergency_stop', 'maintenance_mode', 'operation_mode', 'email_mode', 'updated_at']
    readonly_fields = ['updated_at', 'updated_by']


@admin.register(SystemSettingHistory)
class SystemSettingHistoryAdmin(ModelAdmin):
    list_display = ['action', 'created_by', 'created_at']
    list_filter = ['action', 'created_at']
    search_fields = ['action', 'created_by__username']
    ordering = ['-created_at']
    readonly_fields = ['id', 'system_setting', 'action', 'snapshot', 'created_by', 'created_at']


@admin.register(UserProfile)
class UserProfileAdmin(ModelAdmin):
    list_display = ['user', 'verification_status', 'verification_updated_at', 'updated_at']
    list_filter = ['verification_status', 'updated_at']
    search_fields = ['user__username', 'user__email']
    ordering = ['-updated_at']

