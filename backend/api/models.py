"""
MATSU - Database Models
Attribute-based Quotas and Dynamic Forms support
"""
import uuid
from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MinValueValidator
from django.utils import timezone


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
    entry_closed = models.BooleanField(
        verbose_name="入場締切",
        default=False,
        help_text="ONにするとチェックインを拒否（入場締切）"
    )
    
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


class AdminActionLog(models.Model):
    """
    Audit log for admin/system operations.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="admin_action_logs",
        verbose_name="操作者",
    )
    action = models.CharField(max_length=100, verbose_name="アクション")
    target_type = models.CharField(max_length=100, blank=True, verbose_name="対象種別")
    target_id = models.CharField(max_length=255, blank=True, verbose_name="対象ID")
    metadata = models.JSONField(default=dict, blank=True, verbose_name="メタデータ")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="作成日時")

    class Meta:
        db_table = "api_adminactionlog"
        ordering = ["-created_at"]
        verbose_name = "管理操作ログ"
        verbose_name_plural = "管理操作ログ"

    def __str__(self):
        actor = self.actor.username if self.actor else "unknown"
        return f"{actor} - {self.action} ({self.created_at})"


class Announcement(models.Model):
    """
    サイト上に表示する緊急お知らせ
    """
    class Priority(models.TextChoices):
        INFO = "info", "お知らせ"
        WARNING = "warning", "注意"
        CRITICAL = "critical", "緊急"
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(
        max_length=200,
        verbose_name="タイトル"
    )
    content = models.TextField(
        verbose_name="内容"
    )
    priority = models.CharField(
        max_length=20,
        choices=Priority.choices,
        default=Priority.INFO,
        verbose_name="重要度"
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name="表示中"
    )
    target_slot = models.ForeignKey(
        EntrySlot,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="announcements",
        verbose_name="対象入場枠",
        help_text="特定の入場枠に関するお知らせの場合に選択"
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="作成日時"
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name="更新日時"
    )
    
    class Meta:
        db_table = "api_announcement"
        ordering = ["-created_at"]
        verbose_name = "お知らせ"
        verbose_name_plural = "お知らせ"
    
    def __str__(self):
        return f"[{self.get_priority_display()}] {self.title}"


class ChatMessage(models.Model):
    """
    Staff chat messages for internal communication.
    スタッフ間のリアルタイムチャット用メッセージ
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sender = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='chat_messages',
        verbose_name="送信者"
    )
    content = models.TextField(
        verbose_name="メッセージ内容",
        max_length=500,  # 長さ制限を追加
        help_text="最大500文字"
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="送信日時")

    class Meta:
        db_table = "api_chatmessage"
        ordering = ['-created_at']
        verbose_name = "チャットメッセージ"
        verbose_name_plural = "チャットメッセージ"

    def __str__(self):
        return f"{self.sender.username}: {self.content[:30]}"

    def to_payload(self):
        return {
            "id": str(self.id),
            "user_id": self.sender.id,
            "username": self.sender.username,
            "content": self.content,
            "created_at": self.created_at.isoformat(),
            "is_staff": self.sender.is_staff,
        }


class ChatMessageRead(models.Model):
    """
    既読管理: ユーザーごとの最終既読位置を記録
    """
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        primary_key=True,
        related_name='chat_read_status',
        verbose_name="ユーザー"
    )
    last_read_at = models.DateTimeField(
        verbose_name="最終既読日時",
        help_text="この日時より前のメッセージは既読とみなす"
    )
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新日時")

    class Meta:
        db_table = "api_chatmessageread"
        verbose_name = "チャット既読状態"
        verbose_name_plural = "チャット既読状態"

    def __str__(self):
        return f"{self.user.username}: {self.last_read_at}"


