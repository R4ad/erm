from django import forms
from django.contrib.auth.forms import (
    AuthenticationForm,
    BaseUserCreationForm,
    SetPasswordMixin,
)
from django.contrib.auth.models import Group
from django.core.validators import FileExtensionValidator
from django.db.models import Case, Q, When

from apps.core.forms import BootstrapFormMixin, JalaliDateField
from apps.organization.forms import UnitChoiceField
from apps.organization.models import OrgUnit
from apps.organization.services import get_subtree_ids

from .models import User
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


class UserCreateForm(BootstrapFormMixin, BaseUserCreationForm):
    """تعریف کاربر محلی به دست مدیر سامانه، بی‌نیاز از پنل ادمین جنگو (که فقط کاربر staff را راه می‌دهد).
    کاربرهای AD با همگام‌سازی می‌آیند؛ این‌جا فقط حساب محلی ساخته می‌شود و هیچ‌وقت staff یا superuser نیست."""

    password1, password2 = SetPasswordMixin.create_password_fields(label1="گذرواژه", label2="تکرار گذرواژه")
    roles = forms.ModelMultipleChoiceField(
        Group.objects.none(),
        label="نقش‌های سامانه",
        required=False,
        help_text="بدون نقش، کاربر فقط کارهای خودش را می‌بیند. نقش‌ها بعداً در پروفایل کاربر هم تغییر می‌کنند.",
    )
    field_order = (
        "username",
        "password1",
        "password2",
        "first_name",
        "last_name",
        "personnel_code",
        "job_title",
        "org_unit",
        "email",
        "roles",
        "access_expires",
    )

    class Meta(BaseUserCreationForm.Meta):
        model = User
        fields = (
            "username",
            "first_name",
            "last_name",
            "email",
            "personnel_code",
            "job_title",
            "org_unit",
            "access_expires",
        )
        field_classes = {
            **BaseUserCreationForm.Meta.field_classes,
            "org_unit": UnitChoiceField,
            "access_expires": JalaliDateField,
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["first_name"].required = True
        self.fields["last_name"].required = True
        self.fields["username"].help_text = "حرف لاتین، رقم و نویسه‌های @ . + - _؛ با همین نام وارد سامانه می‌شود."
        self.fields["password1"].help_text = "دست‌کم ۸ نویسه؛ تنها رقم، رایج یا شبیه نام کاربری نباشد."
        self.fields["password2"].help_text = "همان گذرواژه را دوباره بنویسید."
        unit = self.fields["org_unit"]
        unit.queryset = OrgUnit.objects.filter(is_active=True)
        unit.empty_label = "بدون واحد"
        # ترتیب نقش‌ها همان ترتیب Role.ALL است، نه ترتیب الفبایی گروه‌ها.
        order = Case(*[When(name=name, then=index) for index, name in enumerate(Role.ALL)])
        self.fields["roles"].queryset = Group.objects.filter(name__in=Role.ALL).order_by(order)

    def save(self, commit=True):
        user = super().save(commit=False)
        user.source = User.Source.LOCAL
        user.is_staff = user.is_superuser = False
        if commit:
            user.save()
            user.groups.set(self.cleaned_data["roles"])
        return user
