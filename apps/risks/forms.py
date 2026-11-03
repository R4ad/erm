from django import forms
from django.db.models import Q

from apps.catalog.forms import OwnerChoiceField, active_or_current, user_choices
from apps.catalog.models import Customer, Service
from apps.catalog.permissions import visible_services
from apps.core.forms import BootstrapFormMixin
from apps.organization.forms import UnitChoiceField
from apps.organization.models import OrgUnit
from apps.organization.services import get_subtree_ids

from .models import Coverage, ExternalLink, Risk, RiskCategory, RiskScenario, Tag
from .services import (
    active_categories,
    active_risks,
    complete_services,
    incomplete_services,
    parse_tag_names,
    set_tags,
)


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
        if data.get("status") == Coverage.Status.NOT_RELEVANT:
            cell = self.instance
            count = active_risks(Risk.objects.filter(service=cell.service, category=cell.category)).count()
            if count:
                self.add_error(
                    "status",
                    f"{count} ریسک فعال در همین خدمت و دسته ثبت شده است؛ این خانه نمی‌تواند «نامرتبط» باشد.",
                )
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


STATUS_CHOICES = [("", "همه"), ("active", "فعال"), ("inactive", "غیرفعال")]


class RiskScenarioForm(BootstrapFormMixin, forms.ModelForm):
    major_change = forms.BooleanField(
        label="تغییر اساسی",
        required=False,
        help_text="اگر رویداد، شرایط یا پیامد سناریو عوض شده، تیک بزنید تا نسخه یکی بالا برود. ریسک‌هایی که از نسخه‌ی "
        "قبلی ساخته شده‌اند نشان «سناریو تغییر کرده» می‌گیرند. اصلاح نگارشی تغییر اساسی نیست.",
    )

    class Meta:
        model = RiskScenario
        fields = ["title", "event", "conditions", "consequence", "category", "is_active"]
        widgets = {
            "event": forms.Textarea(attrs={"rows": 2}),
            "conditions": forms.Textarea(attrs={"rows": 2}),
            "consequence": forms.Textarea(attrs={"rows": 2}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["category"].queryset = active_or_current(RiskCategory.objects.all(), self.instance.category_id)
        if not self.instance.pk:
            del self.fields["major_change"]  # سناریوی تازه نسخه‌ی ۱ است

    def save(self, commit=True):
        if self.cleaned_data.get("major_change"):
            self.instance.version += 1
        return super().save(commit)


class ScenarioFilterForm(BootstrapFormMixin, forms.Form):
    q = forms.CharField(
        label="جست‌وجو", required=False, widget=forms.TextInput(attrs={"placeholder": "کد، عنوان یا رویداد"})
    )
    category = forms.ModelChoiceField(RiskCategory.objects.all(), label="دسته", required=False, empty_label="همه")
    status = forms.ChoiceField(label="وضعیت", required=False, choices=STATUS_CHOICES)

    def filter(self, scenarios):
        data = self.cleaned_data
        for word in data["q"].split():
            scenarios = scenarios.filter(
                Q(code__icontains=word) | Q(title__icontains=word) | Q(event__icontains=word)
            )
        if data["category"]:
            scenarios = scenarios.filter(category=data["category"])
        if data["status"]:
            scenarios = scenarios.filter(is_active=data["status"] == "active")
        return scenarios


class ServiceChoiceField(forms.ModelChoiceField):
    def label_from_instance(self, service):
        return str(service) if service.is_active else f"{service} - غیرفعال"


class RiskForm(BootstrapFormMixin, forms.ModelForm):
    tag_names = forms.CharField(
        label="برچسب‌ها",
        required=False,
        max_length=500,
        help_text="با ویرگول جدا کنید، مثل «پرداخت، ابری». برچسبی که نیست ساخته می‌شود.",
    )

    class Meta:
        model = Risk
        fields = [
            "scenario",
            "title",
            "description",
            "channel",
            "service",
            "org_unit",
            "customers",
            "owner",
            "category",
            "tag_names",
            "scope",
            "data_class",
            "cia_c",
            "cia_i",
            "cia_a",
            "initiator",
            "count_unit",
            "count_exclusions",
        ]
        field_classes = {"service": ServiceChoiceField, "org_unit": UnitChoiceField, "owner": OwnerChoiceField}
        widgets = {
            "description": forms.Textarea(attrs={"rows": 3}),
            "scope": forms.Textarea(attrs={"rows": 2}),
            "initiator": forms.Textarea(attrs={"rows": 2}),
            "count_exclusions": forms.Textarea(attrs={"rows": 2}),
            "customers": forms.SelectMultiple(attrs={"size": 6}),
        }
        help_texts = {
            "org_unit": "اگر خالی بماند، واحد مالک خدمت گذاشته می‌شود. دسترسی مدیر واحد به ریسک از همین واحد است.",
            "category": "اگر خالی بماند، دسته‌ی سناریوی مرجع گذاشته می‌شود.",
            "customers": "برای انتخاب چند بانک، Ctrl (در مک Cmd) را نگه دارید و کلیک کنید.",
            "cia_a": "برچسب‌های CIA نشان می‌دهند کدام ویژگی امنیت اطلاعات درگیر است؛ امتیاز جدا نمی‌گیرند.",
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        risk = self.instance
        scenarios = active_or_current(RiskScenario.objects.select_related("category"), risk.scenario_id)
        self.fields["scenario"].queryset = scenarios
        self.fields["scenario"].empty_label = "بدون سناریو (مورد جدید)"
        self.fields["service"].queryset = active_or_current(Service.objects.all(), risk.service_id)
        self.fields["org_unit"].queryset = active_or_current(OrgUnit.objects.all(), risk.org_unit_id)
        self.fields["owner"].queryset = user_choices(risk.owner_id)
        self.fields["category"].queryset = active_or_current(RiskCategory.objects.all(), risk.category_id)
        current = risk.customers.all() if risk.pk else Customer.objects.none()
        self.fields["customers"].queryset = Customer.objects.filter(Q(is_active=True) | Q(pk__in=current))
        # واحد و دسته از خدمت و سناریو پر می‌شوند؛ اگر هیچ‌کدام نباشد clean خطا می‌دهد.
        self.fields["org_unit"].required = False
        self.fields["category"].required = False
        if risk.pk:
            self.fields["tag_names"].initial = "، ".join(tag.name for tag in risk.tags.all())

    def clean_tag_names(self):
        names = parse_tag_names(self.cleaned_data["tag_names"])
        max_length = Tag._meta.get_field("name").max_length
        too_long = [name for name in names if len(name) > max_length]
        if too_long:
            raise forms.ValidationError(f"هر برچسب حداکثر {max_length} نویسه است: «{too_long[0]}» بلند است.")
        return names

    def clean(self):
        data = super().clean()
        service, scenario = data.get("service"), data.get("scenario")
        if not data.get("org_unit") and "org_unit" not in self.errors:
            if service:
                data["org_unit"] = service.org_unit
            else:
                self.add_error("org_unit", "واحد را انتخاب کنید، یا خدمت را تا واحد مالک آن گذاشته شود.")
        if not data.get("category") and "category" not in self.errors:
            if scenario:
                data["category"] = scenario.category
            else:
                self.add_error("category", "دسته را انتخاب کنید، یا سناریوی مرجع را تا دسته‌ی آن گذاشته شود.")
        category = data.get("category")
        if service and category:
            # ریسک در خانه‌ای که «نامرتبط» ثبت شده تناقض است؛ تصمیم «نامرتبط» بی‌صدا عوض نمی‌شود.
            cell = Coverage.objects.filter(service=service, category=category).first()
            if cell and cell.status == Coverage.Status.NOT_RELEVANT:
                self.add_error(
                    "category",
                    f"دسته‌ی {category.code} برای خدمت {service.code} در جهان ریسک «نامرتبط» ثبت شده است "
                    f"({cell.reason}). اگر این ریسک درست است، اول وضعیت آن خانه را عوض کنید.",
                )
        return data

    def _save_m2m(self):
        # برچسب‌ها فیلد مدل در فرم نیستند؛ کنار بانک‌ها، بعد از ذخیره‌ی خود ریسک ثبت می‌شوند.
        super()._save_m2m()
        set_tags(self.instance, self.cleaned_data["tag_names"])


class RiskFilterForm(BootstrapFormMixin, forms.Form):
    q = forms.CharField(
        label="جست‌وجو", required=False, widget=forms.TextInput(attrs={"placeholder": "کد یا عنوان"})
    )
    status = forms.ChoiceField(label="وضعیت", required=False, choices=[("", "همه")] + Risk.Status.choices)
    category = forms.ModelChoiceField(RiskCategory.objects.all(), label="دسته", required=False, empty_label="همه")
    service = ServiceChoiceField(Service.objects.none(), label="خدمت", required=False, empty_label="همه")
    unit = UnitChoiceField(OrgUnit.objects.all(), label="واحد", required=False, empty_label="همه‌ی واحدها")
    tag = forms.ModelChoiceField(Tag.objects.all(), label="برچسب", required=False, empty_label="همه")
    channel = forms.ChoiceField(label="کانال ورود", required=False, choices=[("", "همه")] + Risk.Channel.choices)
    needs_completion = forms.ChoiceField(
        label="تکمیل", required=False, choices=[("", "همه"), ("yes", "نیازمند تکمیل"), ("no", "کامل")]
    )

    def __init__(self, *args, user, **kwargs):
        super().__init__(*args, **kwargs)
        # فقط خدمت‌هایی که کاربر می‌بیند در فهرست می‌آیند، تا نام خدمت‌های دیگر لو نرود.
        self.fields["service"].queryset = visible_services(user)

    def filter(self, risks):
        data = self.cleaned_data
        for word in data["q"].split():
            risks = risks.filter(Q(code__icontains=word) | Q(title__icontains=word) | Q(description__icontains=word))
        if data["status"]:
            risks = risks.filter(status=data["status"])
        if data["category"]:
            risks = risks.filter(category=data["category"])
        if data["service"]:
            risks = risks.filter(service=data["service"])
        if data["unit"]:
            risks = risks.filter(org_unit__in=get_subtree_ids(data["unit"]))
        if data["tag"]:
            risks = risks.filter(tags=data["tag"])
        if data["channel"]:
            risks = risks.filter(channel=data["channel"])
        if data["needs_completion"]:
            risks = risks.filter(needs_completion=data["needs_completion"] == "yes")
        return risks


class ExternalLinkForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = ExternalLink
        fields = ["kind", "ref", "url"]

    def clean(self):
        data = super().clean()
        # «ریسک» در فرم نیست، پس Django قاعده‌ی یکتایی (ریسک، نوع، شناسه) را خودش در فرم چک نمی‌کند.
        kind, ref = data.get("kind"), data.get("ref")
        duplicate = ExternalLink.objects.filter(risk=self.instance.risk, kind=kind, ref=ref).exclude(pk=self.instance.pk)
        if kind and ref and duplicate.exists():
            self.add_error("ref", "این شناسه با همین نوع پیش‌تر برای این ریسک ثبت شده است.")
        return data
