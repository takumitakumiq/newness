"""
MATSU - API Serializers
"""
from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.utils import timezone
from datetime import timedelta
from .models import EntrySlot, AttributeConfig, Reservation, Ticket, Announcement, ChatMessage


class EntrySlotSerializer(serializers.ModelSerializer):
    """Serializer for entry slots with availability info."""
    remaining = serializers.ReadOnlyField()
    availability_status = serializers.ReadOnlyField()
    
    class Meta:
        model = EntrySlot
        fields = [
            'id', 'event_date', 'start_time', 'end_time',
            'capacity', 'booked_count', 'remaining',
            'availability_status', 'is_active', 'entry_closed'
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
    
    class Meta:
        model = Reservation
        fields = [
            'id', 'guest_identifier', 'user_name', 'user_email',
            'total_tickets', 'created_at', 'updated_at', 'tickets'
        ]
        read_only_fields = ['id', 'total_tickets', 'created_at', 'updated_at']


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
    
    def validate_tickets(self, value):
        if not value:
            raise serializers.ValidationError("チケットを1つ以上選択してください。")
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
            total_tickets=len(tickets_data)
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
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'date_joined', 'is_staff', 'is_superuser')
        read_only_fields = ('id', 'username', 'date_joined', 'is_staff', 'is_superuser')


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    """ユーザープロフィール更新用"""
    class Meta:
        model = User
        fields = ('email', 'first_name', 'last_name')


# === Ticket Update Serializers ===

class TicketUpdateSerializer(serializers.ModelSerializer):
    """チケット情報の修正用"""
    attribute_id = serializers.UUIDField(required=False, write_only=True)
    
    class Meta:
        model = Ticket
        fields = ['guest_info', 'attribute_id']

    def validate(self, attrs):
        ticket = self.instance
        # 属性設定で修正が許可されているかチェック
        if not ticket.attribute.is_modifiable:
            raise serializers.ValidationError("このチケットは情報の修正が許可されていません。")
        if ticket.status != Ticket.Status.VALID:
            raise serializers.ValidationError("有効なチケットのみ修正できます。")
        
        # 名前フィールドが必須
        guest_info = attrs.get('guest_info', {})
        if not guest_info.get('name') or str(guest_info.get('name', '')).strip() == '':
            raise serializers.ValidationError({"guest_info": "お名前は必須です。"})
        
        # attribute_idが指定された場合、存在確認
        if 'attribute_id' in attrs:
            try:
                new_attr = AttributeConfig.objects.get(id=attrs['attribute_id'], is_active=True)
                attrs['_new_attribute'] = new_attr
            except AttributeConfig.DoesNotExist:
                raise serializers.ValidationError({"attribute_id": "指定されたチケット種別は存在しません。"})
        
        return attrs

    def update(self, instance, validated_data):
        # attribute_idの処理
        if '_new_attribute' in validated_data:
            instance.attribute = validated_data.pop('_new_attribute')
        validated_data.pop('attribute_id', None)
        
        return super().update(instance, validated_data)


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

class ChatMessageSerializer(serializers.ModelSerializer):
    """スタッフチャットメッセージ用シリアライザー"""
    sender_name = serializers.CharField(source='sender.username', read_only=True)
    
    class Meta:
        model = ChatMessage
        fields = ['id', 'sender', 'sender_name', 'content', 'created_at']
        read_only_fields = ['id', 'sender', 'sender_name', 'created_at']


class ChatReadStatusSerializer(serializers.Serializer):
    """チャット既読状態レスポンス用"""
    unread_count = serializers.IntegerField()
    last_read_at = serializers.DateTimeField(allow_null=True)
    total_messages = serializers.IntegerField()
