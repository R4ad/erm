import copy

from django import forms
from django.db.models import Q
from django.utils import timezone

from apps.accounts.roles import Role
from apps.catalog.forms import (
    OwnerChoiceField,
    ServiceForm,
    active_or_current,
    user_choices,
)
from apps.catalog.models import Customer, Service
from apps.catalog.permissions import visible_services
from apps.controls.forms import ControlChoiceField
from apps.controls.models import Control
from apps.core.forms import BootstrapFormMixin, JalaliDateField
from apps.organization.forms import UnitChoiceField
from apps.organization.models import OrgUnit
from apps.organization.services import get_subtree_ids

from .models import (
    Coverage,
    Evidence,
    ExternalLink,
    Risk,
    RiskCategory,
    RiskScenario,
    Tag,
)
from .permissions import can_edit_register
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
    q = forms.CharField(label="جست‌وجو", required=False, widget=forms.TextInput(attrs={"placeholder": "کد یا نام خدمت"}))
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
        if self.instance.narrative:
            self.instance.narrative = self.instance.build_narrative()
        return super().save(commit)


class ScenarioServiceChoiceField(forms.ModelChoiceField):
    def label_from_instance(self, service):
        return f"{service.name} ({service.code})"


class ScenarioCreateForm(BootstrapFormMixin, forms.ModelForm):
    service = ScenarioServiceChoiceField(Service.objects.filter(is_active=True), label="خدمت یا فرآیند", required=False)
    new_service = forms.BooleanField(label="ثبت خدمت جدید", required=False)
    objective = forms.CharField(label="هدف یا تعهد", widget=forms.Textarea(attrs={"rows": 2}))
    customer_text = forms.CharField(label="داتین یا مشتری", widget=forms.Textarea(attrs={"rows": 2}))

    class Meta:
        model = RiskScenario
        fields = ["service", "new_service", "conditions", "event", "objective", "customer_text", "consequence", "category"]
        labels = {"conditions": "عامل و وضعیت", "event": "رویداد مشخص", "consequence": "نوع و دامنه پیامد"}
        widgets = {name: forms.Textarea(attrs={"rows": 2}) for name in ["conditions", "event", "consequence"]}

    NEW_SERVICE_FIELDS = ["code", "name", "kind", "org_unit", "owner", "lifecycle_stage", "environment"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["category"].queryset = RiskCategory.objects.filter(is_active=True)
        service_form = ServiceForm()
        for name in self.NEW_SERVICE_FIELDS:
            field = copy.deepcopy(service_form.fields[name])
            field.required = False
            field.label = f"خدمت جدید: {field.label}"
            self.fields[f"new_service_{name}"] = field

    def clean(self):
        data = super().clean()
        if data.get("new_service"):
            values = {name: self.data.get(f"new_service_{name}", "") for name in self.NEW_SERVICE_FIELDS}
            values["is_active"] = "on"
            self.service_form = ServiceForm(values)
            if not self.service_form.is_valid():
                for name, errors in self.service_form.errors.items():
                    target = f"new_service_{name}" if name != "__all__" else None
                    for error in errors:
                        self.add_error(target, error)
        elif not data.get("service"):
            self.add_error("service", "خدمت را انتخاب کنید یا خدمت جدید ثبت کنید.")
        return data

    def save(self, commit=True):
        scenario = super().save(commit=False)
        scenario.service = self.service_form.save() if self.cleaned_data.get("new_service") else self.cleaned_data["service"]
        scenario.service_name_snapshot = scenario.service.name
        scenario.title = scenario.event[:300]
        scenario.is_active = True
        scenario.narrative = scenario.build_narrative()
        if commit:
            scenario.save()
        return scenario


class ScenarioFilterForm(BootstrapFormMixin, forms.Form):
    q = forms.CharField(
        label="جست‌وجو", required=False, widget=forms.TextInput(attrs={"placeholder": "کد، عنوان یا رویداد"})
    )
    category = forms.ModelChoiceField(RiskCategory.objects.all(), label="دسته", required=False, empty_label="همه")
    status = forms.ChoiceField(label="وضعیت", required=False, choices=STATUS_CHOICES)

    def filter(self, scenarios):
        data = self.cleaned_data
        for word in data["q"].split():
            scenarios = scenarios.filter(Q(code__icontains=word) | Q(title__icontains=word) | Q(event__icontains=word))
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
            "controls",
        ]
        field_classes = {
            "service": ServiceChoiceField,
            "org_unit": UnitChoiceField,
            "owner": OwnerChoiceField,
            "controls": ControlChoiceField,
        }
        widgets = {
            "description": forms.Textarea(attrs={"rows": 3}),
            "scope": forms.Textarea(attrs={"rows": 2}),
            "initiator": forms.Textarea(attrs={"rows": 2}),
            "count_exclusions": forms.Textarea(attrs={"rows": 2}),
            "customers": forms.SelectMultiple(attrs={"size": 6}),
            "controls": forms.SelectMultiple(attrs={"size": 6}),
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
        current_controls = risk.controls.all() if risk.pk else Control.objects.none()
        self.fields["controls"].queryset = Control.objects.filter(
            Q(is_active=True) | Q(pk__in=current_controls)
        ).order_by("code")
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


class ScenarioRiskCreateForm(RiskForm):
    class Meta(RiskForm.Meta):
        fields = [
            "scenario", "service", "initiator", "realization_path", "channel", "org_unit", "customers",
            "owner", "category", "tag_names", "controls", "additional_notes",
        ]
        widgets = {
            **RiskForm.Meta.widgets,
            "realization_path": forms.Textarea(attrs={"rows": 3}),
            "additional_notes": forms.Textarea(attrs={"rows": 3}),
        }

    def __init__(self, *args, scenario, **kwargs):
        super().__init__(*args, **kwargs)
        self.scenario = scenario
        self.fields["scenario"].disabled = True
        self.fields["service"].disabled = True
        self.fields["scenario"].initial = scenario.pk
        self.fields["service"].initial = self.instance.service_id if self.instance.pk else scenario.service_id
        self.fields["initiator"].required = True
        self.fields["realization_path"].required = True
        self.fields["initiator"].help_text = ""

    def save(self, commit=True):
        risk = super().save(commit=False)
        if risk.pk:
            if commit:
                risk.save()
                self.save_m2m()
            return risk
        scenario = self.scenario
        risk.scenario = scenario
        risk.service = scenario.service
        risk.title = scenario.title
        risk.description = scenario.narrative or f"{scenario.conditions}\n{scenario.event}\n{scenario.consequence}"
        risk.status = Risk.Status.SUBMITTED
        risk.scenario_snapshot = {
            "code": scenario.code, "version": scenario.version, "title": scenario.title,
            "service": scenario.service_name_snapshot or scenario.service.name, "service_code": scenario.service.code,
            "conditions": scenario.conditions, "event": scenario.event, "objective": scenario.objective,
            "customer": scenario.customer_text, "consequence": scenario.consequence,
            "narrative": scenario.narrative, "category": str(scenario.category), "status": "active",
        }
        if commit:
            risk.save()
            self.save_m2m()
        return risk


class RiskFilterForm(BootstrapFormMixin, forms.Form):
    q = forms.CharField(label="جست‌وجو", required=False, widget=forms.TextInput(attrs={"placeholder": "کد یا عنوان"}))
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
        duplicate = ExternalLink.objects.filter(risk=self.instance.risk, kind=kind, ref=ref).exclude(
            pk=self.instance.pk
        )
        if kind and ref and duplicate.exists():
            self.add_error("ref", "این شناسه با همین نوع پیش‌تر برای این ریسک ثبت شده است.")
        return data


class RiskMultipleChoiceField(forms.ModelMultipleChoiceField):
    def label_from_instance(self, risk):
        return f"{risk.code} {risk.title}"


class EvidenceForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = Evidence
        fields = [
            "kind",
            "title",
            "summary",
            "source",
            "observed_on",
            "scope",
            "reliability",
            "valid_until",
            "access_class",
            "url",
            "customer",
            "owner",
            "risks",
        ]
        field_classes = {
            "observed_on": JalaliDateField,
            "valid_until": JalaliDateField,
            "owner": OwnerChoiceField,
            "risks": RiskMultipleChoiceField,
        }
        widgets = {
            "summary": forms.Textarea(attrs={"rows": 3}),
            "scope": forms.Textarea(attrs={"rows": 2}),
            "risks": forms.SelectMultiple(attrs={"size": 6}),
        }
        help_texts = {
            "access_class": "شاهد عادی را هر کس که ریسک مرتبط را می‌بیند می‌بیند؛ محرمانه را فقط مالک ریسک، اعضای GRC و ممیز.",
            "risks": "برای انتخاب چند ریسک، Ctrl (در مک Cmd) را نگه دارید و کلیک کنید.",
        }

    def __init__(self, *args, user, **kwargs):
        super().__init__(*args, **kwargs)
        self.user = user
        evidence = self.instance
        self.fields["customer"].queryset = active_or_current(Customer.objects.all(), evidence.customer_id)
        # ریسک‌هایی که کاربر می‌تواند به آن‌ها شاهد وصل کند: عضو GRC همه‌ی ریسک‌های فعال، مالک ریسک‌های خودش.
        choosable = active_risks(Risk.objects.all())
        if not can_edit_register(user):
            condition = Q(owner=user)
            if user.has_role(Role.SECURITY_WORKGROUP):
                condition |= Q(status=Risk.Status.ASSESSMENT)
            choosable = choosable.filter(condition)
        self.choosable = choosable
        self.fields["risks"].queryset = choosable.order_by("code")
        if can_edit_register(user):
            self.fields["owner"].queryset = user_choices(evidence.owner_id)
            if not evidence.pk:
                self.fields["owner"].initial = user.pk
        else:
            del self.fields["owner"]  # مالک ریسک شاهدی را که می‌سازد به نام خودش ثبت می‌کند
            if not evidence.pk:
                evidence.owner = user

    def clean(self):
        data = super().clean()
        observed, valid_until = data.get("observed_on"), data.get("valid_until")
        if observed and valid_until and valid_until < observed:
            self.add_error("valid_until", "«معتبر تا» نباید پیش از تاریخ خود شاهد باشد.")
        if not can_edit_register(self.user) and not data.get("risks") and not self.hidden_risks():
            text = "دست‌کم یکی از ریسک‌های مجاز را انتخاب کنید." if self.user.has_role(Role.SECURITY_WORKGROUP) else "دست‌کم یکی از ریسک‌های خودتان را انتخاب کنید."
            self.add_error("risks", text)
        return data

    def hidden_risks(self):
        """ریسک‌هایی که شاهد به آن‌ها وصل است ولی در فهرست این کاربر نیستند؛ با ذخیره‌ی فرم برداشته نمی‌شوند."""
        if not self.instance.pk:
            return Risk.objects.none()
        return self.instance.risks.exclude(pk__in=self.choosable.values("pk"))

    def _save_m2m(self):
        hidden = list(self.hidden_risks())
        super()._save_m2m()
        if hidden:
            self.instance.risks.add(*hidden)


class EvidenceFilterForm(BootstrapFormMixin, forms.Form):
    q = forms.CharField(
        label="جست‌وجو", required=False, widget=forms.TextInput(attrs={"placeholder": "کد، عنوان یا منبع"})
    )
    kind = forms.ChoiceField(label="نوع", required=False, choices=[("", "همه")] + Evidence.Kind.choices)
    reliability = forms.ChoiceField(
        label="اعتبار", required=False, choices=[("", "همه")] + Evidence.Reliability.choices
    )
    access_class = forms.ChoiceField(
        label="طبقه‌ی دسترسی", required=False, choices=[("", "همه")] + Evidence.AccessClass.choices
    )
    validity = forms.ChoiceField(
        label="اعتبار زمانی", required=False, choices=[("", "همه"), ("valid", "معتبر"), ("expired", "منقضی")]
    )

    def filter(self, evidence):
        data = self.cleaned_data
        for word in data["q"].split():
            evidence = evidence.filter(Q(code__icontains=word) | Q(title__icontains=word) | Q(source__icontains=word))
        if data["kind"]:
            evidence = evidence.filter(kind=data["kind"])
        if data["reliability"]:
            evidence = evidence.filter(reliability=data["reliability"])
        if data["access_class"]:
            evidence = evidence.filter(access_class=data["access_class"])
        today = timezone.localdate()
        if data["validity"] == "expired":
            evidence = evidence.filter(valid_until__lt=today)
        elif data["validity"] == "valid":
            evidence = evidence.filter(Q(valid_until__isnull=True) | Q(valid_until__gte=today))
        return evidence
