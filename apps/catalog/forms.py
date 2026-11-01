from django import forms
from django.db.models import Q

from apps.accounts.models import User
from apps.core.forms import BootstrapFormMixin, JalaliDateField
from apps.organization.forms import UnitChoiceField
from apps.organization.models import OrgUnit
from apps.organization.services import get_subtree_ids

from .models import Customer, Service, ServiceCustomer

STATUS_CHOICES = [("", "همه"), ("active", "فعال"), ("inactive", "غیرفعال")]


class CustomerForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = Customer
        fields = ["name", "is_key", "financial_basis", "is_active"]


class CustomerFilterForm(BootstrapFormMixin, forms.Form):
    q = forms.CharField(label="نام", required=False)
    is_key = forms.ChoiceField(
        label="مشتری کلیدی", required=False, choices=[("", "همه"), ("yes", "کلیدی"), ("no", "غیرکلیدی")]
    )
    status = forms.ChoiceField(label="وضعیت", required=False, choices=STATUS_CHOICES)

    def filter(self, customers):
        data = self.cleaned_data
        for word in data["q"].split():
            customers = customers.filter(name__icontains=word)
        if data["is_key"]:
            customers = customers.filter(is_key=data["is_key"] == "yes")
        if data["status"]:
            customers = customers.filter(is_active=data["status"] == "active")
        return customers


class OwnerChoiceField(forms.ModelChoiceField):
    def label_from_instance(self, user):
        label = user.get_full_name() or user.username
        if user.org_unit_id:
            label += f" ({user.org_unit})"
        return label


class ServiceForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = Service
        fields = [
            "code",
            "name",
            "kind",
            "description",
            "org_unit",
            "owner",
            "is_critical",
            "lifecycle_stage",
            "environment",
            "is_active",
        ]
        field_classes = {"org_unit": UnitChoiceField, "owner": OwnerChoiceField}
        widgets = {"description": forms.Textarea(attrs={"rows": 3})}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # فقط واحدها و کاربرهای فعال، به‌اضافه‌ی مقدار فعلی همین خدمت (حتی اگر بعداً غیرفعال شده باشد)
        # تا فرم ویرایش خدمت قدیمی بدون انتخاب دوباره باز شود.
        unit, owner = self.fields["org_unit"], self.fields["owner"]
        unit.queryset = OrgUnit.objects.filter(Q(is_active=True) | Q(pk=self.instance.org_unit_id))
        owner.queryset = (
            User.objects.filter(Q(is_active=True) | Q(pk=self.instance.owner_id))
            .select_related("org_unit")
            .order_by("last_name", "first_name", "username")
        )


class ServiceFilterForm(BootstrapFormMixin, forms.Form):
    q = forms.CharField(
        label="جست‌وجو", required=False, widget=forms.TextInput(attrs={"placeholder": "کد یا نام خدمت"})
    )
    unit = UnitChoiceField(OrgUnit.objects.all(), label="واحد مالک", required=False, empty_label="همه‌ی واحدها")
    kind = forms.ChoiceField(label="نوع", required=False, choices=[("", "همه")] + Service.Kind.choices)
    is_critical = forms.ChoiceField(
        label="حیاتی", required=False, choices=[("", "همه"), ("yes", "حیاتی"), ("no", "غیرحیاتی")]
    )
    status = forms.ChoiceField(label="وضعیت", required=False, choices=STATUS_CHOICES)

    def filter(self, services):
        data = self.cleaned_data
        for word in data["q"].split():
            services = services.filter(Q(code__icontains=word) | Q(name__icontains=word))
        if data["unit"]:
            services = services.filter(org_unit__in=get_subtree_ids(data["unit"]))
        if data["kind"]:
            services = services.filter(kind=data["kind"])
        if data["is_critical"]:
            services = services.filter(is_critical=data["is_critical"] == "yes")
        if data["status"]:
            services = services.filter(is_active=data["status"] == "active")
        return services


class ServiceCustomerForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = ServiceCustomer
        fields = [
            "customer",
            "rto_minutes",
            "mtpd_minutes",
            "rpo_minutes",
            "bia_reference",
            "tolerance_notes",
            "valid_from",
            "valid_until",
        ]
        field_classes = {"valid_from": JalaliDateField, "valid_until": JalaliDateField}
        widgets = {"tolerance_notes": forms.Textarea(attrs={"rows": 2})}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # فقط بانک‌های فعالی که هنوز برای این خدمت ثبت نشده‌اند، به‌اضافه‌ی بانک فعلی همین ردیف.
        # چون «خدمت» در فرم نیست، Django قاعده‌ی یکتایی (خدمت، بانک) را در فرم چک نمی‌کند؛
        # این فهرست جلوی انتخاب بانک تکراری را می‌گیرد.
        taken = ServiceCustomer.objects.filter(service=self.instance.service).exclude(pk=self.instance.pk)
        self.fields["customer"].queryset = Customer.objects.filter(
            Q(is_active=True) | Q(pk=self.instance.customer_id)
        ).exclude(pk__in=taken.values("customer"))
