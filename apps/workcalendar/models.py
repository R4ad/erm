from django.db import models
from simple_history.models import HistoricalRecords

from apps.core.jalali import WEEKDAY_NAMES, to_jalali
from apps.core.models import TimeStampedModel


class Holiday(TimeStampedModel):
    """تعطیلی رسمی که مدیر سامانه هر سال وارد می‌کند. پنجشنبه و جمعه همیشه تعطیل‌اند و لازم نیست ثبت شوند."""

    date = models.DateField(
        "تاریخ", unique=True, error_messages={"unique": "برای این تاریخ پیش‌تر تعطیلی ثبت شده است."}
    )
    title = models.CharField("مناسبت", max_length=200)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "تعطیلی"
        verbose_name_plural = "تعطیلات"
        ordering = ["date"]

    def __str__(self):
        return f"{to_jalali(self.date)} {self.title}"

    @property
    def weekday_name(self):
        return WEEKDAY_NAMES[self.date.weekday()]