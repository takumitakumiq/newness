from django.db import migrations, models
import django.db.models.deletion
import uuid


def create_admin_groups(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    for name in ["admin_read", "admin_ops", "admin_emergency", "admin_audit", "admin_support", "admin_bulk"]:
        Group.objects.get_or_create(name=name)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0012_ticket_share_link"),
    ]

    operations = [
        migrations.AddField(
            model_name="entryslot",
            name="entry_closed",
            field=models.BooleanField(default=False, help_text="ONにするとチェックインを拒否（入場締切）", verbose_name="入場締切"),
        ),
        migrations.AddField(
            model_name="ticketsharelink",
            name="max_accesses",
            field=models.PositiveIntegerField(default=0, help_text="0の場合は無制限", verbose_name="最大アクセス回数"),
        ),
        migrations.AddField(
            model_name="ticketsharelink",
            name="access_count",
            field=models.PositiveIntegerField(default=0, verbose_name="アクセス回数"),
        ),
        migrations.AddField(
            model_name="ticketsharelink",
            name="last_accessed_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="最終アクセス日時"),
        ),
        migrations.CreateModel(
            name="ShareLinkAccessLog",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("ip_address", models.CharField(blank=True, max_length=64, verbose_name="IPアドレス")),
                ("user_agent", models.TextField(blank=True, verbose_name="ユーザーエージェント")),
                ("success", models.BooleanField(default=True, verbose_name="成功")),
                ("message", models.TextField(blank=True, verbose_name="メッセージ")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="アクセス日時")),
                ("share_link", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="access_logs", to="api.ticketsharelink", verbose_name="共有リンク")),
                ("ticket", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="share_access_logs", to="api.ticket", verbose_name="チケット")),
            ],
            options={
                "verbose_name": "共有リンクアクセスログ",
                "verbose_name_plural": "共有リンクアクセスログ",
                "db_table": "api_sharelinkaccesslog",
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="EmailDeliveryLog",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("to_email", models.EmailField(max_length=254, verbose_name="送信先")),
                ("subject", models.CharField(max_length=255, verbose_name="件名")),
                ("mode", models.CharField(max_length=20, verbose_name="送信モード")),
                ("success", models.BooleanField(default=False, verbose_name="成功")),
                ("provider_message", models.TextField(blank=True, verbose_name="プロバイダ応答")),
                ("metadata", models.JSONField(blank=True, default=dict, verbose_name="メタデータ")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="送信日時")),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="email_delivery_logs", to="auth.user", verbose_name="操作者")),
                ("reservation", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="email_logs", to="api.reservation", verbose_name="予約")),
                ("ticket", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="email_logs", to="api.ticket", verbose_name="チケット")),
            ],
            options={
                "verbose_name": "メール送信ログ",
                "verbose_name_plural": "メール送信ログ",
                "db_table": "api_emaildeliverylog",
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="UserProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("support_note", models.TextField(blank=True, default="", verbose_name="サポートメモ")),
                ("verification_status", models.CharField(choices=[("unverified", "未確認"), ("pending", "確認中"), ("verified", "確認済み"), ("rejected", "却下")], default="unverified", max_length=20, verbose_name="本人確認ステータス")),
                ("verification_note", models.TextField(blank=True, default="", verbose_name="本人確認メモ")),
                ("verification_updated_at", models.DateTimeField(blank=True, null=True, verbose_name="本人確認更新日時")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="更新日時")),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="profile", to="auth.user", verbose_name="ユーザー")),
                ("verification_updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="verification_updates", to="auth.user", verbose_name="本人確認更新者")),
            ],
            options={
                "verbose_name": "ユーザープロフィール",
                "verbose_name_plural": "ユーザープロフィール",
                "db_table": "api_userprofile",
            },
        ),
        migrations.AddField(
            model_name="systemsetting",
            name="operation_mode",
            field=models.CharField(choices=[("normal", "通常"), ("read_only", "読み取り専用"), ("purchase_stop", "購入停止"), ("checkin_only", "チェックイン専用")], default="normal", max_length=20, verbose_name="運用モード"),
        ),
        migrations.CreateModel(
            name="SystemSettingHistory",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("action", models.CharField(max_length=100, verbose_name="アクション")),
                ("snapshot", models.JSONField(default=dict, verbose_name="スナップショット")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="作成日時")),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="system_setting_histories", to="auth.user", verbose_name="作成者")),
                ("system_setting", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="history", to="api.systemsetting", verbose_name="システム設定")),
            ],
            options={
                "verbose_name": "システム設定履歴",
                "verbose_name_plural": "システム設定履歴",
                "db_table": "api_systemsettinghistory",
                "ordering": ["-created_at"],
            },
        ),
        migrations.RunPython(create_admin_groups, noop_reverse),
    ]
