from django import forms
from django.db.models import Count, Q

from apps.catalog.forms import STATUS_CHOICES, OwnerChoiceField, user_choices
from apps.catalog.models import Responsibility
from apps.core.forms import BootstrapFormMixin

from .models import Applicability, Control, IsoControl

YES_NO_CHOICES = [("", "همه"), ("yes", "بله"), ("no", "خیر")]


class IsoControlMultipleChoiceField(forms.ModelMultipleChoiceField):
    def label_from_instance(self, iso_control):
        return f"{iso_control.code} {iso_control.title}"


class ControlChoiceField(forms.ModelMultipleChoiceField):
    def label_from_instance(self, control):
        label = f"{control.code} {control.title}"
        return label if control.is_active else f"{label} - غیرفعال"


class ControlForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = Control
        fields = ["title", "objective", "kind", "owner", "operated_by", "is_key", "iso_controls", "is_active"]
        field_classes = {"owner": OwnerChoiceField, "iso_controls": IsoControlMultipleChoiceField}
        widgets = {
            "objective": forms.Textarea(attrs={"rows": 3}),
            "iso_controls": forms.SelectMultiple(attrs={"size": 8}),
        }
        help_texts = {
            "iso_controls": "کنترل‌هایی از پیوست A که این کنترل بخشی از اجرای آن‌هاست. برای انتخاب چند کنترل، Ctrl "
            "(در مک Cmd) را نگه دارید و کلیک کنید.",
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["owner"].queryset = user_choices(self.instance.owner_id)


class ControlFilterForm(BootstrapFormMixin, forms.Form):
    q = forms.CharField(
        label="جست‌وجو", required=False, widget=forms.TextInput(attrs={"placeholder": "کد، عنوان یا هدف"})
    )
    kind = forms.ChoiceField(label="نوع", required=False, choices=[("", "همه")] + Control.Kind.choices)
    is_key = forms.ChoiceField(label="کنترل کلیدی", required=False, choices=YES_NO_CHOICES)
    operated_by = forms.ChoiceField(label="اجراکننده", required=False, choices=[("", "همه")] + Responsibility.choices)
    theme = forms.TypedChoiceField(
        label="موضوع پیوست A",
        required=False,
        coerce=int,
        empty_value=None,
        choices=[("", "همه")] + IsoControl.Theme.choices,
    )
    status = forms.ChoiceField(label="وضعیت", required=False, choices=STATUS_CHOICES)

    def filter(self, controls):
        data = self.cleaned_data
        for word in data["q"].split():
            controls = controls.filter(
                Q(code__icontains=word) | Q(title__icontains=word) | Q(objective__icontains=word)
            )
        if data["kind"]:
            controls = controls.filter(kind=data["kind"])
        if data["is_key"]:
            controls = controls.filter(is_key=data["is_key"] == "yes")
        if data["operated_by"]:
            controls = controls.filter(operated_by=data["operated_by"])
        if data["theme"]:
            controls = controls.filter(pk__in=Control.objects.filter(iso_controls__theme=data["theme"]).values("pk"))
        if data["status"]:
            controls = controls.filter(is_active=data["status"] == "active")
        return controls


class ApplicabilityForm(BootstrapFormMixin, forms.ModelForm):
    """یک ردیف بیانیه‌ی کاربردپذیری، با عنوان فارسی همان کنترل پیوست A که عضو GRC با نسخه‌ی رسمی تطبیق می‌دهد."""

    iso_title = forms.CharField(label="عنوان فارسی کنترل پیوست A", max_length=300)

    class Meta:
        model = Applicability
        fields = ["applicable", "justification", "implementation"]
        widgets = {"justification": forms.Textarea(attrs={"rows": 3})}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["iso_title"].initial = self.instance.iso_control.title
        self.fields["iso_title"].help_text = IsoControl._meta.get_field("title").help_text
        self.order_fields(["iso_title", "applicable", "justification", "implementation"])

    def clean(self):
        data = super().clean()
        if data.get("applicable") and not data.get("implementation"):
            self.add_error("implementation", "برای کنترلی که کاربرد دارد وضعیت اجرا را انتخاب کنید.")
        if not data.get("applicable"):
            data["implementation"] = ""  # کنترلی که کاربرد ندارد وضعیت اجرا ندارد
        return data

    def save(self, commit=True):
        iso_control = self.instance.iso_control
        if iso_control.title != self.cleaned_data["iso_title"]:
            iso_control.title = self.cleaned_data["iso_title"]
            iso_control.save()
        return super().save(commit)


SOA_STATE_CHOICES = [
    ("", "همه"),
    ("undetermined", "تعیین‌نشده"),
    ("applicable", "کاربرد دارد"),
    ("not_applicable", "کاربرد ندارد"),
    ("gap", "کاربرد دارد ولی کنترل سازمانی ندارد"),
]


class SoaFilterForm(BootstrapFormMixin, forms.Form):
    q = forms.CharField(label="جست‌وجو", required=False, widget=forms.TextInput(attrs={"placeholder": "شماره یا عنوان"}))
    theme = forms.TypedChoiceField(
        label="موضوع", required=False, coerce=int, empty_value=None, choices=[("", "همه")] + IsoControl.Theme.choices
    )
    state = forms.ChoiceField(label="کاربرد", required=False, choices=SOA_STATE_CHOICES)
    implementation = forms.ChoiceField(
        label="وضعیت اجرا", required=False, choices=[("", "همه")] + Applicability.Implementation.choices
    )

    def filter(self, iso_controls):
        data = self.cleaned_data
        for word in data["q"].split():
            iso_controls = iso_controls.filter(
                Q(code__startswith=word) | Q(title__icontains=word) | Q(title_en__icontains=word)
            )
        if data["theme"]:
            iso_controls = iso_controls.filter(theme=data["theme"])
        state = data["state"]
        if state == "undetermined":
            iso_controls = iso_controls.filter(applicability__isnull=True)
        elif state == "applicable":
            iso_controls = iso_controls.filter(applicability__applicable=True)
        elif state == "not_applicable":
            iso_controls = iso_controls.filter(applicability__applicable=False)
        elif state == "gap":
            active = Count("controls", filter=Q(controls__is_active=True))
            iso_controls = iso_controls.filter(applicability__applicable=True).alias(active=active).filter(active=0)
        if data["implementation"]:
            iso_controls = iso_controls.filter(applicability__implementation=data["implementation"])
        return iso_controls
