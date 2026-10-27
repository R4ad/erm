from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("سازمان", {"fields": ("personnel_code", "job_title", "org_unit", "managed_units")}),)
    list_display = ("username", "personnel_code", "first_name", "last_name", "org_unit", "is_active")
    list_filter = UserAdmin.list_filter + ("org_unit",)
    search_fields = UserAdmin.search_fields + ("personnel_code",)
    filter_horizontal = UserAdmin.filter_horizontal + ("managed_units",)