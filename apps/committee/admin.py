from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from .models import AgendaItem, AgendaOption, Attendee, Meeting, ResolutionSignature


class AttendeeInline(admin.TabularInline):
    model = Attendee
    extra = 0
    raw_id_fields = ("user",)


class AgendaItemInline(admin.TabularInline):
    model = AgendaItem
    extra = 0
    fields = ("risk", "title", "kind", "detail", "status")
    raw_id_fields = ("risk",)
    show_change_link = True


@admin.register(Meeting)
class MeetingAdmin(SimpleHistoryAdmin):
    list_display = ("code", "title", "date", "kind", "status")
    list_filter = ("status", "kind")
    raw_id_fields = ("secretary", "created_by")
    inlines = [AttendeeInline, AgendaItemInline]

    def has_delete_permission(self, request, obj=None):
        return False  # جلسه و مصوبه سابقه‌اند


class AgendaOptionInline(admin.StackedInline):
    model = AgendaOption
    extra = 0


class ResolutionSignatureInline(admin.TabularInline):
    model = ResolutionSignature
    extra = 0
    readonly_fields = ("user", "role", "signed_at")
    can_delete = False


@admin.register(AgendaItem)
class AgendaItemAdmin(SimpleHistoryAdmin):
    list_display = ("__str__", "meeting", "kind", "status")
    list_filter = ("status", "kind")
    raw_id_fields = ("meeting", "risk", "presenter")
    inlines = [AgendaOptionInline, ResolutionSignatureInline]

    def has_delete_permission(self, request, obj=None):
        return False
