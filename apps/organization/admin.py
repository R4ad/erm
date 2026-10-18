from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from .models import OrgUnit


@admin.register(OrgUnit)
class OrgUnitAdmin(SimpleHistoryAdmin):
    list_display = ("code", "name", "parent", "is_active")
    list_filter = ("is_active",)
    search_fields = ("code", "name")