class TicketShareLink(models.Model):
    """
    チケット単位の閲覧専用共有リンク
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    token = models.CharField(max_length=64, unique=True, db_index=True)
    ticket = models.ForeignKey(
        Ticket,
        on_delete=models.CASCADE,
        related_name="share_links",
        verbose_name="チケット",
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ticket_share_links",
        verbose_name="作成者",
    )
    expires_at = models.DateTimeField(verbose_name="有効期限")
    revoked_at = models.DateTimeField(null=True, blank=True, verbose_name="無効化日時")
    max_accesses = models.PositiveIntegerField(
        default=0,
        verbose_name="最大アクセス回数",
        help_text="0の場合は無制限"
    )
    access_count = models.PositiveIntegerField(default=0, verbose_name="アクセス回数")
    last_accessed_at = models.DateTimeField(null=True, blank=True, verbose_name="最終アクセス日時")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="作成日時")

    class Meta:
        db_table = "api_ticketsharelink"
        ordering = ["-created_at"]
        verbose_name = "チケット共有リンク"
        verbose_name_plural = "チケット共有リンク"

    def __str__(self):
        return f"share:{self.ticket_id} ({self.created_at})"

    def is_active(self):
        if self.revoked_at:
            return False
        if self.max_accesses and self.access_count >= self.max_accesses:
            return False
        return self.expires_at >= timezone.now()


class ShareLinkAccessLog(models.Model):
    """
    共有リンクのアクセスログ
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    share_link = models.ForeignKey(
        TicketShareLink,
        on_delete=models.CASCADE,
        related_name="access_logs",
        verbose_name="共有リンク",
    )
    ticket = models.ForeignKey(
        Ticket,
        on_delete=models.CASCADE,
        related_name="share_access_logs",
        verbose_name="チケット",
    )
    ip_address = models.CharField(max_length=64, blank=True, verbose_name="IPアドレス")
    user_agent = models.TextField(blank=True, verbose_name="ユーザーエージェント")
    success = models.BooleanField(default=True, verbose_name="成功")
    message = models.TextField(blank=True, verbose_name="メッセージ")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="アクセス日時")

    class Meta:
        db_table = "api_sharelinkaccesslog"
        ordering = ["-created_at"]
        verbose_name = "共有リンクアクセスログ"
        verbose_name_plural = "共有リンクアクセスログ"

    def __str__(self):
        return f"{self.share_link_id} ({self.created_at})"


