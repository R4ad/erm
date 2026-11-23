from django import forms
from django.core.validators import MaxLengthValidator
from django.db.models import Exists, OuterRef
from django.forms import inlineformset_factory

from apps.catalog.forms import OwnerChoiceField
from apps.catalog.permissions import visible_services
from apps.core.forms import BootstrapFormMixin
from apps.organization.forms import UnitChoiceField
from apps.organization.models import OrgUnit
from apps.organization.services import get_subtree_ids
from apps.risks.forms import ServiceChoiceField
from apps.risks.models import Risk, RiskCategory, RiskScenario
from apps.risks.services import active_risks

from .models import Option, PendingRisk, Question, Questionnaire, Response
from .permissions import answerable_units, can_manage_questionnaires, respondents


def check_inputs(form, *names):
    """دکمه‌های رادیویی و چک‌باکس‌های چندتایی کلاس form-check-input می‌خواهند، نه form-control."""
    for name in names:
        form.fields[name].widget.attrs["class"] = "form-check-input"


class QuestionnaireForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = Questionnaire
        fields = ["title", "description", "is_active"]
        widgets = {"description": forms.Textarea(attrs={"rows": 3})}


class QuestionForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = Question
        fields = ["order", "text", "help_text", "kind", "stage", "is_required", "is_active"]
        widgets = {"text": forms.Textarea(attrs={"rows": 2})}
        help_texts = {
            "kind": "برای «بله و خیر» دو گزینه‌ی بله و خیر خودکار ساخته می‌شود؛ فقط مشخص کنید کدام نشانه‌ی ریسک است."
        }

    def clean_kind(self):
        kind = self.cleaned_data["kind"]
        question = self.instance
        if question.pk and kind != question.kind and question.answers.exists():
            raise forms.ValidationError("این سؤال جواب گرفته است و نوعش عوض نمی‌شود؛ سؤال تازه‌ای بسازید.")
        return kind

    def clean(self):
        data = super().clean()
        questionnaire = getattr(self.instance, "questionnaire", None)
        if questionnaire and questionnaire.is_structured:
            if not data.get("stage"):
                self.add_error("stage", "بخش سؤال را انتخاب کنید.")
            if data.get("kind") != Question.Kind.TEXT:
                self.add_error("kind", "پرسش‌های این پرسشنامه باید متنی باشند.")
            if self.instance.pk and "stage" in self.changed_data and questionnaire.responses.exists():
                self.add_error("stage", "این پرسشنامه پاسخ گرفته است؛ برای بخش دیگر سؤال تازه بسازید.")
        return data


class OptionForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = Option
        fields = ["order", "text", "indicates_risk", "scenario", "category", "is_active"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        option = self.instance
        scenarios = RiskScenario.objects.filter(is_active=True) | RiskScenario.objects.filter(pk=option.scenario_id)
        self.fields["scenario"].queryset = scenarios.select_related("category")
        categories = RiskCategory.objects.filter(is_active=True) | RiskCategory.objects.filter(pk=option.category_id)
        self.fields["category"].queryset = categories
        self.fields["order"].widget.attrs["style"] = "max-width: 5rem"

    def has_changed(self):
        # ردیف خالی تازه نادیده گرفته می‌شود، حتی اگر ترتیب یا تیکش عوض شده باشد؛ گزینه بی‌متن معنی ندارد.
        if not self.instance.pk and not self.data.get(self.add_prefix("text"), "").strip():
            return False
        return super().has_changed()

    def clean(self):
        data = super().clean()
        if not data.get("indicates_risk") and (data.get("scenario") or data.get("category")):
            self.add_error("indicates_risk", "سناریو و دسته فقط برای گزینه‌ی «نشانه‌ی ریسک» است.")
        return data


OptionFormSet = inlineformset_factory(Question, Option, form=OptionForm, extra=4, can_delete=False)


def active_option_count(formset):
    """گزینه‌های فعالی که با ذخیره‌ی این فرم‌ها خواهند بود: فرم‌های پرشده‌ی فعال."""
    count = 0
    for form in formset.forms:
        data = getattr(form, "cleaned_data", {})
        if data.get("text") and data.get("is_active"):
            count += 1
    return count


class ResponseStartForm(BootstrapFormMixin, forms.ModelForm):
    """شروع یک پاسخ: کدام واحد، درباره‌ی کدام خدمت، و در مصاحبه به نام کدام مدیر واحد."""

    class Meta:
        model = Response
        fields = ["org_unit", "service", "respondent"]
        field_classes = {"org_unit": UnitChoiceField, "service": ServiceChoiceField, "respondent": OwnerChoiceField}
        help_texts = {
            "respondent": "مدیر واحدی که در مصاحبه جواب داده است. جواب‌ها به نام او ثبت می‌شوند.",
        }

    def __init__(self, *args, user, **kwargs):
        super().__init__(*args, **kwargs)
        self.user = user
        self.fields["org_unit"].queryset = answerable_units(user)
        if self.instance.questionnaire_id and self.instance.questionnaire.is_structured:
            del self.fields["service"]
            del self.fields["respondent"]
            self.instance.respondent = user
            return
        self.fields["service"].queryset = visible_services(user).filter(is_active=True)
        if can_manage_questionnaires(user):
            self.fields["respondent"].queryset = respondents()
            if respondents().filter(pk=user.pk).exists():
                self.fields["respondent"].initial = user.pk
        else:
            del self.fields["respondent"]  # مدیر واحد فقط به نام خودش جواب می‌دهد
            self.instance.respondent = user

    def clean(self):
        data = super().clean()
        unit, service = data.get("org_unit"), data.get("service")
        respondent = data.get("respondent", self.instance.respondent if self.instance.respondent_id else None)
        if "respondent" in self.fields and unit and respondent and unit.pk not in respondent.managed_unit_ids():
            self.add_error("respondent", f"این کاربر مدیر واحد «{unit}» یا بالادست آن نیست.")
        if unit and service and service.org_unit_id not in get_subtree_ids(unit):
            self.add_error("service", f"این خدمت مال واحد «{unit}» یا زیرمجموعه‌های آن نیست.")
        if unit and self.instance.questionnaire_id:
            open_responses = Response.objects.filter(
                questionnaire=self.instance.questionnaire,
                org_unit=unit,
                service=service,
                status__in=[Response.Status.DRAFT, Response.Status.SUBMITTED, Response.Status.RETURNED],
            )
            if open_responses.exists():
                raise forms.ValidationError(
                    "برای همین واحد و خدمت پاسخ بازی از این پرسشنامه هست؛ همان را کامل کنید یا منتظر بررسی آن بمانید."
                )
        return data


def limit_text(field):
    """سقف نویسه‌ی جواب هر پرسش (فیگما ۱۰: «۱۴۸ / ۱۰۰۰ نویسه»)."""
    field.max_length = Response.TEXT_LIMIT
    field.validators.append(MaxLengthValidator(Response.TEXT_LIMIT))
    field.widget.attrs["maxlength"] = Response.TEXT_LIMIT


class ResponseAnswerForm(BootstrapFormMixin, forms.ModelForm):
    """فرم پاسخ: قلم‌های ثابت (کارکردها و پرسش‌های جلسه‌ی بخش ۴)، یک فیلد برای هر سؤال فعال و «مورد جدید». فیلد سؤال‌ها در فرم اجباری
    نیستند تا پیش‌نویس نیمه‌کاره ذخیره شود؛ سؤال‌های اجباری هنگام ارسال چک می‌شوند."""

    class Meta:
        model = Response
        fields = Response.FIXED_ITEMS + ["new_item"]
        widgets = {name: forms.Textarea(attrs={"rows": 2}) for name in fields}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["new_item"].widget.attrs["rows"] = 4
        for name in Response.FIXED_ITEMS:
            limit_text(self.fields[name])
        response = self.instance
        answers = {answer.question_id: answer for answer in response.answers.prefetch_related("options")}
        self.questions = list(response.questionnaire.active_questions())
        for question in self.questions:
            name = self.question_field_name(question)
            answer = answers.get(question.pk)
            options = question.options.filter(is_active=True)
            if question.kind == Question.Kind.TEXT:
                # فیلدهای سؤال بعد از BootstrapFormMixin ساخته می‌شوند، پس کلاسشان را خودمان می‌گذاریم.
                field = forms.CharField(
                    required=False,
                    max_length=Response.TEXT_LIMIT,
                    widget=forms.Textarea(attrs={"rows": 2, "class": "form-control"}),
                )
                initial = answer.text if answer else ""
            elif question.kind == Question.Kind.MULTIPLE:
                field = forms.ModelMultipleChoiceField(options, required=False, widget=forms.CheckboxSelectMultiple)
                initial = list(answer.options.all()) if answer else []
            else:
                field = forms.ModelChoiceField(options, required=False, widget=forms.RadioSelect, empty_label=None)
                initial = answer.options.first() if answer else None
            field.label = question.text
            field.help_text = question.help_text
            field.initial = initial
            self.fields[name] = field
            if question.has_options:
                check_inputs(self, name)

    @staticmethod
    def question_field_name(question):
        return f"question_{question.pk}"

    def question_fields(self):
        """(سؤال، فیلد) به ترتیب سؤال‌ها، برای قالب."""
        return [(question, self[self.question_field_name(question)]) for question in self.questions]

    def fixed_fields(self):
        return [self[name] for name in Response.FIXED_ITEMS]

    def answer_values(self):
        """(سؤال، مقدار) برای ذخیره: متن، یا فهرست گزینه‌ها."""
        values = []
        for question in self.questions:
            value = self.cleaned_data[self.question_field_name(question)]
            if question.kind == Question.Kind.TEXT:
                value = value.strip()
            elif question.kind != Question.Kind.MULTIPLE:
                value = [value] if value else []
            values.append((question, value))
        return values


class ReturnForm(BootstrapFormMixin, forms.Form):
    question = forms.CharField(
        label="سؤال مشخص برای پاسخ‌دهنده",
        widget=forms.Textarea(attrs={"rows": 3}),
        help_text="بنویسید دقیقاً چه چیزی مبهم است. مهلت جواب پنج روز کاری است.",
    )


class PendingRiskForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = PendingRisk
        fields = ["description", "scenario", "category"]
        widgets = {"description": forms.Textarea(attrs={"rows": 3})}
        help_texts = {"description": "کدام جواب یا شرح نشانه‌ی ریسک است، به زبان خود پاسخ."}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["scenario"].queryset = RiskScenario.objects.filter(is_active=True)
        self.fields["category"].queryset = RiskCategory.objects.filter(is_active=True)


class RiskChoiceField(forms.ModelChoiceField):
    def label_from_instance(self, risk):
        return f"{risk.code} {risk.title}"


class DismissForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = PendingRisk
        fields = ["dismiss_reason", "duplicate_of"]
        field_classes = {"duplicate_of": RiskChoiceField}
        widgets = {"dismiss_reason": forms.Textarea(attrs={"rows": 3})}
        help_texts = {"duplicate_of": "اگر همین ریسک پیش‌تر در رجیستر ثبت شده، آن را انتخاب کنید."}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["dismiss_reason"].required = True
        self.fields["duplicate_of"].queryset = active_risks(Risk.objects.all()).order_by("code")


class ResponseFilterForm(BootstrapFormMixin, forms.Form):
    status = forms.ChoiceField(label="وضعیت", required=False, choices=[("", "همه")] + Response.Status.choices)
    questionnaire = forms.ModelChoiceField(
        Questionnaire.objects.all(), label="پرسشنامه", required=False, empty_label="همه"
    )
    unit = UnitChoiceField(OrgUnit.objects.all(), label="واحد", required=False, empty_label="همه‌ی واحدها")
    pending = forms.ChoiceField(
        label="ریسک در انتظار", required=False, choices=[("", "همه"), ("yes", "دارد"), ("no", "ندارد")]
    )

    def filter(self, responses):
        data = self.cleaned_data
        if data["status"]:
            responses = responses.filter(status=data["status"])
        if data["questionnaire"]:
            responses = responses.filter(questionnaire=data["questionnaire"])
        if data["unit"]:
            responses = responses.filter(org_unit__in=get_subtree_ids(data["unit"]))
        # Exists به جای join: join روی pending_risks ردیف‌ها را چند برابر می‌کرد و شمارش «ریسک در انتظار» فهرست را
        # (که روی همین رابطه annotate شده) بیشتر از واقع نشان می‌داد.
        has_pending = Exists(PendingRisk.objects.filter(response=OuterRef("pk"), status=PendingRisk.Status.PENDING))
        if data["pending"] == "yes":
            responses = responses.filter(has_pending)
        elif data["pending"] == "no":
            responses = responses.filter(~has_pending)
        return responses
