from django.db import models


class Confidence(models.TextChoices):
    """اطمینان یک امتیاز (بخش ۷ سند v5). اطمینان کل ارزیابی کمترین اطمینان مؤلفه‌های تعیین‌کننده است."""

    LOW = "low", "کم"
    MEDIUM = "medium", "متوسط"
    HIGH = "high", "زیاد"
