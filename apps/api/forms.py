"""فرم جنگو به شکل JSON برای رابط React، و برعکس: داده‌ی JSON رابط به شکل داده‌ی POST همان فرم.

رابط React فرم را از روی همین توصیف می‌سازد (برچسب، راهنما، اجباری بودن، نوع، گزینه‌ها و مقدار فعلی) و همه‌ی
اعتبارسنجی با خود فرم جنگو است؛ پس فرم React و صفحه‌ی جنگو هیچ‌وقت دو قاعده‌ی متفاوت ندارند.
"""

from django import forms
from django.http import QueryDict

from apps.core.forms import JalaliDateInput


def field_kind(field):
    widget = field.widget
    if isinstance(widget, forms.HiddenInput):
        return "hidden"
    if isinstance(widget, forms.CheckboxInput):
        return "checkbox"
    if isinstance(widget, forms.RadioSelect):
        return "radio"
    if isinstance(widget, forms.CheckboxSelectMultiple | forms.SelectMultiple):
        return "multiselect"
    if isinstance(widget, forms.Select):
        return "select"
    if isinstance(widget, forms.Textarea):
        return "textarea"
    if isinstance(widget, JalaliDateInput):
        return "date"
    if isinstance(widget, forms.ClearableFileInput | forms.FileInput):
        return "file"
    if isinstance(widget, forms.NumberInput):
        return "number"
    if isinstance(widget, forms.URLInput):
        return "url"
    if isinstance(widget, forms.EmailInput):
        return "email"
    if isinstance(widget, forms.PasswordInput):
        return "password"
    return "text"


def _flat_choices(choices):
    """گزینه‌ها؛ گروه‌ها (optgroup) با نام گروه کنار هر گزینه باز می‌شوند."""
    for value, label in choices:
        if isinstance(label, list | tuple):
            for inner_value, inner_label in label:
                yield inner_value, inner_label, str(value)
        else:
            yield value, label, None


def _string(value):
    if value is None:
        return ""
    return str(value)


def field_value(bound):
    field = bound.field
    kind = field_kind(field)
    value = bound.value()
    if kind == "checkbox":
        return bool(value)
    if kind == "file":
        return None
    if kind == "multiselect":
        return [_string(field.prepare_value(item)) for item in (value or [])]
    return _string(field.prepare_value(value))


def describe_field(bound):
    field = bound.field
    kind = field_kind(field)
    attrs = field.widget.attrs
    data = {
        "name": bound.name,
        "label": str(bound.label or ""),
        "help": str(field.help_text or ""),
        "required": field.required,
        "disabled": field.disabled,
        "kind": kind,
        "value": field_value(bound),
        "errors": [str(error) for error in bound.errors],
    }
    if kind in ("select", "multiselect", "radio"):
        choices = []
        for value, label, group in _flat_choices(field.choices):
            value = _string(value)
            if value == "":
                data["empty_label"] = str(label)
                continue
            choices.append({"value": value, "label": str(label), **({"group": group} if group else {})})
        data["choices"] = choices
    if kind == "textarea":
        data["rows"] = int(attrs.get("rows", 4))
    if attrs.get("placeholder"):
        data["placeholder"] = str(attrs["placeholder"])
    if getattr(field, "max_length", None):
        data["max_length"] = field.max_length
    if kind == "file" and attrs.get("accept"):
        data["accept"] = attrs["accept"]
    if kind == "file" and attrs.get("data-max-size"):
        # فقط برای پیام زودتر در رابط؛ اندازه را خود فرم جنگو هم چک می‌کند.
        data["max_size"] = int(attrs["data-max-size"])
    return data


def describe_form(form):
    if form is None:
        return None
    return {
        "fields": [describe_field(form[name]) for name in form.fields],
        "errors": [str(error) for error in form.non_field_errors()],
        "multipart": form.is_multipart(),
    }


def form_data(values):
    """داده‌ی JSON رابط ({نام: مقدار}) به شکل داده‌ی POST فرم جنگو: فهرست برای چندگزینه‌ای، و تیک‌نخورده یعنی نبودن."""
    data = QueryDict(mutable=True)
    for name, value in (values or {}).items():
        if isinstance(value, list):
            data.setlist(name, [_string(item) for item in value])
        elif isinstance(value, bool):
            if value:
                data[name] = "on"
        else:
            data[name] = _string(value)
    return data
