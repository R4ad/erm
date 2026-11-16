from django.core.exceptions import ValidationError
from django.db import models
from simple_history.models import HistoricalRecords

from apps.core.models import TimeStampedModel


class OrgUnit(TimeStampedModel):
    name = models.CharField("نام", max_length=200)
    code = models.CharField(
        "کد",
        max_length=20,
        unique=True,
        null=True,
        blank=True,
        help_text="کد رسمی واحد، اگر دارد.",
    )
    parent = models.ForeignKey(
        "self",
        verbose_name="واحد بالادست",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="children",
    )
    is_active = models.BooleanField("فعال", default=True)
    # چارت سازمانی (فیگما ۱۸): جانشین مدیر و گروه Active Directory همین واحد
    deputy = models.ForeignKey(
        "accounts.User",
        verbose_name="جانشین مدیر",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deputy_units",
    )
    ad_group = models.CharField(
        "گروه AD", max_length=200, blank=True, help_text="مسیر گروه یا OU در Active Directory، مثل OU=BankOps,DC=datin."
    )

    history = HistoricalRecords()

    class Meta:
        verbose_name = "واحد سازمانی"
        verbose_name_plural = "واحدهای سازمانی"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["parent", "name"],
                nulls_distinct=False,
                name="unique_unit_name_per_parent",
                violation_error_message="زیر این واحد بالادست، واحدی با همین نام هست.",
            ),
        ]

    def __str__(self):
        return self.name

    def clean(self):
        node = self.parent
        while node is not None:
            if node.pk == self.pk:
                raise ValidationError({"parent": "یک واحد نمی‌تواند زیرمجموعه‌ی خودش باشد."})
            node = node.parent

        if self.is_active and self.parent and not self.parent.is_active:
            raise ValidationError({"parent": "واحد بالادست غیرفعال است٫ واحد فعال نمی تواند زیر آن باشد."})

        if self.pk and not self.is_active and self.children.filter(is_active=True).exists():
            raise ValidationError({"is_active": "این واحد زیرمجموعه فعال دارد٫ اول آن ها را غیرفعال کنید."})