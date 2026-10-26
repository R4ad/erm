from django.db import migrations

# نام‌ها عمداً اینجا تکرار شده‌اند و از roles.py خوانده نمی‌شوند:
# migration باید همیشه همان کاری را بکند که روز نوشتنش می‌کرد.
ROLE_NAMES = [
    "مدیر سامانه",
    "مدیر واحد",
    "عضو GRC",
    "کارگروه امنیت",
    "کمیته امنیت",
    "فقط مشاهده",
]


def create_groups(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    for name in ROLE_NAMES:
        Group.objects.get_or_create(name=name)


def delete_groups(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Group.objects.filter(name__in=ROLE_NAMES).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_personnel_code_and_managed_units"),
    ]

    operations = [
        migrations.RunPython(create_groups, delete_groups),
    ]
