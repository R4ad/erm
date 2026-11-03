from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from .models import Coverage, Evidence, ExternalLink, Risk, RiskCategory, RiskScenario, Tag


@admin.register(RiskCategory)
class RiskCategoryAdmin(SimpleHistoryAdmin):
    list_display = ("code", "name", "is_active")
    list_filter = ("is_active",)
    search_fields = ("code", "name")

    def has_delete_permission(self, request, obj=None):
        return False  # دسته حذف نمی‌شود، فقط غیرفعال می‌شود


@admin.register(Coverage)
class CoverageAdmin(SimpleHistoryAdmin):
    list_display = ("service", "category", "status", "reviewed_by", "reviewed_on")
    list_filter = ("status", "category")
    search_fields = ("service__code", "service__name")
    raw_id_fields = ("service", "reviewed_by")

    def has_delete_permission(self, request, obj=None):
        return False  # وضعیت خانه عوض می‌شود و تاریخچه‌اش می‌ماند؛ حذف نمی‌شود


@admin.register(Tag)
class TagAdmin(SimpleHistoryAdmin):
    search_fields = ("name",)

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(RiskScenario)
class RiskScenarioAdmin(SimpleHistoryAdmin):
    list_display = ("code", "title", "version", "category", "is_active")
    list_filter = ("is_active", "category")
    search_fields = ("code", "title")

    def has_delete_permission(self, request, obj=None):
        return False  # سناریو غیرفعال می‌شود، نه حذف


class ExternalLinkInline(admin.TabularInline):
    model = ExternalLink
    extra = 0
    can_delete = False


@admin.register(Risk)
class RiskAdmin(SimpleHistoryAdmin):
    list_display = ("code", "title", "status", "service", "category", "org_unit", "owner")
    list_filter = ("status", "category", "channel", "needs_completion")
    search_fields = ("code", "title")
    raw_id_fields = ("scenario", "service", "owner")
    filter_horizontal = ("customers", "tags")
    inlines = [ExternalLinkInline]

    def has_delete_permission(self, request, obj=None):
        return False  # ریسک بازنشسته یا ادغام می‌شود، نه حذف (قدم ۱۴)


@admin.register(Evidence)
class EvidenceAdmin(SimpleHistoryAdmin):
    list_display = ("code", "title", "kind", "observed_on", "reliability", "access_class", "owner")
    list_filter = ("kind", "reliability", "access_class")
    search_fields = ("code", "title", "source")
    raw_id_fields = ("owner", "customer")
    filter_horizontal = ("risks",)

    def has_delete_permission(self, request, obj=None):
        return False  # شاهد حذف نمی‌شود
