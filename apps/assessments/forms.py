from django import forms

from apps.core.forms import BootstrapFormMixin, JalaliDateField
from apps.risks.models import Evidence

from .models import Assessment, Confidence, ImpactDetail
from .services import FINANCIAL_SCALE, UNITS, assessable_kinds, suggest

UNKNOWN = "unknown"


class AssessmentForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = Assessment
        fields = ["kind", "horizon_months", "meeting_date", "assumptions"]
        field_classes = {"meeting_date": JalaliDateField}
        widgets = {"assumptions": forms.Textarea(attrs={"rows": 3})}

    def __init__(self, *args, risk, **kwargs):
        super().__init__(*args, **kwargs)
        self.risk = risk
        if self.instance.pk:
            del self.fields["kind"]  # نوع ارزیابی بعد از ثبت عوض نمی‌شود
        else:
            kinds = assessable_kinds(risk)
            self.fields["kind"].choices = [(kind, Assessment.Kind(kind).label) for kind in kinds]

    def clean(self):
        data = super().clean()
        kind = data.get("kind", self.instance.kind)
        if kind in Assessment.KINDS_NEEDING_ASSUMPTIONS and not data.get("assumptions", "").strip():
            label = "کنترل‌های کنارگذاشته" if kind == Assessment.Kind.INHERENT else "اقدام و معیار آزمون آن"
            self.add_error("assumptions", f"برای ارزیابی {Assessment.Kind(kind).label}، {label} را بنویسید.")
        return data


class EvidenceChoiceField(forms.ModelMultipleChoiceField):
    def label_from_instance(self, evidence):
        return f"{evidence.code} {evidence.title}"


def level_choices(scale):
    """گزینه‌های سطح یک بُعد با آغاز معیار هر سطح، تا ارزیاب بی‌رفتن به صفحه‌ی روش انتخاب کند."""
    choices = [("", "ثبت‌نشده"), (UNKNOWN, "نامعلوم")]
    for level in scale.levels.all():
        criteria = level.criteria if len(level.criteria) <= 60 else level.criteria[:60] + "…"
        choices.append((str(level.value), f"{level.value}: {criteria}"))
    return choices


