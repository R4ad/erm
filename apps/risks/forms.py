from django import forms
from django.db.models import Q

from apps.core.forms import BootstrapFormMixin
from apps.organization.forms import UnitChoiceField
from apps.organization.models import OrgUnit
from apps.organization.services import get_subtree_ids

from .models import Coverage, RiskCategory
from .services import active_categories, complete_services, incomplete_services


class RiskCategoryForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = RiskCategory
        fields = ["code", "name", "is_active"]


class CoverageForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = Coverage
        fields = ["status", "reason"]
        widgets = {"status": forms.RadioSelect, "reason": forms.Textarea(attrs={"rows": 3})}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # BootstrapFormMixin به هر ویجت غیرچک‌باکس کلاس form-control می‌دهد؛ دکمه‌های رادیویی آن را نمی‌خواهند.
        self.fields["status"].widget.attrs["class"] = "form-check-input"

    def clean(self):
        data = super().clean()
        # پیام روی خود فیلد دلیل می‌آید؛ قاعده‌ی پایگاه داده هم همین را چک می‌کند.
        if data.get("status") == Coverage.Status.NOT_RELEVANT and not data.get("reason"):
            self.add_error("reason", "برای «نامرتبط» بنویسید چرا این دسته به این خدمت مربوط نیست.")
        return data


class CoverageFilterForm(BootstrapFormMixin, forms.Form):
    q = forms.CharField(
        label="جست‌وجو", required=False, widget=forms.TextInput(attrs={"placeholder": "کد یا نام خدمت"})
    )
    unit = UnitChoiceField(OrgUnit.objects.all(), label="واحد مالک", required=False, empty_label="همه‌ی واحدها")
    is_critical = forms.ChoiceField(
        label="حیاتی", required=False, choices=[("", "همه"), ("yes", "حیاتی"), ("no", "غیرحیاتی")]
    )
    state = forms.ChoiceField(
        label="بررسی",
        required=False,
        choices=[("", "همه"), ("incomplete", "دارای خانه‌ی در انتظار"), ("complete", "کامل")],
    )

    def filter(self, services):
        data = self.cleaned_data
        for word in data["q"].split():
            services = services.filter(Q(code__icontains=word) | Q(name__icontains=word))
        if data["unit"]:
            services = services.filter(org_unit__in=get_subtree_ids(data["unit"]))
        if data["is_critical"]:
            services = services.filter(is_critical=data["is_critical"] == "yes")
        if data["state"] == "complete":
            services = complete_services(services, active_categories())
        elif data["state"] == "incomplete":
            services = incomplete_services(services, active_categories())
        return services
