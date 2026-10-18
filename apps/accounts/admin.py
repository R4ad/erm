from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("سازمان", {"fields": ("org_unit",)}),)
    list_display = ("username", "first_name", "last_name", "org_unit", "is_active")
    list_filter = UserAdmin.list_filter + ("org_unit",)