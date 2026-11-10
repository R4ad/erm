"""هشت دسته‌ی اصلی ریسک از جدول بخش ۵ سند v5 (طبقه‌بندی و جهان ریسک).

داده همین‌جا نوشته شده و از کد اپ import نمی‌شود، چون migration باید همیشه همین داده را بسازد."""

from django.db import migrations
from django.utils import timezone

CATEGORIES = [
    ("T1", "امنیت اطلاعات و سایبری"),
    ("T2", "نرم‌افزار و توسعه"),
    ("T3", "زیرساخت و فناوری"),
    ("T4", "عملیات و ارائه خدمت"),
    ("T5", "اشخاص ثالث و زنجیره تأمین"),
    ("T6", "افراد و سازمان"),
    ("T7", "تداوم و محیط"),
    ("T8", "انطباق و حاکمیت داده"),
]


def create_categories(apps, schema_editor):
    RiskCategory = apps.get_model("risks", "RiskCategory")
    HistoricalRiskCategory = apps.get_model("risks", "HistoricalRiskCategory")
    now = timezone.now()
    for code, name in CATEGORIES:
        category = RiskCategory.objects.create(code=code, name=name)
        # در migration سیگنال‌های simple-history اجرا نمی‌شوند؛ ردیف «ایجاد» دستی ساخته می‌شود تا اولین ویرایش
        # هر دسته با چیزی مقایسه شود (مثل migration 0002 اپ methodology).
        HistoricalRiskCategory.objects.create(
            id=category.pk,
            code=code,
            name=name,
            is_active=True,
            created_at=category.created_at,
            updated_at=category.updated_at,
            history_date=now,
            history_type="+",
            history_change_reason="هشت دسته‌ی بخش ۵ سند v5",
        )


class Migration(migrations.Migration):
    dependencies = [("risks", "0001_initial")]

    # برگشت جداگانه ندارد: با «migrate risks zero» جدول‌های migration 0001 و داده‌شان با هم پاک می‌شوند.
    operations = [migrations.RunPython(create_categories, migrations.RunPython.noop)]
