from django import forms
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.forms import BootstrapFormMixin, JalaliDateField
from apps.risks.models import Evidence

from .models import ABasis, Assessment, Confidence, ImpactDetail, Path
from .services import (
    FINANCIAL_SCALE,
    UNITS,
    assessable_kinds,
    assessment_rate_check,
    initiator_scale,
    path_control_choices,
    suggest,
)

UNKNOWN = "unknown"


class EvidenceChoiceField(forms.ModelMultipleChoiceField):
    def label_from_instance(self, evidence):
        return f"{evidence.code} {evidence.title}"


class AssessmentForm(BootstrapFormMixin, forms.ModelForm):
    FLAGS = ["ongoing_incident", "binding_prohibition", "customer_tolerance_exceeded"]

    class Meta:
        model = Assessment
        fields = [
            "kind",
            "horizon_months",
            "horizon_rationale",
            "target_due",
            "meeting_date",
            "assumptions",
            "ongoing_incident",
            "binding_prohibition",
            "customer_tolerance_exceeded",
            "escalation_rationale",
            "escalation_evidence",
        ]
        field_classes = {
            "meeting_date": JalaliDateField, "target_due": JalaliDateField,
            "escalation_evidence": EvidenceChoiceField,
        }
        widgets = {
            "assumptions": forms.Textarea(attrs={"rows": 3}),
            "escalation_rationale": forms.Textarea(attrs={"rows": 2}),
            "escalation_evidence": forms.SelectMultiple(attrs={"size": 4}),
        }
        help_texts = {
            "escalation_rationale": "برای هر قاعده‌ی تقدم بالا: چه چیزی احراز شده و از کجا. امتیاز عوض نمی‌شود و "
            "فقط سطح تصمیم یا اختیار پذیرش (بخش ۱۸).",
        }

    def __init__(self, *args, risk, **kwargs):
        super().__init__(*args, **kwargs)
        self.risk = risk
        if self.instance.pk:
            del self.fields["kind"]  # نوع ارزیابی بعد از ثبت عوض نمی‌شود
            current = list(self.instance.escalation_evidence.all())
        else:
            kinds = assessable_kinds(risk)
            self.fields["kind"].choices = [(kind, Assessment.Kind(kind).label) for kind in kinds]
            current = []
        ids = [item.pk for item in current]
        self.fields["escalation_evidence"].queryset = (
            Evidence.objects.filter(models.Q(risks=risk) | models.Q(pk__in=ids)).distinct().order_by("code")
        )

    def clean(self):
        data = super().clean()
        kind = data.get("kind", self.instance.kind)
        if kind == Assessment.Kind.TARGET and not data.get("target_due"):
            self.add_error("target_due", "ارزیابی هدف موعد تحقق می‌خواهد (بخش ۱۷).")
        if kind in Assessment.KINDS_NEEDING_ASSUMPTIONS and not data.get("assumptions", "").strip():
            label = "کنترل‌های کنارگذاشته" if kind == Assessment.Kind.INHERENT else "اقدام و معیار آزمون آن"
            self.add_error("assumptions", f"برای ارزیابی {Assessment.Kind(kind).label}، {label} را بنویسید.")
        if any(data.get(flag) for flag in self.FLAGS):
            if not data.get("escalation_rationale", "").strip():
                self.add_error("escalation_rationale", "قاعده‌ی تقدم با دلیل ثبت می‌شود.")
            if not data.get("escalation_evidence"):
                self.add_error("escalation_evidence", "قاعده‌ی تقدم با شاهد ثبت می‌شود (بخش ۱۸).")
        return data


class ReviewForm(BootstrapFormMixin, forms.Form):
    notes = forms.CharField(
        label="توضیح",
        required=False,
        widget=forms.Textarea(attrs={"rows": 2}),
        help_text="برای برگشت و ارجاع اجباری است.",
    )


class ReferralForm(BootstrapFormMixin, forms.Form):
    meeting_date = JalaliDateField(label="تاریخ جلسه‌ی کارگروه", required=False)
    notes = forms.CharField(label="تصمیم کارگروه", required=False, widget=forms.Textarea(attrs={"rows": 2}))


