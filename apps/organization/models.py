from django.core.exceptions import ValidationError
from django.db import models
from simple_history.models import HistoricalRecords

from apps.core.models import TimeStampedModel


class OrgUnit(TimeStampedModel):
    name = models.CharField("نام", max_length=200)
    code = models.CharField("کد", max_length=20, unique=True)
    parent = models.ForeignKey(
        "self",
        verbose_name="واحد بالادست",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="children",
    )
    is_active = models.BooleanField("فعال", default=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "واحد سازمانی"
        verbose_name_plural = "واحدهای سازمانی"
        ordering = ["code"]

    def __str__(self):
        return self.name

    def clean(self):
        node = self.parent
        while node is not None:
            if node.pk == self.pk:
                raise ValidationError({"parent": "یک واحد نمی‌تواند زیرمجموعه‌ی خودش باشد."})
            node = node.parent