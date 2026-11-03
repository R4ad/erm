from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from .models import AcceptanceSignature, ActionUpdate, RiskAcceptance, TreatmentAction, TreatmentPlan


class ActionUpdateInline(admin.TabularInline):
    """گزارش پیشرفت فقط از صفحه‌ی اقدام ثبت می‌شود و این‌جا فقط دیده می‌شود."""

    model = ActionUpdate
    extra = 0
    can_delete = False
    fields = ("from_status", "to_status", "note", "created_by", "created_at")
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(TreatmentPlan)
class TreatmentPlanAdmin(SimpleHistoryAdmin):
    list_display = ("risk", "assessment", "option", "decision_due", "owner_approved_at")
    list_filter = ("option",)
    search_fields = ("risk__code", "risk__title")
    raw_id_fields = ("risk", "target_assessment")

    def has_delete_permission(self, request, obj=None):
        return False  # طرح حذف نمی‌شود


@admin.register(TreatmentAction)
class TreatmentActionAdmin(SimpleHistoryAdmin):
    list_display = ("code", "title", "plan", "owner", "assignee", "due_date", "status")
    list_filter = ("status", "mechanism")
    search_fields = ("code", "title", "plan__risk__code")
    raw_id_fields = ("plan", "owner", "assignee", "verifier")
    filter_horizontal = ("depends_on", "controls", "evidence")
    readonly_fields = ("status",)
    inlines = [ActionUpdateInline]

    def has_delete_permission(self, request, obj=None):
        return False  # اقدام حذف نمی‌شود


class AcceptanceSignatureInline(admin.TabularInline):
    """امضا فقط از صفحه‌ی پذیرش ثبت می‌شود و این‌جا فقط دیده می‌شود."""

    model = AcceptanceSignature
    extra = 0
    can_delete = False
    fields = ("authority", "decision", "note", "reference", "reference_date", "letter", "created_by", "created_at")
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(RiskAcceptance)
class RiskAcceptanceAdmin(SimpleHistoryAdmin):
    """متن و امضای پذیرش از صفحه‌ی خودش ثبت می‌شود؛ این‌جا فقط دیده می‌شود."""

    list_display = ("code", "risk", "assessment", "status", "start_date", "end_date")
    list_filter = ("status",)
    search_fields = ("code", "risk__code")
    inlines = [AcceptanceSignatureInline]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False  # پذیرش حذف نمی‌شود
