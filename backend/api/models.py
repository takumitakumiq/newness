"""
MATSU - Database Models
Attribute-based Quotas and Dynamic Forms support
"""
import uuid
from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator


class EntrySlot(models.Model):
    """
    Master data: Available time slots for festival entry.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event_date = models.DateField(verbose_name="開催日")
    start_time = models.TimeField(verbose_name="開始時刻")
    end_time = models.TimeField(verbose_name="終了時刻", null=True, blank=True)
    capacity = models.PositiveIntegerField(
        verbose_name="定員",
        validators=[MinValueValidator(1)]
    )
    booked_count = models.PositiveIntegerField(
        verbose_name="予約済み数",
        default=0
    )
    is_active = models.BooleanField(verbose_name="有効", default=True)
    
    class Meta:
        db_table = "api_entryslot"
        ordering = ["event_date", "start_time"]
        verbose_name = "入場枠"
        verbose_name_plural = "入場枠"
        unique_together = [["event_date", "start_time"]]
    
    def __str__(self):
        return f"{self.event_date} {self.start_time}"
    
    @property
    def remaining(self):
        """Available spots remaining."""
        return max(0, self.capacity - self.booked_count)
    
    @property
    def availability_status(self):
        """Returns availability status for UI display."""
        remaining = self.remaining
        if remaining == 0:
            return "sold_out"
        elif remaining <= self.capacity * 0.1:
            return "few_left"
        elif remaining <= self.capacity * 0.3:
            return "limited"
        return "available"


class AttributeConfig(models.Model):
    """
    Master data: Configuration for each user type (Student, Parent, General).
    Defines purchase limits and dynamic form schema.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    target_type = models.CharField(
        max_length=50,
        unique=True,
        verbose_name="属性タイプ"
    )
    display_name = models.CharField(
        max_length=100,
        verbose_name="表示名"
    )
    max_total_limit = models.PositiveIntegerField(
        verbose_name="購入上限（1予約あたり）",
        validators=[MinValueValidator(1)],
        help_text="1回の予約で購入できる最大チケット数"
    )
    form_schema = models.JSONField(
        verbose_name="フォームスキーマ",
        default=list,
        blank=True,
        help_text="動的フォームの定義 (JSON形式)"
    )
    description = models.TextField(
        verbose_name="説明",
        blank=True
    )
    sort_order = models.PositiveIntegerField(
        verbose_name="表示順",
        default=0
    )
    is_active = models.BooleanField(
        verbose_name="有効",
        default=True
    )
    is_cancellable = models.BooleanField(
        verbose_name="キャンセル可",
        default=True,
        help_text="ユーザー自身によるキャンセルを許可するか"
    )
    is_modifiable = models.BooleanField(
        verbose_name="情報修正可",
        default=True,
        help_text="購入後のゲスト情報修正を許可するか"
    )
    cancel_deadline_hours = models.PositiveIntegerField(
        verbose_name="キャンセル期限（時間前）",
        default=24,
        help_text="入場時刻の何時間前までキャンセル可能か"
    )
    
    class Meta:
        db_table = "api_attributeconfig"
        ordering = ["sort_order", "target_type"]
        verbose_name = "属性設定"
        verbose_name_plural = "属性設定"
    
    def __str__(self):
        return f"{self.display_name} ({self.target_type})"


class Reservation(models.Model):
    """
    Transaction: A checkout session containing multiple tickets.
    """
    id = models.CharField(
        max_length=50,
        primary_key=True,
        editable=False
    )
    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reservations",
        verbose_name="ユーザー"
    )
    guest_identifier = models.CharField(
        max_length=255,
        verbose_name="ゲスト識別子",
        help_text="非ログインユーザーの識別子（メールアドレス等）",
        blank=True
    )
    user_name = models.CharField(
        max_length=255,
        verbose_name="代表者名",
        blank=True
    )
    user_email = models.EmailField(
        verbose_name="メールアドレス",
        blank=True
    )
    total_tickets = models.PositiveIntegerField(
        verbose_name="合計チケット数",
        default=0
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="予約日時"
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name="更新日時"
    )
    
    class Meta:
        db_table = "api_reservation"
        ordering = ["-created_at"]
        verbose_name = "予約"
        verbose_name_plural = "予約"
    
    def __str__(self):
        return f"{self.id} ({self.user_name or self.guest_identifier})"
    
    def save(self, *args, **kwargs):
        if not self.id:
            self.id = f"R-{uuid.uuid4().hex[:12].upper()}"
        super().save(*args, **kwargs)


class Ticket(models.Model):
    """
    Individual ticket: One row per person, linked to a Reservation.
    The ticket ID (UUID) is the content of the QR code.
    """
    class Status(models.TextChoices):
        VALID = "valid", "有効"
        ENTERED = "entered", "入場済み"
        CANCELLED = "cancelled", "キャンセル"
    
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )
    reservation = models.ForeignKey(
        Reservation,
        on_delete=models.CASCADE,
        related_name="tickets",
        verbose_name="予約"
    )
    slot = models.ForeignKey(
        EntrySlot,
        on_delete=models.PROTECT,
        related_name="tickets",
        verbose_name="入場枠"
    )
    attribute = models.ForeignKey(
        AttributeConfig,
        on_delete=models.PROTECT,
        related_name="tickets",
        verbose_name="属性"
    )
    guest_info = models.JSONField(
        verbose_name="ゲスト情報",
        default=dict,
        blank=True,
        help_text="動的フォームの回答 (JSON形式)"
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.VALID,
        verbose_name="ステータス"
    )
    entered_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="入場日時"
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="作成日時"
    )
    
    class Meta:
        db_table = "api_ticket"
        ordering = ["-created_at"]
        verbose_name = "チケット"
        verbose_name_plural = "チケット"
    
    def __str__(self):
        return f"{self.id} - {self.slot} ({self.get_status_display()})"


class CheckInLog(models.Model):
    """
    Audit log for check-in operations.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket = models.ForeignKey(
        Ticket,
        on_delete=models.CASCADE,
        related_name="checkin_logs",
        verbose_name="チケット"
    )
    action = models.CharField(
        max_length=50,
        verbose_name="アクション"
    )
    success = models.BooleanField(
        verbose_name="成功"
    )
    message = models.TextField(
        verbose_name="メッセージ",
        blank=True
    )
    device_id = models.CharField(
        max_length=100,
        verbose_name="端末ID",
        blank=True
    )
    operator = models.CharField(
        max_length=100,
        verbose_name="操作者",
        blank=True
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="記録日時"
    )
    
    class Meta:
        db_table = "api_checkinlog"
        ordering = ["-created_at"]
        verbose_name = "チェックインログ"
        verbose_name_plural = "チェックインログ"
    
    def __str__(self):
        return f"{self.ticket_id} - {self.action} ({self.created_at})"
