from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from .models import Asset, Commitment, Customer, Service, ServiceCustomer, Supplier


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


@admin.register(Supplier)
class SupplierAdmin(SimpleHistoryAdmin):
    list_display = ("name", "is_critical", "contract_owner", "is_active")
    list_filter = ("is_critical", "is_active")
    search_fields = ("name", "description")
    raw_id_fields = ("contract_owner",)


@admin.register(Asset)
class AssetAdmin(SimpleHistoryAdmin):
    list_display = ("code", "name", "kind", "org_unit", "owner", "data_class", "is_active")
    list_filter = ("kind", "data_class", "is_active")
    search_fields = ("code", "name")
    raw_id_fields = ("owner",)


@admin.register(Commitment)
class CommitmentAdmin(SimpleHistoryAdmin):
    list_display = ("title", "kind", "clause_ref", "customer", "owner", "valid_until")
    list_filter = ("kind",)
    search_fields = ("title", "clause_ref")
    filter_horizontal = ("services",)
    raw_id_fields = ("owner",)
