from django.db import migrations

# جریان پرسشنامه‌ی قدیمی (پرسشنامه، سؤال، گزینه، جواب، تمهید و شاهد اولیه) با داده‌اش حذف می‌شود؛ سامانه هنوز عملیاتی
# نشده و حذف داده و جدول‌های تاریخچه‌ی همین مدل‌ها را مالک محصول تأیید کرده است. پاسخ‌های قدیمی هم که بدون پرسشنامه
# معنایی ندارند پاک می‌شوند؛ تاریخچه‌ی Response و PendingRisk می‌ماند. برگشت این مایگریشن فقط ساختار را برمی‌گرداند و
# داده فقط از پشتیبان برمی‌گردد.


def delete_legacy_responses(apps, schema_editor):
    apps.get_model("questionnaires", "Response").objects.all().delete()


class Migration(migrations.Migration):
    # جدا از 0008، تا حذف ردیف‌ها و ALTER TABLE در یک تراکنش نباشند (PostgreSQL: pending trigger events).

    dependencies = [
        ("questionnaires", "0006_initialevidence_source_key_and_more"),
    ]

    operations = [
        migrations.RunPython(delete_legacy_responses, migrations.RunPython.noop),
    ]
