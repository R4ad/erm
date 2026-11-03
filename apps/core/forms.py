import datetime
import os

from django import forms
from django.conf import settings
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


# امضای چند بایت اول هر نوع فایل، تا فایل اجرایی با پسوند عوض‌شده پذیرفته نشود. متن امضای ثابت ندارد.
OLE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"  # Office قدیمی: doc، xls، ppt
ZIP = b"PK\x03\x04"  # Office تازه: docx، xlsx، pptx
SIGNATURES = {
    "pdf": [b"%PDF"],
    "png": [b"\x89PNG\r\n\x1a\n"],
    "jpg": [b"\xff\xd8\xff"],
    "jpeg": [b"\xff\xd8\xff"],
    "gif": [b"GIF87a", b"GIF89a"],
    "doc": [OLE],
    "xls": [OLE],
    "ppt": [OLE],
    "docx": [ZIP],
    "xlsx": [ZIP],
    "pptx": [ZIP],
}


def check_upload(upload):
    """سقف حجم، پسوند مجاز و هم‌خوانی محتوا با پسوند (س۲۴)."""
    limit = settings.ATTACHMENT_MAX_SIZE
    if upload.size > limit:
        raise ValidationError(f"حجم فایل بیش از {limit // (1024 * 1024)} مگابایت است.")
    extension = os.path.splitext(upload.name)[1].lower().lstrip(".")
    allowed = settings.ATTACHMENT_EXTENSIONS
    if extension not in allowed:
        raise ValidationError(f"این نوع فایل پذیرفته نمی‌شود. نوع‌های مجاز: {'، '.join(allowed)}")
    head = upload.read(16)
    upload.seek(0)
    signatures = SIGNATURES.get(extension)
    if signatures and not any(head.startswith(signature) for signature in signatures):
        raise ValidationError("محتوای فایل با پسوندش نمی‌خواند.")
    if not signatures and b"\x00" in head:
        raise ValidationError("فایل متنی نیست.")


class AttachmentForm(BootstrapFormMixin, forms.Form):
    file = forms.FileField(label="فایل")
    description = forms.CharField(label="شرح", max_length=300, required=False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        size = settings.ATTACHMENT_MAX_SIZE // (1024 * 1024)
        types = "، ".join(settings.ATTACHMENT_EXTENSIONS)
        self.fields["file"].help_text = f"حداکثر {size} مگابایت؛ {types}"
        self.fields["file"].widget.attrs["accept"] = ",".join(f".{ext}" for ext in settings.ATTACHMENT_EXTENSIONS)

    def clean_file(self):
        upload = self.cleaned_data["file"]
        check_upload(upload)
        return upload


class CommentForm(BootstrapFormMixin, forms.Form):
    text = forms.CharField(label="نظر", widget=forms.Textarea(attrs={"rows": 3}))
