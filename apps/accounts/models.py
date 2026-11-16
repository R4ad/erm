from datetime import time

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone
from django.core.validators import RegexValidator

from apps.organization.services import get_subtree_ids
from .roles import Role
from simple_history.models import HistoricalRecords

class User(AbstractUser):
    class Source(models.TextChoices):
        LOCAL = "local", "محلی"
        AD = "ad", "AD"

    personnel_code = models.CharField(
        "کد پرسنلی",
        max_length=20,
        unique=True,
        null=True,
        blank=True,
        validators=[RegexValidator(r"^\d+$", "کد پرسنلی فقط باید رقم باشد.")],
    )
    job_title = models.CharField("عنوان شغلی", max_length=200, blank=True)
    source = models.CharField(
        "منبع حساب",
        max_length=10,
        choices=Source.choices,
        default=Source.LOCAL,
        help_text="حساب محلی سامانه یا حسابی که از Active Directory همگام می‌شود.",
    )
    access_expires = models.DateField(
        "دسترسی موقت تا",
        null=True,
        blank=True,
        help_text="برای ممیز یا مشاور بیرونی. پس از این روز ورود و نشست کاربر پذیرفته نمی‌شود؛ خالی یعنی دائمی.",
    )
    org_unit = models.ForeignKey(
        "organization.OrgUnit",
        verbose_name="واحد سازمانی",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="members",
    )
    managed_units = models.ManyToManyField(
        "organization.OrgUnit",
        verbose_name="واحد های تحت مدیریت",
        blank=True,
        related_name="managers",
    )
    scope_units = models.ManyToManyField(
        "organization.OrgUnit",
        verbose_name="دامنه‌ی مشاهده",
        blank=True,
        related_name="scoped_viewers",
        help_text="فقط برای نقش «فقط مشاهده». اگر واحدی انتخاب شود، فقط سوابق همین واحدها و زیرمجموعه‌هایشان "
        "دیده می‌شود. خالی یعنی همه‌ی سوابق.",
    )
    history = HistoricalRecords(excluded_fields=["password", "last_login"])

    def has_role(self, *roles):
        return self.groups.filter(name__in=roles).exists()

    @property
    def role_names(self):
        return list(self.groups.filter(name__in=Role.ALL).values_list("name", flat=True))

    @property
    def is_system_admin(self):
        return self.is_superuser or self.has_role(Role.SYSTEM_ADMIN)

    @property
    def can_view_audit_log(self):
        return self.is_system_admin or self.has_role(Role.VIEWER)

    def managed_unit_ids(self):
        ids = set()
        for unit in self.managed_units.all():
            ids |= get_subtree_ids(unit)
        return ids

    def scope_unit_ids(self):
        """واحدهایی که ممیز می‌بیند، با زیرمجموعه‌هایشان. None یعنی دامنه‌ای تعیین نشده و همه را می‌بیند."""
        units = list(self.scope_units.all())
        if not units:
            return None
        ids = set()
        for unit in units:
            ids |= get_subtree_ids(unit)
        return ids


class DirectoryConnection(models.Model):
    """اتصال Active Directory (فیگما ۲۸)؛ یک ردیف. گذرواژه‌ی حساب سرویس در پایگاه داده نیست و فقط در محیط اجرا است.
    همگام‌سازی واحد و وضعیت حساب را می‌آورد؛ نقش‌های سامانه هرگز از گروه‌های AD اعطا یا حذف نمی‌شوند."""

    class State(models.TextChoices):
        UNKNOWN = "unknown", "آزموده نشده"
        CONNECTED = "connected", "متصل"
        FAILED = "failed", "ناموفق"

    server = models.CharField("نشانی سرور", max_length=200, help_text="مثل ldaps://dc01.datin.local:636")
    base_dn = models.CharField("شاخه‌ی پایه", max_length=300)
    service_account = models.CharField("حساب سرویس", max_length=150, help_text="حساب فقط‌خواندنی.")
    schedule = models.TimeField("زمان پیش‌نمایش روزانه", default=time(8, 30))
    auto_create = models.BooleanField("ایجاد خودکار کاربر جدید", default=True)
    update_unit = models.BooleanField("به‌روزرسانی واحد از شاخه‌ی AD", default=True)
    deactivate = models.BooleanField("غیرفعال‌سازی هم‌زمان با AD", default=True)
    excluded = models.JSONField("شاخه‌های مستثنا", default=list, blank=True)
    state = models.CharField("وضعیت اتصال", max_length=10, choices=State.choices, default=State.UNKNOWN)
    state_note = models.CharField("شرح وضعیت", max_length=300, blank=True)
    tested_at = models.DateTimeField("آخرین آزمون اتصال", null=True, blank=True)
    history = HistoricalRecords()

    class Meta:
        verbose_name = "اتصال Active Directory"
        verbose_name_plural = "اتصال Active Directory"

    def __str__(self):
        return self.server


class DirectoryEntry(models.Model):
    """آخرین برداشت حساب‌های AD. هر برداشت تازه همه‌ی ردیف‌ها را جایگزین می‌کند و تا اعمال، روی کاربران اثری ندارد."""

    username = models.CharField("نام کاربری", max_length=150, unique=True)
    first_name = models.CharField("نام", max_length=150, blank=True)
    last_name = models.CharField("نام خانوادگی", max_length=150, blank=True)
    email = models.EmailField("ایمیل", blank=True)
    personnel_code = models.CharField("کد پرسنلی", max_length=20, blank=True)
    job_title = models.CharField("عنوان شغلی", max_length=200, blank=True)
    ou = models.CharField("شاخه", max_length=300)
    enabled = models.BooleanField("فعال در AD", default=True)
    fetched_at = models.DateTimeField("زمان برداشت", default=timezone.now)

    class Meta:
        verbose_name = "حساب AD"
        verbose_name_plural = "حساب‌های AD"
        ordering = ["ou", "username"]

    def __str__(self):
        return self.username


class DirectorySync(models.Model):
    """یک اجرای همگام‌سازی: پیش‌نمایش (زمان‌بندی یا دستی)، اعمال تغییرها یا اجرای ناموفق، با خلاصه‌ی تغییرها."""

    class Status(models.TextChoices):
        PREVIEW = "preview", "پیش‌نمایش"
        APPLIED = "applied", "اعمال شد"
        FAILED = "failed", "ناموفق"

    status = models.CharField("وضعیت", max_length=10, choices=Status.choices)
    run_at = models.DateTimeField("زمان اجرا", default=timezone.now)
    run_by = models.ForeignKey(
        User, verbose_name="اجراکننده", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    pending = models.PositiveIntegerField("موارد در انتظار", default=0)
    applied = models.PositiveIntegerField("تغییر اعمال‌شده", default=0)
    note = models.CharField("شرح", max_length=300, blank=True)
    changes = models.JSONField("تغییرها", default=list, blank=True)

    class Meta:
        verbose_name = "اجرای همگام‌سازی AD"
        verbose_name_plural = "اجراهای همگام‌سازی AD"
        ordering = ["-run_at", "-pk"]

    def __str__(self):
        return f"{self.get_status_display()} {self.run_at:%Y-%m-%d %H:%M}"

