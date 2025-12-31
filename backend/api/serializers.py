"""
MATSU - API Serializers
"""
import re
from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.utils import timezone
from django.utils.html import escape
from datetime import timedelta
from .models import EntrySlot, AttributeConfig, Reservation, Ticket, CheckInLog, Announcement, TicketTransfer, PromoCode


# Constants
MAX_TICKETS_PER_CHECKOUT = 50


def sanitize_string(value):
    """Sanitize string input to prevent XSS"""
    if isinstance(value, str):
        return escape(value.strip())
    return value


def validate_email_format(email):
    """Validate email format"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(pattern, email):
        raise serializers.ValidationError("無効なメールアドレス形式です。")
    return email


class EntrySlotSerializer(serializers.ModelSerializer):
    """Serializer for entry slots with availability info."""
    remaining = serializers.ReadOnlyField()
    availability_status = serializers.ReadOnlyField()
    
    class Meta:
        model = EntrySlot
        fields = [
            'id', 'event_date', 'start_time', 'end_time',
            'capacity', 'booked_count', 'remaining',
            'availability_status', 'is_active'
        ]
        read_only_fields = ['booked_count', 'remaining', 'availability_status']


class AttributeConfigSerializer(serializers.ModelSerializer):
    """Serializer for attribute configurations."""
    
    class Meta:
        model = AttributeConfig
        fields = [
            'id', 'target_type', 'display_name',
            'max_total_limit', 'form_schema',
            'description', 'sort_order', 'is_active',
            'is_cancellable', 'is_modifiable', 'cancel_deadline_hours'
        ]


class TicketSerializer(serializers.ModelSerializer):
    """Serializer for individual tickets."""
    slot_detail = EntrySlotSerializer(source='slot', read_only=True)
    attribute_detail = AttributeConfigSerializer(source='attribute', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    
    class Meta:
        model = Ticket
        fields = [
            'id', 'reservation_id', 'slot', 'slot_detail',
            'attribute', 'attribute_detail', 'guest_info',
            'status', 'status_display', 'entered_at', 'created_at'
        ]
        read_only_fields = ['id', 'reservation_id', 'entered_at', 'created_at']


class ReservationSerializer(serializers.ModelSerializer):
    """Serializer for reservations with nested tickets."""
    tickets = TicketSerializer(many=True, read_only=True)
    promo_code_name = serializers.CharField(source='promo_code.code', read_only=True)
    
    class Meta:
        model = Reservation
        fields = [
            'id', 'guest_identifier', 'user_name', 'user_email',
            'total_tickets', 'promo_code', 'promo_code_name', 
            'discount_amount', 'created_at', 'updated_at', 'tickets'
        ]
        read_only_fields = ['id', 'total_tickets', 'discount_amount', 'created_at', 'updated_at']


class ReservationListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for reservation list."""
    
    class Meta:
        model = Reservation
        fields = [
            'id', 'guest_identifier', 'user_name', 'user_email',
            'total_tickets', 'created_at'
        ]


# === Checkout Serializers ===

class TicketRequestSerializer(serializers.Serializer):
    """Single ticket in a checkout request."""
    slot_id = serializers.UUIDField()
    attribute_id = serializers.UUIDField()
    guest_info = serializers.JSONField(default=dict)


