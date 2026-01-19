from django.db import migrations


def create_admin_groups(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    for name in ["admin_read", "admin_ops", "admin_emergency"]:
        Group.objects.get_or_create(name=name)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0010_adminactionlog"),
    ]

    operations = [
        migrations.RunPython(create_admin_groups, noop_reverse),
    ]
