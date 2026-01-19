from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0009_add_email_settings"),
    ]

    operations = [
        migrations.CreateModel(
            name="AdminActionLog",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("action", models.CharField(max_length=100, verbose_name="アクション")),
                ("target_type", models.CharField(max_length=100, blank=True, verbose_name="対象種別")),
                ("target_id", models.CharField(max_length=255, blank=True, verbose_name="対象ID")),
                ("metadata", models.JSONField(default=dict, blank=True, verbose_name="メタデータ")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="作成日時")),
                (
                    "actor",
                    models.ForeignKey(
                        null=True,
                        blank=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="admin_action_logs",
                        to="auth.user",
                        verbose_name="操作者",
                    ),
                ),
            ],
            options={
                "db_table": "api_adminactionlog",
                "ordering": ["-created_at"],
                "verbose_name": "管理操作ログ",
                "verbose_name_plural": "管理操作ログ",
            },
        ),
    ]
