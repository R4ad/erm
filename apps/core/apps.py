from django.apps import AppConfig


class CoreConfig(AppConfig):
    name = "apps.core"

    def ready(self):
        from django.db.models import fields

        # Django 6.1 گزینه‌ی خالی فهرست‌های کشویی را «- Select an option -» می‌نویسد و هنوز ترجمه‌ی فارسی ندارد.
        # راه خود Django برای عوض کردنش همین است: مقدار BLANK_CHOICE_LABEL را در ready() یک اپ عوض کنیم.
        fields.BLANK_CHOICE_LABEL = "- انتخاب کنید -"