class CheckoutRequestSerializer(serializers.Serializer):
    """Checkout request containing multiple tickets."""
    guest_identifier = serializers.CharField(max_length=255, required=False, allow_blank=True)
    user_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    user_email = serializers.EmailField(required=False, allow_blank=True)
    tickets = TicketRequestSerializer(many=True)
    promo_code = serializers.CharField(max_length=50, required=False, allow_blank=True)
    
    def validate_user_name(self, value):
        """Sanitize user name to prevent XSS"""
        return sanitize_string(value)
    
    def validate_user_email(self, value):
        """Validate and sanitize email"""
        if value:
            return validate_email_format(value)
        return value
    
    def validate_guest_identifier(self, value):
        """Sanitize guest identifier"""
        return sanitize_string(value)
    
    def validate_tickets(self, value):
        if not value:
            raise serializers.ValidationError("チケットを1つ以上選択してください。")
        if len(value) > MAX_TICKETS_PER_CHECKOUT:  # Limit to prevent abuse
            raise serializers.ValidationError(f"一度に予約できるチケットは{MAX_TICKETS_PER_CHECKOUT}枚までです。")
        return value
    
    def validate_promo_code(self, value):
        """Validate promo code"""
        if not value:
            return value
        
        value = sanitize_string(value.upper())
        
        try:
            promo = PromoCode.objects.get(code=value, is_active=True)
        except PromoCode.DoesNotExist:
            raise serializers.ValidationError("無効なプロモーションコードです。")
        
        # Check validity period
        now = timezone.now()
        if promo.valid_from and now < promo.valid_from:
            raise serializers.ValidationError("このプロモーションコードはまだ有効期間ではありません。")
        if promo.valid_until and now > promo.valid_until:
            raise serializers.ValidationError("このプロモーションコードの有効期限が切れています。")
        
        # Check usage limit
        if promo.usage_limit and promo.used_count >= promo.usage_limit:
            raise serializers.ValidationError("このプロモーションコードは使用上限に達しています。")
        
        return value
    
    def validate(self, data):
        """
        Validate quotas and inventory before checkout.
        """
        tickets = data['tickets']
        
        # Group by attribute to check quotas
        attribute_counts = {}
        for ticket in tickets:
            attr_id = str(ticket['attribute_id'])
            attribute_counts[attr_id] = attribute_counts.get(attr_id, 0) + 1
        
        # Check quotas
        for attr_id, count in attribute_counts.items():
            try:
                config = AttributeConfig.objects.get(id=attr_id, is_active=True)
                if count > config.max_total_limit:
                    raise serializers.ValidationError(
                        f"{config.display_name}は1予約あたり{config.max_total_limit}枚までです。"
                    )
            except AttributeConfig.DoesNotExist:
                raise serializers.ValidationError(f"無効な属性です: {attr_id}")
        
        # Group by slot to check capacity
        slot_counts = {}
        for ticket in tickets:
            slot_id = str(ticket['slot_id'])
            slot_counts[slot_id] = slot_counts.get(slot_id, 0) + 1
        
        # Check availability (preliminary - final check in create)
        for slot_id, count in slot_counts.items():
            try:
                slot = EntrySlot.objects.get(id=slot_id, is_active=True)
                if slot.remaining < count:
                    raise serializers.ValidationError(
                        f"{slot.event_date} {slot.start_time}の残り枠が不足しています。"
                    )
            except EntrySlot.DoesNotExist:
                raise serializers.ValidationError(f"無効な入場枠です: {slot_id}")
        
        return data
    
    @transaction.atomic
    def create(self, validated_data):
        """
        Create reservation and tickets atomically.
        Uses SELECT FOR UPDATE to prevent overselling.
        """
        tickets_data = validated_data.pop('tickets')
        promo_code_str = validated_data.pop('promo_code', None)
        
        # Handle promo code
        promo_code_obj = None
        discount_amount = 0
        if promo_code_str:
            try:
                promo_code_obj = PromoCode.objects.select_for_update().get(
                    code=promo_code_str.upper(),
                    is_active=True
                )
                
                # Double-check validity period with lock
                now = timezone.now()
                if promo_code_obj.valid_from and now < promo_code_obj.valid_from:
                    raise serializers.ValidationError("このプロモーションコードはまだ有効期間ではありません。")
                if promo_code_obj.valid_until and now > promo_code_obj.valid_until:
                    raise serializers.ValidationError("このプロモーションコードの有効期限が切れています。")
                
                # Double-check usage limit with lock
                if promo_code_obj.usage_limit and promo_code_obj.used_count >= promo_code_obj.usage_limit:
                    raise serializers.ValidationError("このプロモーションコードは使用上限に達しています。")
                
                discount_amount = promo_code_obj.discount_amount
                # Increment usage counter
                promo_code_obj.used_count += 1
                promo_code_obj.save()
            except PromoCode.DoesNotExist:
                raise serializers.ValidationError("無効なプロモーションコードです。")
        
        # Group by slot for locking
        slot_counts = {}
        for ticket in tickets_data:
            slot_id = str(ticket['slot_id'])
            slot_counts[slot_id] = slot_counts.get(slot_id, 0) + 1
        
        # Lock and update slots
        for slot_id, count in slot_counts.items():
            # SELECT FOR UPDATE to lock the row
            slot = EntrySlot.objects.select_for_update().get(id=slot_id)
            if slot.remaining < count:
                raise serializers.ValidationError(
                    f"{slot.event_date} {slot.start_time}の残り枠が不足しています。"
                )
            slot.booked_count += count
            slot.save()
        
        # Create reservation
        user = self.context.get('request').user if self.context.get('request') else None
        reservation = Reservation.objects.create(
            user=user if user and user.is_authenticated else None,
            guest_identifier=validated_data.get('guest_identifier', ''),
            user_name=validated_data.get('user_name', ''),
            user_email=validated_data.get('user_email', ''),
            total_tickets=len(tickets_data),
            promo_code=promo_code_obj,
            discount_amount=discount_amount
        )
        
        # Create tickets
        created_tickets = []
        for ticket_data in tickets_data:
            ticket = Ticket.objects.create(
                reservation=reservation,
                slot_id=ticket_data['slot_id'],
                attribute_id=ticket_data['attribute_id'],
                guest_info=ticket_data.get('guest_info', {})
            )
            created_tickets.append(ticket)
        
        return reservation


