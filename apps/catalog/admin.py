from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from .models import Customer, Service, ServiceCustomer


@admin.register(Customer)
class CustomerAdmin(SimpleHistoryAdmin):
    list_display = ("name", "is_key", "financial_basis", "is_active")
    list_filter = ("is_key", "is_active")
    search_fields = ("name",)


class ServiceCustomerInline(admin.TabularInline):
    model = ServiceCustomer
    extra = 0
    can_delete = False  # رابطه‌ی تمام‌شده با «اعتبار تا» بسته می‌شود، نه با حذف


@admin.register(Service)
class ServiceAdmin(SimpleHistoryAdmin):
    inlines = [ServiceCustomerInline]
    list_display = ("code", "name", "kind", "org_unit", "owner", "is_critical", "is_active")
    list_filter = ("kind", "is_critical", "lifecycle_stage", "environment", "is_active")
    search_fields = ("code", "name")
    raw_id_fields = ("owner",)
