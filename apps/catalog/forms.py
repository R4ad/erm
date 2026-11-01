from django import forms
from django.db.models import Q

from apps.accounts.models import User
from apps.core.forms import BootstrapFormMixin, JalaliDateField
from apps.organization.forms import UnitChoiceField
from apps.organization.models import OrgUnit
from apps.organization.services import get_subtree_ids

from .models import Asset, Commitment, Customer, DataClass, Service, ServiceCustomer, Supplier

STATUS_CHOICES = [("", "همه"), ("active", "فعال"), ("inactive", "غیرفعال")]
CRITICAL_CHOICES = [("", "همه"), ("yes", "حیاتی"), ("no", "غیرحیاتی")]


def active_or_current(queryset, current_id):
    """فقط رکوردهای فعال، به‌اضافه‌ی مقدار فعلی همین فرم (حتی اگر بعداً غیرفعال شده باشد)
    تا فرم ویرایش رکورد قدیمی بدون انتخاب دوباره باز شود."""
    return queryset.filter(Q(is_active=True) | Q(pk=current_id))


def user_choices(current_id):
    """گزینه‌های فیلد کاربر: کاربرهای فعال و کاربر فعلی، به ترتیب نام، با واحدشان برای برچسب."""
    users = User.objects.select_related("org_unit").order_by("last_name", "first_name", "username")
    return active_or_current(users, current_id)


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
        self.fields["org_unit"].queryset = active_or_current(OrgUnit.objects.all(), self.instance.org_unit_id)
        self.fields["owner"].queryset = user_choices(self.instance.owner_id)


class ServiceFilterForm(BootstrapFormMixin, forms.Form):
    q = forms.CharField(
        label="جست‌وجو", required=False, widget=forms.TextInput(attrs={"placeholder": "کد یا نام خدمت"})
    )
    unit = UnitChoiceField(OrgUnit.objects.all(), label="واحد مالک", required=False, empty_label="همه‌ی واحدها")
    kind = forms.ChoiceField(label="نوع", required=False, choices=[("", "همه")] + Service.Kind.choices)
    is_critical = forms.ChoiceField(label="حیاتی", required=False, choices=CRITICAL_CHOICES)
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
        customers = active_or_current(Customer.objects.all(), self.instance.customer_id)
        self.fields["customer"].queryset = customers.exclude(pk__in=taken.values("customer"))


class SupplierForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = Supplier
        fields = ["name", "description", "is_critical", "contract_owner", "is_active"]
        field_classes = {"contract_owner": OwnerChoiceField}
        widgets = {"description": forms.Textarea(attrs={"rows": 3})}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["contract_owner"].queryset = user_choices(self.instance.contract_owner_id)


class SupplierFilterForm(BootstrapFormMixin, forms.Form):
    q = forms.CharField(
        label="جست‌وجو", required=False, widget=forms.TextInput(attrs={"placeholder": "نام یا خدمت و کالا"})
    )
    is_critical = forms.ChoiceField(label="حیاتی", required=False, choices=CRITICAL_CHOICES)
    status = forms.ChoiceField(label="وضعیت", required=False, choices=STATUS_CHOICES)

    def filter(self, suppliers):
        data = self.cleaned_data
        for word in data["q"].split():
            suppliers = suppliers.filter(Q(name__icontains=word) | Q(description__icontains=word))
        if data["is_critical"]:
            suppliers = suppliers.filter(is_critical=data["is_critical"] == "yes")
        if data["status"]:
            suppliers = suppliers.filter(is_active=data["status"] == "active")
        return suppliers


class AssetForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = Asset
        fields = ["code", "name", "kind", "org_unit", "owner", "data_class", "cia_c", "cia_i", "cia_a", "is_active"]
        field_classes = {"org_unit": UnitChoiceField, "owner": OwnerChoiceField}
        help_texts = {"cia_a": "برچسب‌های CIA نشان می‌دهند کدام ویژگی امنیت اطلاعات برای این دارایی مهم است."}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["org_unit"].queryset = active_or_current(OrgUnit.objects.all(), self.instance.org_unit_id)
        self.fields["owner"].queryset = user_choices(self.instance.owner_id)


class AssetFilterForm(BootstrapFormMixin, forms.Form):
    q = forms.CharField(
        label="جست‌وجو", required=False, widget=forms.TextInput(attrs={"placeholder": "کد یا نام دارایی"})
    )
    unit = UnitChoiceField(OrgUnit.objects.all(), label="واحد مالک", required=False, empty_label="همه‌ی واحدها")
    kind = forms.ChoiceField(label="نوع", required=False, choices=[("", "همه")] + Asset.Kind.choices)
    data_class = forms.ChoiceField(
        label="طبقه‌ی اطلاعات", required=False, choices=[("", "همه")] + DataClass.choices
    )
    status = forms.ChoiceField(label="وضعیت", required=False, choices=STATUS_CHOICES)

    def filter(self, assets):
        data = self.cleaned_data
        for word in data["q"].split():
            assets = assets.filter(Q(code__icontains=word) | Q(name__icontains=word))
        if data["unit"]:
            assets = assets.filter(org_unit__in=get_subtree_ids(data["unit"]))
        if data["kind"]:
            assets = assets.filter(kind=data["kind"])
        if data["data_class"]:
            assets = assets.filter(data_class=data["data_class"])
        if data["status"]:
            assets = assets.filter(is_active=data["status"] == "active")
        return assets


class CommitmentForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = Commitment
        fields = [
            "title",
            "kind",
            "clause_ref",
            "description",
            "services",
            "customer",
            "owner",
            "valid_from",
            "valid_until",
        ]
        field_classes = {"owner": OwnerChoiceField, "valid_from": JalaliDateField, "valid_until": JalaliDateField}
        widgets = {
            "description": forms.Textarea(attrs={"rows": 3}),
            "services": forms.SelectMultiple(attrs={"size": 8}),
        }
        help_texts = {"services": "برای انتخاب چند خدمت، Ctrl (در مک Cmd) را نگه دارید و کلیک کنید."}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # خدمت‌های فعال، به‌اضافه‌ی خدمت‌هایی که همین حالا روی تعهدند، حتی اگر بعداً غیرفعال شده باشند.
        current = self.instance.services.all() if self.instance.pk else Service.objects.none()
        self.fields["services"].queryset = Service.objects.filter(Q(is_active=True) | Q(pk__in=current))
        self.fields["customer"].queryset = active_or_current(Customer.objects.all(), self.instance.customer_id)
        self.fields["owner"].queryset = user_choices(self.instance.owner_id)


class CommitmentFilterForm(BootstrapFormMixin, forms.Form):
    q = forms.CharField(
        label="جست‌وجو", required=False, widget=forms.TextInput(attrs={"placeholder": "عنوان یا مرجع بند"})
    )
    kind = forms.ChoiceField(label="نوع", required=False, choices=[("", "همه")] + Commitment.Kind.choices)

    def filter(self, commitments):
        data = self.cleaned_data
        for word in data["q"].split():
            commitments = commitments.filter(Q(title__icontains=word) | Q(clause_ref__icontains=word))
        if data["kind"]:
            commitments = commitments.filter(kind=data["kind"])
        return commitments
