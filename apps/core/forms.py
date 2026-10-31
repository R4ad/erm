import datetime

from django import forms
from django.core.exceptions import ValidationError

from .jalali import parse_jalali, to_jalali


class BootstrapFormMixin:

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            widget = field.widget
            if isinstance(widget, forms.CheckboxInput):
                widget.attrs["class"] = "form-check-input"
            elif isinstance(widget, forms.Select):
                widget.attrs["class"] = "form-select"
            else:
                widget.attrs["class"] = "form-control"


class JalaliDateInput(forms.TextInput):
    """جعبه‌ی تاریخ؛ data-jdp تقویم شمسی را با کلیک روی آن باز می‌کند."""

    def __init__(self, attrs=None):
        super().__init__({"data-jdp": True, "placeholder": "مثلاً 1405/01/15", "autocomplete": "off", **(attrs or {})})


class JalaliDateField(forms.DateField):
    """تاریخ را شمسی می‌گیرد و نشان می‌دهد، ولی مقدارش همان تاریخ میلادی پایتون است."""

    widget = JalaliDateInput
    default_error_messages = {"invalid": "تاریخ شمسی درست نیست؛ مثل 1405/08/09 بنویسید."}

    def to_python(self, value):
        if value in self.empty_values:
            return None
        if isinstance(value, datetime.date):
            return value
        try:
            return parse_jalali(value)
        except ValueError:
            raise ValidationError(self.error_messages["invalid"], code="invalid") from None

    def prepare_value(self, value):
        if isinstance(value, datetime.date):
            return to_jalali(value)
        return value  # متن نادرستی که کاربر نوشته همان‌طور برمی‌گردد تا درستش کند