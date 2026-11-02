"""نسخه‌ی روش در پنل مدیریت. تا ویرایشگر قدم ۲۷، مدیر سامانه به درخواست GRC همین‌جا نسخه‌ی فعال را به پیش‌نویس
کپی، ویرایش، تصویبش را ثبت و فعالش می‌کند (س۱۲ قدم ۸). فقط پیش‌نویس ویرایش می‌شود و هیچ نسخه‌ای حذف نمی‌شود."""

from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied, ValidationError
from django.shortcuts import get_object_or_404, redirect
from django.template.response import TemplateResponse
from django.urls import path
from simple_history.admin import SimpleHistoryAdmin

from .forms import ApprovalForm
from .models import (
    BcRule,
    ImpactFloor,
    LikelihoodCell,
    MethodParameter,
    MethodVersion,
    RiskLevel,
    Scale,
    ScaleLevel,
)
from .services import activate_version, check_version, copy_version, record_approval


class LockedHistoryAdmin(SimpleHistoryAdmin):
    """تاریخچه دیده می‌شود ولی دکمه‌ی «برگرداندن» ندارد، چون برگرداندن نسخه وضعیت و تصویبش را هم برمی‌گرداند.
    وقتی صفحه‌ی اصلی فقط خواندنی است، جدول‌های داخلش (inline) هم خودبه‌خود فقط خواندنی‌اند."""

    def revert_disabled(self, request, obj=None):
        return True

    def history_form_view(self, request, object_id, version_id, extra_context=None):
        if request.method == "POST":
            raise PermissionDenied
        return super().history_form_view(request, object_id, version_id, extra_context)

    def has_add_permission(self, request):
        return False  # نسخه‌ی تازه فقط با «کپی به پیش‌نویس تازه» ساخته می‌شود و مقیاس از صفحه‌ی نسخه

    def has_delete_permission(self, request, obj=None):
        return False


class ScaleInline(admin.TabularInline):
    model = Scale
    fields = ("order", "code", "name", "kind")
    extra = 0
    show_change_link = True  # متن‌ها و سطح‌های هر مقیاس در صفحه‌ی خود مقیاس ویرایش می‌شوند


class LikelihoodCellInline(admin.TabularInline):
    model = LikelihoodCell
    extra = 0


class RiskLevelInline(admin.StackedInline):
    model = RiskLevel
    extra = 0


class ImpactFloorInline(admin.TabularInline):
    model = ImpactFloor
    extra = 0

    def get_formset(self, request, obj=None, **kwargs):
        formset = super().get_formset(request, obj, **kwargs)
        # فقط سطح‌های همین نسخه؛ نام سطح‌ها در همه‌ی نسخه‌ها یکی است و در فهرست قاطی می‌شدند.
        if "min_level" in formset.form.base_fields:
            formset.form.base_fields["min_level"].queryset = RiskLevel.objects.filter(version=obj)
        return formset


class BcRuleInline(admin.TabularInline):
    model = BcRule
    extra = 0


class MethodParameterInline(admin.TabularInline):
    model = MethodParameter
    extra = 0


