"""برای کاربرانی که پیش از تاریخچه ساخته شده‌اند یک ردیف آغازین می‌سازد تا اولین ویرایششان با چیزی مقایسه شود.
همان کار دستور populate_history در simple-history، ولی خودکار با migrate."""

from django.db import migrations
from django.utils import timezone


def create_initial_history(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    HistoricalUser = apps.get_model("accounts", "HistoricalUser")
    copied = [
        field.attname
        for field in HistoricalUser._meta.fields
        if not field.name.startswith("history_") and field.name != "id"
    ]
    now = timezone.now()
    HistoricalUser.objects.bulk_create(
        HistoricalUser(
            id=user.pk,
            history_date=now,
            history_type="+",
            history_change_reason="تاریخچه‌ی آغازین",
            **{name: getattr(user, name) for name in copied},
        )
        for user in User.objects.exclude(pk__in=HistoricalUser.objects.values("id"))
    )


class Migration(migrations.Migration):
    dependencies = [("accounts", "0006_historicaluser")]

    operations = [migrations.RunPython(create_initial_history, migrations.RunPython.noop)]