class EmailDeliveryLog(models.Model):
    """
    メール送信ログ
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    to_email = models.EmailField(verbose_name="送信先")
    subject = models.CharField(max_length=255, verbose_name="件名")
    mode = models.CharField(max_length=20, verbose_name="送信モード")
    success = models.BooleanField(default=False, verbose_name="成功")
    provider_message = models.TextField(blank=True, verbose_name="プロバイダ応答")
    reservation = models.ForeignKey(
        Reservation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="email_logs",
        verbose_name="予約",
    )
    ticket = models.ForeignKey(
        Ticket,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="email_logs",
        verbose_name="チケット",
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="email_delivery_logs",
        verbose_name="操作者",
    )
    metadata = models.JSONField(default=dict, blank=True, verbose_name="メタデータ")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="送信日時")

    class Meta:
        db_table = "api_emaildeliverylog"
        ordering = ["-created_at"]
        verbose_name = "メール送信ログ"
        verbose_name_plural = "メール送信ログ"

    def __str__(self):
        return f"{self.to_email} ({self.created_at})"


class UserProfile(models.Model):
    """
    顧客サポート向けの補助情報
    """
    class VerificationStatus(models.TextChoices):
        UNVERIFIED = "unverified", "未確認"
        PENDING = "pending", "確認中"
        VERIFIED = "verified", "確認済み"
        REJECTED = "rejected", "却下"

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="profile",
        verbose_name="ユーザー",
    )
    support_note = models.TextField(blank=True, default="", verbose_name="サポートメモ")
    verification_status = models.CharField(
        max_length=20,
        choices=VerificationStatus.choices,
        default=VerificationStatus.UNVERIFIED,
        verbose_name="本人確認ステータス",
    )
    verification_note = models.TextField(blank=True, default="", verbose_name="本人確認メモ")
    verification_updated_at = models.DateTimeField(null=True, blank=True, verbose_name="本人確認更新日時")
    verification_updated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="verification_updates",
        verbose_name="本人確認更新者",
    )
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新日時")

    class Meta:
        db_table = "api_userprofile"
        verbose_name = "ユーザープロフィール"
        verbose_name_plural = "ユーザープロフィール"

    def __str__(self):
        return f"{self.user.username} profile"


class SystemSetting(models.Model):
    """
    システム全体の設定（緊急停止、メール設定など）
    シングルトンパターン: 常に1レコードのみ
    """
    class EmailMode(models.TextChoices):
        TEST = "test", "テストモード（メール送信しない）"
        PRODUCTION = "production", "本番モード（SendGrid送信）"

    class OperationMode(models.TextChoices):
        NORMAL = "normal", "通常"
        READ_ONLY = "read_only", "読み取り専用"
        PURCHASE_STOP = "purchase_stop", "購入停止"
        CHECKIN_ONLY = "checkin_only", "チェックイン専用"
    
    id = models.AutoField(primary_key=True)
    emergency_stop = models.BooleanField(
        default=False,
        verbose_name="緊急停止",
        help_text="ONにするとチェックイン・チェックアウトが全て停止"
    )
    emergency_message = models.TextField(
        blank=True,
        default="",
        verbose_name="緊急停止時のメッセージ"
    )
    maintenance_mode = models.BooleanField(
        default=False,
        verbose_name="メンテナンスモード",
        help_text="ONにすると一般ユーザーはアクセス不可"
    )
    operation_mode = models.CharField(
        max_length=20,
        choices=OperationMode.choices,
        default=OperationMode.NORMAL,
        verbose_name="運用モード",
    )
    
    # メール設定
    email_mode = models.CharField(
        max_length=20,
        choices=EmailMode.choices,
        default=EmailMode.TEST,
        verbose_name="メール送信モード"
    )
    sendgrid_api_key = models.CharField(
        max_length=200,
        blank=True,
        default="",
        verbose_name="SendGrid APIキー",
        help_text="本番モード時に使用するSendGrid APIキー"
    )
    email_from_address = models.EmailField(
        default="noreply@example.com",
        verbose_name="送信元メールアドレス"
    )
    email_from_name = models.CharField(
        max_length=100,
        default="MATSU チケットシステム",
        verbose_name="送信者名"
    )
    
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新日時")
    updated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="更新者"
    )

    class Meta:
        db_table = "api_systemsetting"
        verbose_name = "システム設定"
        verbose_name_plural = "システム設定"

    def __str__(self):
        return f"SystemSetting (emergency={self.emergency_stop})"

    def save(self, *args, **kwargs):
        # シングルトンパターン: 常にid=1で上書き
        self.id = 1
        super().save(*args, **kwargs)

    @classmethod
    def get_instance(cls):
        """Get or create the singleton instance."""
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def to_snapshot(self) -> dict:
        return {
            "emergency_stop": self.emergency_stop,
            "emergency_message": self.emergency_message,
            "maintenance_mode": self.maintenance_mode,
            "operation_mode": self.operation_mode,
            "email_mode": self.email_mode,
            "sendgrid_api_key": self.sendgrid_api_key,
            "email_from_address": self.email_from_address,
            "email_from_name": self.email_from_name,
        }


class SystemSettingHistory(models.Model):
    """
    システム設定の変更履歴
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    system_setting = models.ForeignKey(
        SystemSetting,
        on_delete=models.CASCADE,
        related_name="history",
        verbose_name="システム設定",
    )
    action = models.CharField(max_length=100, verbose_name="アクション")
    snapshot = models.JSONField(default=dict, verbose_name="スナップショット")
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="system_setting_histories",
        verbose_name="作成者",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="作成日時")

    class Meta:
        db_table = "api_systemsettinghistory"
        ordering = ["-created_at"]
        verbose_name = "システム設定履歴"
        verbose_name_plural = "システム設定履歴"

    def __str__(self):
        return f"{self.action} ({self.created_at})"
