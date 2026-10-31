from django import forms
from django.contrib.auth.forms import AuthenticationForm
from django.core.validators import FileExtensionValidator

from apps.core.forms import BootstrapFormMixin


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