class ImpactDetailForm(BootstrapFormMixin, forms.Form):
    """سطح یک بُعد برای یک ذی‌نفع. «ثبت‌نشده» یعنی این خانه هنوز ارزیابی نشده و ردیفی ذخیره نمی‌شود."""

    level = forms.ChoiceField(label="سطح", required=False)
    level_high = forms.TypedChoiceField(label="تا", required=False, coerce=int, empty_value=None)
    actual_value = forms.DecimalField(label="مقدار واقعی", required=False, min_value=0, max_digits=20, decimal_places=4)
    unit = forms.CharField(
        label="واحد", required=False, max_length=50, widget=forms.TextInput(attrs={"placeholder": "واحد، مثل رکورد"})
    )
    basis = forms.IntegerField(label="مبنای مالی (ریال)", required=False, min_value=1)
    confidence = forms.ChoiceField(label="اطمینان", required=False, choices=[("", "-")] + Confidence.choices)
    rationale = forms.CharField(label="دلیل", required=False, widget=forms.Textarea(attrs={"rows": 2}))
    evidence = EvidenceChoiceField(label="شواهد", required=False, queryset=Evidence.objects.none())

    def __init__(self, *args, scale, customer, facts, fraction, evidence, instance=None, **kwargs):
        self.scale, self.customer, self.facts, self.fraction, self.instance = scale, customer, facts, fraction, instance
        if instance is not None:
            kwargs.setdefault("initial", self.initial_from(instance))
        elif scale.code == FINANCIAL_SCALE and facts.basis:
            kwargs.setdefault("initial", {"basis": facts.basis})
        super().__init__(*args, **kwargs)
        self.fields["level"].choices = level_choices(scale)
        values = [level.value for level in scale.levels.all() if level.value > 0]
        self.fields["level_high"].choices = [("", "-")] + [(value, str(value)) for value in values]
        self.fields["evidence"].queryset = evidence
        self.fields["evidence"].widget.attrs["size"] = 3
        if scale.code in UNITS:
            del self.fields["unit"]  # واحد S و F ثابت است
            self.fields["actual_value"].label = f"مقدار واقعی ({UNITS[scale.code]})"
        if scale.code != FINANCIAL_SCALE:
            del self.fields["basis"]
        self.suggestion = self.compute_suggestion()

    @staticmethod
    def initial_from(instance):
        return {
            "level": UNKNOWN if instance.level is None else str(instance.level),
            "level_high": instance.level_high,
            "actual_value": instance.actual_value,
            "unit": instance.unit,
            "basis": instance.basis,
            "confidence": instance.confidence,
            "rationale": instance.rationale,
            "evidence": list(instance.evidence.all()),
        }

    @property
    def stakeholder_name(self):
        return self.customer.name if self.customer else "داتین"

    def compute_suggestion(self, data=None):
        if data is None:
            data = self.initial if not self.is_bound else {}
        value = data.get("actual_value")
        return suggest(self.scale, value, data.get("basis"), self.facts, self.fraction)

    @property
    def is_empty(self):
        return self.cleaned_data.get("level", "") == ""

    def clean(self):
        data = super().clean()
        level = data.get("level", "")
        self.suggestion = self.compute_suggestion(data)
        others = [data.get("level_high"), data.get("actual_value"), data.get("rationale"), data.get("confidence")]
        if level == "":
            if any(value not in (None, "") for value in others) or data.get("evidence"):
                self.add_error("level", "سطح را انتخاب کنید، یا «نامعلوم» را.")
            return data
        number = None if level == UNKNOWN else int(level)
        high = data.get("level_high")
        rationale = data.get("rationale", "").strip()
        if high is not None and (number is None or high <= number):
            self.add_error("level_high", "کران بالا باید از سطح بیشتر باشد؛ برای سطح قطعی خالی بگذارید.")
        if number is None and not rationale:
            self.add_error("rationale", "برای «نامعلوم» بنویسید چه داده‌ای نیست و کی به دست می‌آید.")
        if number == 0 and not rationale:
            self.add_error("rationale", "صفر یعنی «اثر ندارد» و دلیل می‌خواهد.")
        suggested = self.suggestion.level if self.suggestion else None
        if suggested is not None and number != suggested and not rationale:
            self.add_error("rationale", f"سامانه سطح {suggested} را پیشنهاد می‌دهد؛ دلیل سطح دیگر را بنویسید.")
        if number is not None and not data.get("confidence"):
            self.add_error("confidence", "اطمینان این سطح را انتخاب کنید.")
        data["number"] = number
        return data

    def save(self, assessment):
        """ردیف را می‌سازد یا به‌روز می‌کند؛ خانه‌ای که «ثبت‌نشده» شده باشد پاک می‌شود، چون ارزیابی هنوز پیش‌نویس است."""
        data = self.cleaned_data
        detail = self.instance
        if self.is_empty:
            if detail is not None:
                detail.delete()
            return None
        if detail is None:
            detail = ImpactDetail(assessment=assessment, customer=self.customer, scale=self.scale)
        detail.level = data["number"]
        detail.level_high = data.get("level_high")
        detail.actual_value = data.get("actual_value")
        detail.unit = UNITS.get(self.scale.code, data.get("unit", "")) if data.get("actual_value") is not None else ""
        detail.basis = data.get("basis") if self.scale.code == FINANCIAL_SCALE else None
        detail.confidence = data.get("confidence", "") if data["number"] is not None else ""
        detail.rationale = data.get("rationale", "").strip()
        detail.save()
        detail.evidence.set(data.get("evidence") or [])
        return detail
