from django import forms
from django.contrib.auth.forms import AuthenticationForm
from django.core.validators import FileExtensionValidator
from django.db.models import Q

from apps.core.forms import BootstrapFormMixin
from apps.organization.forms import UnitChoiceField
from apps.organization.models import OrgUnit
from apps.organization.services import get_subtree_ids

from .roles import Role
from .staff_import import ZWNJ, clean_code


class LoginForm(AuthenticationForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            field.widget.attrs["class"] = "form-control"


class StaffFileForm(BootstrapFormMixin, forms.Form):
    file = forms.FileField(
        label="فایل Excel منابع انسانی",
        validators=[FileExtensionValidator(["xlsx"])],
        widget=forms.FileInput(attrs={"accept": ".xlsx"}),
    )
    deactivate_missing = forms.BooleanField(
        label="کسانی که کد پرسنلی دارند ولی در فایل نیستند غیرفعال شوند",
        required=False,
    )


class StaffImportConfirmForm(forms.Form):
    """فرم پنهان دکمه‌ی تأیید: می‌گوید کدام فایل و با کدام گزینه وارد شود."""

    token = forms.UUIDField(widget=forms.HiddenInput)
    deactivate_missing = forms.BooleanField(required=False, widget=forms.HiddenInput)


class UserFilterForm(BootstrapFormMixin, forms.Form):
    q = forms.CharField(
        label="جست‌وجو",
        required=False,
        widget=forms.TextInput(attrs={"placeholder": "نام، نام کاربری یا کد پرسنلی"}),
    )
    unit = UnitChoiceField(OrgUnit.objects.all(), label="واحد", required=False, empty_label="همه‌ی واحدها")
    role = forms.ChoiceField(
        label="نقش", required=False, choices=[("", "همه‌ی نقش‌ها")] + [(role, role) for role in Role.ALL]
    )
    status = forms.ChoiceField(
        label="وضعیت", required=False, choices=[("", "همه"), ("active", "فعال"), ("inactive", "غیرفعال")]
    )

    def filter(self, users):
        data = self.cleaned_data
        # هر کلمه باید جایی پیدا شود؛ «علی پور» با فاصله، «علی‌پور» با نیم‌فاصله را هم پیدا می‌کند.
        for word in clean_code(data["q"]).replace(ZWNJ, " ").split():
            users = users.filter(
                Q(first_name__icontains=word)
                | Q(last_name__icontains=word)
                | Q(username__icontains=word)
                | Q(personnel_code__icontains=word)
            )
        if data["unit"]:
            users = users.filter(org_unit__in=get_subtree_ids(data["unit"]))
        if data["role"]:
            users = users.filter(groups__name=data["role"])
        if data["status"]:
            users = users.filter(is_active=data["status"] == "active")
        return users