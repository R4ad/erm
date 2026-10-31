from django.apps import AppConfig


class AuditConfig(AppConfig):
    name = "apps.audit"
    verbose_name = "سوابق ممیزی"

    def ready(self):
        from django.contrib.auth.models import update_last_login
        from django.contrib.auth.signals import user_logged_in

        from . import signals  # noqa: F401  گیرنده‌های سیگنال با همین import وصل می‌شوند

        # Django با هر ورود last_login را با save() ذخیره می‌کند و هر save یک ردیف بی‌معنی در تاریخچه‌ی
        # کاربر می‌سازد. گیرنده‌ی ورود ما همین کار را بدون save انجام می‌دهد، پس گیرنده‌ی خود Django را برمی‌داریم.
        user_logged_in.disconnect(update_last_login, dispatch_uid="update_last_login")
