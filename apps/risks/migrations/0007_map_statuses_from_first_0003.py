"""وضعیت ریسک‌هایی که پیش از جدول چرخه‌ی عمر س۱۵ ساخته شده‌اند.

مهاجرت 0003 در commit bae6d2d سر جایش اصلاح شد: ده وضعیت قبلی (پیش‌نویس، شناسایی‌شده و ...) جای خودشان را به هشت
وضعیت جدول س۱۵ دادند. ستونی عوض نشد، ولی ریسکی که روی پایگاه قدیمی ساخته شده هنوز یکی از مقدارهای قبلی را دارد؛
چنین ریسکی در رجیستر با نام خام وضعیت دیده می‌شود و هیچ انتقال گردش کاری برایش نیست، چون هیچ انتقالی از آن
وضعیت‌ها شروع نمی‌شود.

تا پیش از قدم ۱۴ انتقالی نبود و هر ریسک تازه «پیش‌نویس» بود؛ پس در عمل فقط draft پیدا می‌شود، که همان «ثبت‌شده در
رجیستر» امروز است. بقیه به نزدیک‌ترین وضعیت تازه می‌روند. روی پایگاه تازه هیچ ردیفی عوض نمی‌شود. تاریخچه‌ی ریسک‌ها
دست نمی‌خورد، چون سابقه است.
"""

from django.db import migrations

OLD_TO_NEW = {
    "draft": "registered",
    "identified": "registered",
    "assessing": "assessment",
    "quality_check": "assessment",
    "decision": "assessment",
    "treating": "treatment",
    "accepted": "treatment",
    "reassessing": "review",
    "retired": "closed",
    "merged": "closed",
}


def map_statuses(apps, schema_editor):
    Risk = apps.get_model("risks", "Risk")
    for old, new in OLD_TO_NEW.items():
        Risk.objects.filter(status=old).update(status=new)


class Migration(migrations.Migration):
    dependencies = [
        ("risks", "0006_risk_controls_historicalrisk_controls"),
    ]

    operations = [
        migrations.RunPython(map_statuses, migrations.RunPython.noop, elidable=True),
    ]
