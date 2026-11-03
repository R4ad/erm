from django import forms
from django.db.models import Q
from django.utils import timezone

from apps.assessments.models import Assessment
from apps.catalog.forms import OwnerChoiceField, user_choices
from apps.controls.forms import ControlChoiceField
from apps.controls.models import Control
from apps.core.forms import BootstrapFormMixin, JalaliDateField
from apps.methodology.models import Scale

from .models import TreatmentAction, TreatmentPlan

MULTI_HELP = "برای انتخاب چند مورد، Ctrl (در مک Cmd) را نگه دارید و کلیک کنید."


class AssessmentChoiceField(forms.ModelChoiceField):
    def label_from_instance(self, assessment):
        level = f"، سطح {assessment.decision_level}" if assessment.decision_level_id else ""
        return f"{assessment.code} ({assessment.get_status_display()}{level})"


class EvidenceChoiceField(forms.ModelMultipleChoiceField):
    def label_from_instance(self, evidence):
        return f"{evidence.code} {evidence.title}"


class ActionChoiceField(forms.ModelMultipleChoiceField):
    def label_from_instance(self, action):
        return f"{action.code} {action.title}"


class PlanForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = TreatmentPlan
        fields = ["option", "rationale", "option_details", "target_assessment"]
        field_classes = {"target_assessment": AssessmentChoiceField}
        widgets = {
            "rationale": forms.Textarea(attrs={"rows": 3}),
            "option_details": forms.Textarea(attrs={"rows": 3}),
        }

    def __init__(self, *args, risk, **kwargs):
        super().__init__(*args, **kwargs)
        # ارزیابی هدف همین ریسک؛ تأییدش پیش از تأیید طرح چک می‌شود.
        self.fields["target_assessment"].queryset = Assessment.objects.filter(
            risk=risk, kind=Assessment.Kind.TARGET
        ).select_related("decision_level")

    def clean(self):
        data = super().clean()
        option = data.get("option")
        if (
            option in (TreatmentPlan.Option.TRANSFER, TreatmentPlan.Option.AVOID)
            and not data.get("option_details", "").strip()
        ):
            self.add_error("option_details", "برای این گزینه شرط‌ها را بنویسید (بخش ۲۰).")
        return data


class ActionForm(BootstrapFormMixin, forms.ModelForm):
    start_date = JalaliDateField(label="آغاز")
    due_date = JalaliDateField(label="سررسید")

    class Meta:
        model = TreatmentAction
        fields = [
            "title",
            "deliverable",
            "mechanism",
            "dimension",
            "owner",
            "assignee",
            "verifier",
            "start_date",
            "due_date",
            "cost",
            "person_hours",
            "depends_on",
            "controls",
            "description",
            "acceptance_criteria",
        ]
        field_classes = {
            "owner": OwnerChoiceField,
            "assignee": OwnerChoiceField,
            "verifier": OwnerChoiceField,
            "depends_on": ActionChoiceField,
            "controls": ControlChoiceField,
        }
        widgets = {
            "deliverable": forms.Textarea(attrs={"rows": 3}),
            "description": forms.Textarea(attrs={"rows": 2}),
            "acceptance_criteria": forms.Textarea(attrs={"rows": 3}),
        }

    def __init__(self, *args, plan, **kwargs):
        super().__init__(*args, **kwargs)
        action = self.instance
        self.plan = plan
        for name in ["owner", "assignee", "verifier"]:
            self.fields[name].queryset = user_choices(getattr(action, f"{name}_id"))
        self.fields["dimension"].queryset = Scale.objects.filter(
            version=plan.assessment.method_version, kind=Scale.Kind.IMPACT
        )
        others = TreatmentAction.objects.filter(plan__risk=plan.risk)
        if action.pk:
            others = others.exclude(pk=action.pk)
        self.fields["depends_on"].queryset = others
        self.fields["depends_on"].help_text = f"اقدام‌های دیگر همین ریسک که این اقدام منتظر آن‌هاست. {MULTI_HELP}"
        current = action.controls.values("pk") if action.pk else []
        self.fields["controls"].queryset = Control.objects.filter(Q(is_active=True) | Q(pk__in=current))
        self.fields["controls"].help_text += f" {MULTI_HELP}"

    def clean(self):
        data = super().clean()
        mechanism, dimension = data.get("mechanism"), data.get("dimension")
        if mechanism == TreatmentAction.Mechanism.IMPACT and not dimension:
            self.add_error("dimension", "بُعد پیامدی را که اقدام تغییر می‌دهد انتخاب کنید.")
        elif mechanism and mechanism != TreatmentAction.Mechanism.IMPACT and dimension:
            self.add_error("dimension", "بُعد پیامد فقط برای سازوکار «یک بُعد پیامد» است.")
        start, due = data.get("start_date"), data.get("due_date")
        if start and due and due < start:
            self.add_error("due_date", "سررسید پیش از آغاز است.")
        verifier = data.get("verifier")
        if verifier and verifier in (data.get("owner"), data.get("assignee")):
            # تأیید خروجی با کسی است که اقدام را انجام نداده و پاسخ‌گوی آن نیست (بخش ۲۰).
            self.add_error("verifier", "تأییدکننده‌ی نتیجه باید کسی جز مالک و مجری اقدام باشد.")
        return data


class MoveForm(BootstrapFormMixin, forms.Form):
    note = forms.CharField(label="توضیح", required=False, widget=forms.Textarea(attrs={"rows": 2}))
    evidence = EvidenceChoiceField(
        label="شاهد اجرا",
        queryset=None,
        required=False,
        help_text=f"برای «آماده‌ی آزمون»: شاهد اجرا از شواهد ریسک. گزارش اجرا را می‌توانید پیوست هم کنید. {MULTI_HELP}",
    )

    def __init__(self, *args, evidence, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["evidence"].queryset = evidence


class ActionFilterForm(BootstrapFormMixin, forms.Form):
    q = forms.CharField(label="جست‌وجو", required=False, widget=forms.TextInput(attrs={"placeholder": "کد یا عنوان"}))
    status = forms.ChoiceField(
        label="وضعیت", required=False, choices=[("", "همه"), ("open", "باز")] + TreatmentAction.Status.choices
    )
    overdue = forms.BooleanField(label="فقط عقب‌افتاده", required=False)
    mine = forms.BooleanField(label="فقط اقدام‌های من", required=False)

    def __init__(self, *args, user, **kwargs):
        super().__init__(*args, **kwargs)
        self.user = user

    def filter(self, actions):
        data = self.cleaned_data
        for word in data["q"].split():
            actions = actions.filter(
                Q(code__icontains=word) | Q(title__icontains=word) | Q(plan__risk__code__icontains=word)
            )
        status = data["status"]
        if status == "open":
            actions = actions.exclude(status=TreatmentAction.Status.VERIFIED)
        elif status:
            actions = actions.filter(status=status)
        if data["overdue"]:
            actions = actions.exclude(status=TreatmentAction.Status.VERIFIED).filter(due_date__lt=timezone.localdate())
        if data["mine"]:
            user = self.user
            actions = actions.filter(Q(owner=user) | Q(assignee=user) | Q(verifier=user))
        return actions