class CheckoutResponseSerializer(serializers.Serializer):
    """Response after successful checkout."""
    reservation_id = serializers.CharField()
    ticket_ids = serializers.ListField(child=serializers.UUIDField())
    total_tickets = serializers.IntegerField()
    discount_amount = serializers.IntegerField(required=False)
    promo_code = serializers.CharField(required=False)
    created_at = serializers.DateTimeField()


# === Check-in Serializers ===

class CheckInRequestSerializer(serializers.Serializer):
    """Request for QR code check-in."""
    ticket_uuid = serializers.UUIDField()
    device_id = serializers.CharField(max_length=100, required=False, allow_blank=True)
    operator = serializers.CharField(max_length=100, required=False, allow_blank=True)


class CheckInResponseSerializer(serializers.Serializer):
    """Response for check-in attempt."""
    success = serializers.BooleanField()
    message = serializers.CharField()
    ticket = TicketSerializer(required=False)


# === User Registration Serializers ===

class UserRegistrationSerializer(serializers.ModelSerializer):
    """ユーザー登録用シリアライザー"""
    password = serializers.CharField(write_only=True, required=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = User
        fields = ('username', 'email', 'password', 'password_confirm', 'first_name', 'last_name')

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({"password": "パスワードが一致しません。"})
        if User.objects.filter(email=attrs.get('email')).exists():
            raise serializers.ValidationError({"email": "このメールアドレスは既に使用されています。"})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', '')
        )
        return user


class UserSerializer(serializers.ModelSerializer):
    """ユーザー情報シリアライザー"""
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'date_joined')
        read_only_fields = ('id', 'username', 'date_joined')


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    """ユーザープロフィール更新用"""
    class Meta:
        model = User
        fields = ('email', 'first_name', 'last_name')


# === Ticket Update Serializers ===

class TicketUpdateSerializer(serializers.ModelSerializer):
    """チケット情報の修正用"""
    class Meta:
        model = Ticket
        fields = ['guest_info']

    def validate(self, attrs):
        ticket = self.instance
        # 属性設定で修正が許可されているかチェック
        if not ticket.attribute.is_modifiable:
            raise serializers.ValidationError("このチケットは情報の修正が許可されていません。")
        if ticket.status != Ticket.Status.VALID:
            raise serializers.ValidationError("有効なチケットのみ修正できます。")
        return attrs


