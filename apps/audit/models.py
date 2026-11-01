from django.conf import settings
from django.db import models
from django.utils import timezone


class AuditLogIsReadOnly(Exception):
    """رویدادهای Audit Log فقط ساخته می‌شوند؛ ویرایش و حذفشان خطاست."""


class AuditEventQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise AuditLogIsReadOnly("رویدادهای Audit Log ویرایش نمی‌شوند.")

    def delete(self):
        raise AuditLogIsReadOnly("رویدادهای Audit Log حذف نمی‌شوند.")


class AuditEvent(models.Model):
    """رویدادی که تغییر داده نیست، مثل ورود یا خروجی گرفتن. تغییر داده‌ها را simple-history ثبت می‌کند."""

    class Event(models.TextChoices):
        LOGIN = "login", "ورود"
        LOGOUT = "logout", "خروج"
        LOGIN_FAILED = "login_failed", "ورود ناموفق"
        PERMISSION_DENIED = "permission_denied", "دسترسی ردشده"
        ROLES_CHANGED = "roles_changed", "تغییر نقش"
        MANAGED_UNITS_CHANGED = "managed_units_changed", "تغییر واحدهای تحت مدیریت"
        SCOPE_UNITS_CHANGED = "scope_units_changed", "تغییر دامنه‌ی مشاهده"
        EXPORT = "export", "خروجی گرفتن"

    # کاربری که رویداد را انجام داده. PROTECT: کاربری که سابقه دارد حذف نمی‌شود، فقط غیرفعال می‌شود.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="کاربر",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="audit_events",
    )
    username = models.CharField("نام کاربری", max_length=150, blank=True)
    event = models.CharField("رویداد", max_length=30, choices=Event.choices)
    at = models.DateTimeField("زمان", default=timezone.now, editable=False, db_index=True)
    ip_address = models.GenericIPAddressField("نشانی IP", null=True, blank=True)
    user_agent = models.CharField("مرورگر", max_length=300, blank=True)
    details = models.JSONField("جزئیات", default=dict, blank=True)

    objects = AuditEventQuerySet.as_manager()

    class Meta:
        verbose_name = "رویداد"
        verbose_name_plural = "رویدادها"
        ordering = ["-at", "-pk"]

    def __str__(self):
        return f"{self.get_event_display()} {self.username}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise AuditLogIsReadOnly("رویدادهای Audit Log ویرایش نمی‌شوند.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise AuditLogIsReadOnly("رویدادهای Audit Log حذف نمی‌شوند.")

    @property
    def summary(self):
        """شرح کوتاه جزئیات برای فهرست و خروجی Excel."""
        details = self.details
        if self.event == self.Event.PERMISSION_DENIED:
            return details.get("path", "")
        if self.event in (
            self.Event.ROLES_CHANGED,
            self.Event.MANAGED_UNITS_CHANGED,
            self.Event.SCOPE_UNITS_CHANGED,
        ):
            verb = "افزوده شد" if details.get("action") == "added" else "برداشته شد"
            return f"{details.get('target', '')}: {'، '.join(details.get('items', []))} {verb}"
        if self.event == self.Event.EXPORT:
            return f"{details.get('report', '')} ({details.get('rows', 0)} ردیف)"
        return ""