def level_choices(scale, empty="ثبت‌نشده"):
    """گزینه‌های سطح یک مقیاس با نام یا مرز و آغاز معیار هر سطح، تا ارزیاب بی‌رفتن به صفحه‌ی روش انتخاب کند."""
    choices = [("", empty)] if empty else []
    choices.append((UNKNOWN, "نامعلوم"))
    for level in scale.levels.all():
        text = "؛ ".join(part for part in [level.name, level.bounds_display(), level.criteria] if part)
        text = text if len(text) <= 80 else text[:80] + "…"
        choices.append((str(level.value), f"{level.value}: {text}"))
    return choices


def high_choices(scale):
    return [("", "-")] + [(level.value, str(level.value)) for level in scale.levels.all() if level.value > 0]


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
        self.fields["level_high"].choices = high_choices(scale)
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


def parse_level(value):
    """مقدار فیلد سطح: "" ثبت‌نشده، UNKNOWN نامعلوم (None)، یا عدد."""
    return None if value == UNKNOWN else int(value)


class InitiatorForm(BootstrapFormMixin, forms.ModelForm):
    """عامل آغازگر (بخش ۱۴): مسیر نرخ یا شواهد آینده‌نگر، داده‌ی نرخ و سطح A با دلیل و شاهد."""

    a_level = forms.ChoiceField(label="A", required=False)
    a_high = forms.TypedChoiceField(label="کران بالای A", required=False, coerce=int, empty_value=None)

    class Meta:
        model = Assessment
        fields = [
            "a_basis",
            "a_count",
            "a_period_months",
            "a_denominator",
            "a_coverage",
            "a_confidence",
            "a_rationale",
            "a_evidence",
        ]
        field_classes = {"a_evidence": EvidenceChoiceField}
        widgets = {
            "a_rationale": forms.Textarea(attrs={"rows": 3}),
            "a_evidence": forms.SelectMultiple(attrs={"size": 5}),
        }
        help_texts = {
            "a_rationale": "چرا این مسیر و این سطح؛ مثلاً منبع داده و تعدیل دامنه، یا شاهد هدف‌گیری.",
        }

    RATE_FIELDS = ["a_count", "a_period_months", "a_denominator", "a_coverage"]

    def __init__(self, *args, evidence, user=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.user = user
        assessment = self.instance
        risk = assessment.risk
        self.fields["risk_scope"] = forms.CharField(label="دامنه بررسی", required=False, initial=risk.scope, widget=forms.Textarea(attrs={"rows": 2}))
        self.fields["risk_count_unit"] = forms.CharField(label="واحد شمارش آغازگر", required=False, max_length=200, initial=risk.count_unit)
        self.fields["risk_count_exclusions"] = forms.CharField(label="موارد خارج از شمارش", required=False, initial=risk.count_exclusions, widget=forms.Textarea(attrs={"rows": 2}))
        for name in ("risk_scope", "risk_count_unit", "risk_count_exclusions"):
            self.fields[name].widget.attrs["class"] = "form-control"
        self.scale = initiator_scale(assessment.method_version)
        self.fields["a_basis"].choices = [("", "ثبت‌نشده")] + ABasis.choices
        self.fields["a_level"].choices = level_choices(self.scale, empty="-")
        self.fields["a_high"].choices = high_choices(self.scale)
        self.fields["a_evidence"].queryset = evidence
        self.fields["a_coverage"].validators += [MinValueValidator(0), MaxValueValidator(100)]
        self.fields["a_confidence"].choices = [("", "-")] + Confidence.choices
        if assessment.a_recorded:
            self.initial["a_level"] = UNKNOWN if assessment.a is None else str(assessment.a)
        self.order_fields(["risk_scope", "risk_count_unit", "risk_count_exclusions", "a_basis", *self.RATE_FIELDS, "a_level", "a_high", "a_confidence", "a_rationale"])
        self.rate = assessment_rate_check(assessment) if assessment.a_basis == ABasis.RATE else None

    def clean(self):
        data = super().clean()
        basis = data.get("a_basis", "")
        if not basis:
            # A ثبت‌نشده: هر چه نوشته شده پاک می‌شود، چون مقدار A بی‌مسیر و دلیل معنا ندارد.
            for name in [*self.RATE_FIELDS, "a_level", "a_high", "a_confidence", "a_rationale"]:
                data[name] = "" if name in ("a_denominator", "a_level", "a_confidence", "a_rationale") else None
            data["a_evidence"] = []
            return data
        if basis == ABasis.FORWARD:
            # دو ستون جمع یا میانگین نمی‌شوند؛ داده‌ی نرخ به مسیر آینده‌نگر تعلق ندارد (بخش ۱۴).
            data.update({"a_count": None, "a_period_months": None, "a_denominator": "", "a_coverage": None})
        else:
            if data.get("a_count") is None:
                self.add_error("a_count", "برای مسیر نرخ، تعداد آغازگر یکتا را بنویسید (صفر هم پذیرفته است).")
            if not data.get("a_period_months"):
                self.add_error("a_period_months", "برای مسیر نرخ، دوره‌ی مشاهده را به ماه بنویسید.")
        level = data.get("a_level", "")
        if level == "":
            self.add_error("a_level", "سطح A را انتخاب کنید، یا «نامعلوم» را.")
            return data
        number = parse_level(level)
        high = data.get("a_high")
        if high is not None and (number is None or high <= number):
            self.add_error("a_high", "کران بالا باید از A بیشتر باشد؛ برای سطح قطعی خالی بگذارید.")
        if not data.get("a_rationale", "").strip():
            self.add_error("a_rationale", "مسیر انتخابی و دلیل آن الزامی است (بخش ۱۴).")
        if number is not None and not data.get("a_confidence"):
            self.add_error("a_confidence", "اطمینان A را انتخاب کنید.")
        if basis == ABasis.RATE and not self.errors:
            self.rate = assessment_rate_check(
                self.instance, data["a_count"], data["a_period_months"], data.get("a_coverage")
            )
            if self.rate.insufficient and number is not None and high is None:
                self.add_error(
                    "a_level",
                    "داده‌ی نرخ برای سطح قطعی کافی نیست: "
                    + " ".join(self.rate.insufficient)
                    + " A را بازه بگذارید، «نامعلوم» ثبت کنید یا مسیر شواهد آینده‌نگر را انتخاب کنید (بخش ۱۴).",
                )
        data["a_number"] = number
        return data

    def save(self, commit=True):
        assessment = super().save(commit=False)
        data = self.cleaned_data
        assessment.a = data.get("a_number") if assessment.a_basis else None
        assessment.a_high = data.get("a_high") if assessment.a_basis else None
        if not assessment.a_basis or assessment.a is None:
            assessment.a_confidence = ""
        if commit:
            assessment.save()
            self.save_m2m()
            mapping = {"risk_scope": "scope", "risk_count_unit": "count_unit", "risk_count_exclusions": "count_exclusions"}
            if any(self.add_prefix(name) in self.data for name in mapping):
                risk = assessment.risk
                for name, attribute in mapping.items():
                    if self.add_prefix(name) in self.data:
                        setattr(risk, attribute, data[name])
                if self.user:
                    risk._history_user = self.user
                risk.save()
        return assessment


class ControlAssessmentChoiceField(forms.ModelMultipleChoiceField):
    def label_from_instance(self, item):
        scope = item.scope if len(item.scope) <= 40 else item.scope[:40] + "…"
        label = f"{item.control.code} {item.control.title}، E{item.e} در «{scope}» ({item.code})"
        problem = item.credit_problem()
        return f"{label} - {problem}" if problem else label


class PathForm(BootstrapFormMixin, forms.ModelForm):
    """یک مسیر تحقق: B0 بدون اعتبار کنترل‌ها، کنترل‌های پیشگیرانه‌ای که مسیر را قطع می‌کنند، و استقلال موانع."""

    b0_level = forms.ChoiceField(label="B0")
    b0_high = forms.TypedChoiceField(label="کران بالای B0", required=False, coerce=int, empty_value=None)

    class Meta:
        model = Path
        fields = [
            "name",
            "description",
            "b0_rationale",
            "b0_confidence",
            "evidence",
            "control_assessments",
            "critical_exception",
            "exceptions",
            "independent",
            "independence_rationale",
        ]
        field_classes = {"evidence": EvidenceChoiceField, "control_assessments": ControlAssessmentChoiceField}
        widgets = {
            "description": forms.Textarea(attrs={"rows": 3}),
            "b0_rationale": forms.Textarea(attrs={"rows": 2}),
            "exceptions": forms.Textarea(attrs={"rows": 2}),
            "independence_rationale": forms.Textarea(attrs={"rows": 2}),
            "evidence": forms.SelectMultiple(attrs={"size": 4}),
            "control_assessments": forms.SelectMultiple(attrs={"size": 5}),
        }
        help_texts = {
            "b0_rationale": "پیش‌شرط ذاتی مسیر، نه کنترل اعمال‌شده؛ نبود اطلاعات مسیر مجوز B0 برابر ۱ نیست.",
        }

    def __init__(self, *args, assessment, evidence, **kwargs):
        super().__init__(*args, **kwargs)
        self.assessment = assessment
        path = self.instance
        self.scale = assessment.method_version.scales.prefetch_related("levels").get(code="B0")
        self.fields["b0_level"].choices = level_choices(self.scale, empty="-")
        self.fields["b0_high"].choices = high_choices(self.scale)
        if path.pk:
            self.initial["b0_level"] = UNKNOWN if path.b0 is None else str(path.b0)
            current = list(path.control_assessments.all())
        else:
            current = []
        self.fields["control_assessments"].queryset = path_control_choices(assessment, current)
        self.fields["evidence"].queryset = evidence
        self.fields["b0_confidence"].choices = [("", "-")] + Confidence.choices
        self.order_fields(["name", "description", "b0_level", "b0_high", "b0_confidence", "b0_rationale", "evidence"])

    def clean(self):
        data = super().clean()
        level = data.get("b0_level", "")
        number = parse_level(level) if level else None
        high = data.get("b0_high")
        evidence = data.get("evidence") or []
        controls = list(data.get("control_assessments") or [])
        if level and high is not None and (number is None or high <= number):
            self.add_error("b0_high", "کران بالا باید از B0 بیشتر باشد؛ برای سطح قطعی خالی بگذارید.")
        if level and number is not None and not data.get("b0_confidence"):
            self.add_error("b0_confidence", "اطمینان B0 را انتخاب کنید.")
        if number is None:
            data["b0_confidence"] = ""
        if number == 1 and not evidence:
            self.add_error(
                "evidence", "B0 برابر ۱ یعنی نادر بودن دو شرط استثنایی با شواهد تأیید شده است؛ شاهد را انتخاب کنید."
            )
        seen = {}
        for item in controls:
            if item.control_id in seen:
                self.add_error(
                    "control_assessments",
                    f"کنترل {item.control.code} دو بار انتخاب شده است؛ اثر یک کنترل در یک مسیر یک بار حساب می‌شود.",
                )
            seen[item.control_id] = item
        if data.get("critical_exception") and not data.get("exceptions", "").strip():
            self.add_error("exceptions", "استثنای بحرانی باز را شرح دهید.")
        if data.get("independent"):
            if not data.get("independence_rationale", "").strip():
                self.add_error("independence_rationale", "بنویسید وابستگی‌های مشترک چطور بررسی شده‌اند.")
            if len(controls) < 2:
                self.add_error("independent", "استقلال دست‌کم دو مانع می‌خواهد.")
            if not evidence:
                self.add_error("evidence", "استقلال موانع با شواهد آزمون تأیید می‌شود (بخش ۱۵)؛ شاهد را انتخاب کنید.")
        else:
            data["independence_rationale"] = ""
        data["b0_number"] = number
        return data

    def save(self, commit=True):
        path = super().save(commit=False)
        path.assessment = self.assessment
        path.b0 = self.cleaned_data["b0_number"]
        path.b0_high = self.cleaned_data.get("b0_high")
        if commit:
            path.save()
            self.save_m2m()
        return path