@admin.register(MethodVersion)
class MethodVersionAdmin(LockedHistoryAdmin):
    change_form_template = "admin/methodology/methodversion/change_form.html"
    list_display = ("number", "title", "status", "approval_ref", "activated_at")
    list_filter = ("status",)
    readonly_fields = ("number", "based_on", *MethodVersion.LIFECYCLE_FIELDS)
    fieldsets = (
        (None, {"fields": ("number", "title", "status", "based_on", "source", "change_notes")}),
        (
            "راهبرد و متن‌ها",
            {"fields": ("likelihood_strategy", "impact_strategy", "impact_guidance", "decision_guidance", "acceptance_guidance")},
        ),
        (
            "تصویب و فعال شدن",
            {"fields": ("approval_ref", "approved_on", "approval_recorded_by", "activated_at", "activated_by")},
        ),
    )
    inlines = [ScaleInline, LikelihoodCellInline, RiskLevelInline, ImpactFloorInline, BcRuleInline, MethodParameterInline]

    def has_change_permission(self, request, obj=None):
        # بدون شیء (فهرست نسخه‌ها) اجازه‌ی کلی را می‌پرسد؛ با شیء، فقط پیش‌نویس ویرایش می‌شود.
        return (obj is None or obj.is_draft) and super().has_change_permission(request, obj)

    def get_urls(self):
        view = self.admin_site.admin_view  # ورود و دسترسی پنل را چک می‌کند
        return [
            path("<int:pk>/copy/", view(self.copy_view), name="methodology_methodversion_copy"),
            path("<int:pk>/approve/", view(self.approve_view), name="methodology_methodversion_approve"),
            path("<int:pk>/activate/", view(self.activate_view), name="methodology_methodversion_activate"),
            *super().get_urls(),
        ]

    def action_page(self, request, version, title, text, button, problems=(), form=None):
        """صفحه‌ی تأیید هر سه کار. اگر ایرادی باشد دکمه نشان داده نمی‌شود."""
        context = {
            **self.admin_site.each_context(request),
            "opts": self.opts,
            "original": version,
            "title": title,
            "text": text,
            "button": button,
            "problems": problems,
            "form": form,
        }
        return TemplateResponse(request, "admin/methodology/methodversion/action.html", context)

    def back_to(self, version):
        return redirect("admin:methodology_methodversion_change", version.pk)

    def copy_view(self, request, pk):
        version = get_object_or_404(MethodVersion, pk=pk)
        if not request.user.has_perm("methodology.add_methodversion"):
            raise PermissionDenied
        if request.method == "POST":
            copy = copy_version(version, request.user)
            self.message_user(request, f"{copy} ساخته شد. شرح تغییرات را بنویسید و جدول‌ها را ویرایش کنید.", messages.SUCCESS)
            return self.back_to(copy)
        text = (
            f"«{version}» با همه‌ی مقیاس‌ها، سطح‌ها، جدول‌ها و پارامترهایش در پیش‌نویس تازه‌ای کپی می‌شود. "
            "خود این نسخه دست نمی‌خورد."
        )
        return self.action_page(request, version, "کپی به پیش‌نویس تازه", text, "کپی کن")

    def approve_view(self, request, pk):
        version = get_object_or_404(MethodVersion, pk=pk)
        if not request.user.has_perm("methodology.change_methodversion"):
            raise PermissionDenied
        if not version.can_record_approval:
            self.message_user(request, "تصویب این نسخه ثبت شده است یا دیگر ثبت نمی‌شود.", messages.ERROR)
            return self.back_to(version)
        form = ApprovalForm(request.POST if request.method == "POST" else None)
        if form.is_valid():
            try:
                record_approval(version, form.cleaned_data["approval_ref"], form.cleaned_data["approved_on"], request.user)
            except ValidationError as error:
                form.add_error(None, error)
            else:
                self.message_user(request, f"تصویب «{version}» ثبت شد.", messages.SUCCESS)
                return self.back_to(version)
        if version.is_draft:
            text = (
                "مرجع مجاز روش را بیرون از سامانه تصویب می‌کند؛ این‌جا شماره و تاریخ نامه‌ی تصویب ثبت می‌شود. "
                "بعد از ثبت، محتوای نسخه دیگر عوض نمی‌شود."
            )
        else:
            text = "این نسخه آزمایشی فعال شده بود. اگر بی‌هیچ تغییری تصویب شده است، تصویب روی همین نسخه ثبت می‌شود."
        problems = check_version(version) if version.is_draft else []
        return self.action_page(request, version, "ثبت تصویب", text, "ثبت تصویب", problems, form)

    def activate_view(self, request, pk):
        version = get_object_or_404(MethodVersion, pk=pk)
        if not request.user.has_perm("methodology.change_methodversion"):
            raise PermissionDenied
        if request.method == "POST":
            try:
                activate_version(version, request.user)
            except ValidationError as error:
                for message in error.messages:
                    self.message_user(request, message, messages.ERROR)
            else:
                self.message_user(request, f"«{version}» فعال شد.", messages.SUCCESS)
            return self.back_to(version)
        if version.status == MethodVersion.Status.APPROVED:
            problems = check_version(version)
        else:
            problems = ["فقط نسخه‌ی تصویب‌شده فعال می‌شود."]
        current = MethodVersion.objects.filter(status=MethodVersion.Status.ACTIVE).first()
        text = f"«{version}» فعال می‌شود و ارزیابی‌های تازه از همین لحظه با آن انجام می‌شوند."
        if current:
            text += f" «{current}» بایگانی می‌شود؛ ارزیابی‌هایی که با آن انجام شده‌اند همان نسخه را نگه می‌دارند."
        return self.action_page(request, version, "فعال کردن نسخه", text, "فعال کن", problems)


class ScaleLevelInline(admin.TabularInline):
    model = ScaleLevel
    extra = 0


@admin.register(Scale)
class ScaleAdmin(LockedHistoryAdmin):
    """صفحه‌ی یک مقیاس با سطح‌هایش. از صفحه‌ی نسخه باز می‌شود و در فهرست پنل نمی‌آید."""

    fields = ("version", "code", "kind", "name", "order", "scope", "description", "guidance", "unit", "bound_rule")
    readonly_fields = ("version",)
    inlines = [ScaleLevelInline]

    def has_module_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return (obj is None or obj.version.is_draft) and super().has_change_permission(request, obj)
