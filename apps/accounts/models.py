from django.contrib.auth.models import AbstractUser
from django.db import models
from django.core.validators import RegexValidator
from simple_history.models import HistoricalRecords

from apps.organization.services import get_subtree_ids
from .roles import Role

class User(AbstractUser):
    personnel_code = models.CharField(
        "کد پرسنلی",
        max_length=20,
        unique=True,
        null=True,
        blank=True,
        validators=[RegexValidator(r"^\d+$", "کد پرسنلی فقط باید رقم باشد.")],
    )
    job_title = models.CharField("عنوان شغلی", max_length=200, blank=True)
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

    # رمز در تاریخچه نمی‌آید. last_login هم نمی‌آید چون ورودها در Audit Log ثبت می‌شوند.
    # تغییر نقش‌ها و واحدهای تحت مدیریت (چندبه‌چند) را apps/audit/signals.py ثبت می‌کند.
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