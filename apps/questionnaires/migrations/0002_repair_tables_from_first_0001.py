"""ترمیم پایگاه داده‌هایی که نسخه‌ی اول مهاجرت 0001 را اجرا کرده‌اند.

مهاجرت 0001 این اپ یک بار در commit fb28e41 ساخته شد و بعد در commit 7a710b9 (قلم‌های ثابت پرسشنامه طبق س۴۸) از
نو ساخته شد. پایگاهی که نسخه‌ی اول را اجرا کرده، 0001 را اجراشده می‌داند و migrate دیگر به آن دست نمی‌زند؛ پس
ستون‌های functions، conditions و current_controls را ندارد و ستون commitments هنوز با نام قبلی‌اش
services_and_commitments است. نتیجه همان خطای «column questionnaires_response.functions does not exist» در صفحه‌ی
«پاسخ به سؤال‌ها» است.

این مهاجرت ستون‌های جدول پاسخ و جدول تاریخچه‌اش را می‌خواند و فقط چیزی را که کم است درست می‌کند. روی پایگاه تازه، که
نسخه‌ی دوم 0001 را اجرا کرده، هیچ کاری نمی‌کند. state مدل‌ها همان است که 0001 ساخته، پس این مهاجرت فقط پایگاه داده
را عوض می‌کند.
"""

from django.db import migrations

OLD_COMMITMENTS_COLUMN = "services_and_commitments"
# ستون‌هایی که نسخه‌ی دوم 0001 اضافه کرد؛ commitments همان ستون قبلی با نام تازه است.
ADDED_FIELDS = ["functions", "conditions", "current_controls"]


def repair(apps, schema_editor):
    connection = schema_editor.connection
    quote = schema_editor.quote_name
    for model_name in ["Response", "HistoricalResponse"]:
        model = apps.get_model("questionnaires", model_name)
        table = model._meta.db_table
        with connection.cursor() as cursor:
            columns = {column.name for column in connection.introspection.get_table_description(cursor, table)}
        if OLD_COMMITMENTS_COLUMN in columns and "commitments" not in columns:
            # نام عوض می‌شود تا متن‌هایی که پیش‌تر در «خدمت و مشتری و تعهد» نوشته شده بماند.
            schema_editor.execute(
                schema_editor.sql_rename_column
                % {
                    "table": quote(table),
                    "old_column": quote(OLD_COMMITMENTS_COLUMN),
                    "new_column": quote("commitments"),
                }
            )
            columns = (columns - {OLD_COMMITMENTS_COLUMN}) | {"commitments"}
        for name in ADDED_FIELDS + ["commitments"]:
            if name not in columns:
                # ردیف‌های قبلی متن خالی می‌گیرند، همان پیش‌فرض فیلد متنی blank.
                schema_editor.add_field(model, model._meta.get_field(name))


class Migration(migrations.Migration):
    dependencies = [
        ("questionnaires", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(repair, migrations.RunPython.noop, elidable=True),
    ]
