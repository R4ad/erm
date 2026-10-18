from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    org_unit = models.ForeignKey(
        "organization.OrgUnit",
        verbose_name="واحد سازمانی",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="members",
    )