class TicketCancelSerializer(serializers.Serializer):
    """チケットキャンセル確認用"""
    def validate(self, attrs):
        ticket = self.context.get('ticket')
        if not ticket:
            raise serializers.ValidationError("チケットが指定されていません。")
        
        # 属性設定でキャンセルが許可されているかチェック
        if not ticket.attribute.is_cancellable:
            raise serializers.ValidationError("このチケットはキャンセルが許可されていません。")
        
        if ticket.status != Ticket.Status.VALID:
            raise serializers.ValidationError("有効なチケットのみキャンセルできます。")
        
        # キャンセル期限チェック
        from datetime import datetime
        slot = ticket.slot
        slot_datetime = datetime.combine(slot.event_date, slot.start_time)
        slot_datetime = timezone.make_aware(slot_datetime)
        deadline = slot_datetime - timedelta(hours=ticket.attribute.cancel_deadline_hours)
        
        if timezone.now() > deadline:
            raise serializers.ValidationError(
                f"キャンセル期限を過ぎています。（入場時刻の{ticket.attribute.cancel_deadline_hours}時間前まで）"
            )
        
        return attrs


# === Announcement Serializers ===

class AnnouncementSerializer(serializers.ModelSerializer):
    """お知らせシリアライザー"""
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    
    class Meta:
        model = Announcement
        fields = [
            'id', 'title', 'content', 'priority', 'priority_display',
            'is_active', 'target_slot', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


# === Ticket Transfer Serializers ===

class TicketTransferSerializer(serializers.ModelSerializer):
    """チケット譲渡シリアライザー"""
    ticket_detail = TicketSerializer(source='ticket', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    
    class Meta:
        model = TicketTransfer
        fields = [
            'id', 'ticket', 'ticket_detail', 'from_user', 'to_user',
            'transfer_token', 'status', 'status_display',
            'expires_at', 'created_at', 'accepted_at'
        ]
        read_only_fields = ['id', 'from_user', 'transfer_token', 'created_at', 'accepted_at']


class TicketTransferCreateSerializer(serializers.Serializer):
    """チケット譲渡作成用"""
    ticket_id = serializers.UUIDField()
    
    def validate_ticket_id(self, value):
        user = self.context.get('request').user
        try:
            ticket = Ticket.objects.get(id=value, reservation__user=user)
        except Ticket.DoesNotExist:
            raise serializers.ValidationError("チケットが見つからないか、権限がありません。")
        
        if ticket.status != Ticket.Status.VALID:
            raise serializers.ValidationError("有効なチケットのみ譲渡できます。")
        
        # Check if there's already a pending transfer
        if TicketTransfer.objects.filter(ticket=ticket, status=TicketTransfer.Status.PENDING).exists():
            raise serializers.ValidationError("このチケットには既に保留中の譲渡があります。")
        
        return value


class TicketTransferAcceptSerializer(serializers.Serializer):
    """チケット譲渡受取用"""
    transfer_token = serializers.CharField(max_length=64)
    
    def validate_transfer_token(self, value):
        try:
            transfer = TicketTransfer.objects.get(transfer_token=value)
        except TicketTransfer.DoesNotExist:
            raise serializers.ValidationError("無効な譲渡リンクです。")
        
        if transfer.status != TicketTransfer.Status.PENDING:
            raise serializers.ValidationError("この譲渡は既に処理済みか期限切れです。")
        
        if timezone.now() > transfer.expires_at:
            transfer.status = TicketTransfer.Status.EXPIRED
            transfer.save()
            raise serializers.ValidationError("譲渡リンクの期限が切れています。")
        
        return value


class PromoCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PromoCode
        fields = '__all__'
