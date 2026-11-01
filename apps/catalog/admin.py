from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from .models import Customer, Service


@admin.register(Customer)
class CustomerAdmin(SimpleHistoryAdmin):
    list_display = ("name", "is_key", "financial_basis", "is_active")
    list_filter = ("is_key", "is_active")
    search_fields = ("name",)


@admin.register(Service)
class ServiceAdmin(SimpleHistoryAdmin):
    list_display = ("code", "name", "kind", "org_unit", "owner", "is_critical", "is_active")
    list_filter = ("kind", "is_critical", "lifecycle_stage", "environment", "is_active")
    search_fields = ("code", "name")
    raw_id_fields = ("owner",)
