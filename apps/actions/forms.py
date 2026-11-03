from datetime import timedelta

from django import forms
from django.db.models import Q
from django.utils import timezone

from apps.assessments.models import Assessment
from apps.catalog.forms import OwnerChoiceField, user_choices
from apps.controls.forms import ControlChoiceField
from apps.controls.models import Control
from apps.core.forms import BootstrapFormMixin, JalaliDateField, check_upload
from apps.core.jalali import to_jalali
from apps.methodology.models import Scale

from .acceptance import acceptance_cap, is_non_normal
from .models import AcceptanceSignature, RiskAcceptance, TreatmentAction, TreatmentPlan

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


class AcceptanceForm(BootstrapFormMixin, forms.ModelForm):
    """برگه‌ی پذیرش زمان‌دار بخش ۲۵. سقف پایان اعتبار از سطح تصمیم ارزیابی می‌آید."""

    start_date = JalaliDateField(label="آغاز اعتبار")
    end_date = JalaliDateField(label="پایان اعتبار")
    evidence_due = JalaliDateField(label="مهلت جمع‌آوری شاهد", required=False)

    class Meta:
        model = RiskAcceptance
        fields = [
            "renews",
            "scope",
            "reason",
            "alternatives",
            "compensating_controls",
            "controls",
            "conditions",
            "customer_constraints",
            "monitoring",
            "revocation_triggers",
            "start_date",
            "end_date",
            "evidence_due",
            "follow_up_by",
        ]
        field_classes = {"follow_up_by": OwnerChoiceField, "controls": ControlChoiceField}
        widgets = {
            name: forms.Textarea(attrs={"rows": 2})
            for name in [
                "scope",
                "reason",
                "alternatives",
                "compensating_controls",
                "conditions",
                "customer_constraints",
                "monitoring",
                "revocation_triggers",
            ]
        }

    def __init__(self, *args, risk, assessment, **kwargs):
        super().__init__(*args, **kwargs)
        acceptance = self.instance
        self.assessment = assessment
        self.level = assessment.decision_level
        self.fields["follow_up_by"].queryset = user_choices(acceptance.follow_up_by_id)
        previous = RiskAcceptance.objects.filter(risk=risk, status=RiskAcceptance.Status.ACTIVE)
        if acceptance.pk:
            previous = previous.exclude(pk=acceptance.pk)
        self.fields["renews"].queryset = previous
        self.fields["renews"].label_from_instance = lambda item: f"{item.code} تا {to_jalali(item.end_date)}"
        current = acceptance.controls.values("pk") if acceptance.pk else []
        self.fields["controls"].queryset = Control.objects.filter(Q(is_active=True) | Q(pk__in=current))
        self.fields["controls"].required = False
        self.fields["controls"].help_text = f"کنترل‌های کتابخانه که جبرانی‌اند، اگر هست. {MULTI_HELP}"
        level = self.level
        self.fields["end_date"].help_text = (
            f"سقف اعتبار پذیرش سطح «{level}»: {level.acceptance_value} {level.get_acceptance_unit_display()} از آغاز. "
            "تمدید خودکار نیست."
        )
        if is_non_normal(assessment):
            self.fields["evidence_due"].required = True
            self.fields["evidence_due"].help_text = "ارزیابی ناقص است یا اطمینان کم دارد، پس این پذیرش عادی نیست."
        else:
            self.fields["evidence_due"].help_text = "فقط برای پذیرش غیرعادی لازم است."
        if not acceptance.pk:
            today = timezone.localdate()
            self.initial.setdefault("start_date", today)
            self.initial.setdefault("end_date", acceptance_cap(level, today))

    def clean(self):
        data = super().clean()
        start, end, evidence_due = data.get("start_date"), data.get("end_date"), data.get("evidence_due")
        today = timezone.localdate()
        if start and start < today and (not self.instance.pk or start != self.instance.start_date):
            self.add_error("start_date", "آغاز اعتبار پیش از امروز نیست؛ پذیرش عطف به ماسبق نمی‌شود.")
        if start and end:
            cap = acceptance_cap(self.level, start)
            if end <= start:
                self.add_error("end_date", "پایان اعتبار باید بعد از آغاز باشد.")
            elif end > cap:
                self.add_error(
                    "end_date", f"پایان اعتبار از سقف سطح «{self.level}» دیرتر است؛ حداکثر {to_jalali(cap)}."
                )
        if evidence_due and end and evidence_due > end:
            self.add_error("evidence_due", "مهلت جمع‌آوری شاهد بعد از پایان اعتبار است.")
        if evidence_due and evidence_due < today:
            self.add_error("evidence_due", "مهلت جمع‌آوری شاهد گذشته است.")
        return data


class SignForm(BootstrapFormMixin, forms.Form):
    """امضای یک صاحب اختیار. شماره و تاریخ برای کمیته (صورت‌جلسه) و مدیریت ارشد (نامه) است و فایل فقط برای نامه."""

    authority = forms.ChoiceField(choices=AcceptanceSignature.Authority.choices, widget=forms.HiddenInput)
    note = forms.CharField(
        label="توضیح", required=False, widget=forms.Textarea(attrs={"rows": 2}), help_text="برای رد لازم است."
    )
    reference = forms.CharField(label="شماره‌ی صورت‌جلسه یا نامه", max_length=100, required=False)
    reference_date = JalaliDateField(label="تاریخ صورت‌جلسه یا نامه", required=False)
    letter = forms.FileField(label="فایل نامه", required=False)

    def __init__(self, *args, authority=None, **kwargs):
        super().__init__(*args, **kwargs)
        if authority:
            self.initial["authority"] = authority
            self.authority_label = AcceptanceSignature.Authority(authority).label
        if authority != AcceptanceSignature.Authority.SENIOR_MANAGEMENT:
            del self.fields["letter"]
        if authority not in (AcceptanceSignature.Authority.COMMITTEE, AcceptanceSignature.Authority.SENIOR_MANAGEMENT):
            del self.fields["reference"], self.fields["reference_date"]
        elif authority == AcceptanceSignature.Authority.COMMITTEE:
            self.fields["reference"].label = "شماره‌ی صورت‌جلسه"
            self.fields["reference_date"].label = "تاریخ جلسه"
            self.fields["reference"].help_text = "شماره یا تاریخ صورت‌جلسه لازم است (جواب س۶۴)."
        else:
            self.fields["reference"].label = "شماره‌ی نامه"
            self.fields["reference_date"].label = "تاریخ نامه"
            self.fields["letter"].help_text = "شماره، تاریخ و فایل نامه لازم است (جواب س۵)."

    def clean_letter(self):
        upload = self.cleaned_data.get("letter")
        if upload:
            check_upload(upload)
        return upload


class RevokeForm(BootstrapFormMixin, forms.Form):
    reason = forms.CharField(label="دلیل لغو", widget=forms.Textarea(attrs={"rows": 2}))


class AcceptanceFilterForm(BootstrapFormMixin, forms.Form):
    q = forms.CharField(
        label="جست‌وجو", required=False, widget=forms.TextInput(attrs={"placeholder": "کد پذیرش یا ریسک"})
    )
    status = forms.ChoiceField(
        label="وضعیت",
        required=False,
        choices=[
            ("", "همه"),
            ("in_force", "معتبر و منقضی‌نشده"),
            ("expiring", "رو به انقضا (۳۰ روز)"),
            ("expired", "منقضی"),
        ]
        + RiskAcceptance.Status.choices,
    )

    def filter(self, acceptances):
        data = self.cleaned_data
        for word in data["q"].split():
            acceptances = acceptances.filter(Q(code__icontains=word) | Q(risk__code__icontains=word))
        status = data["status"]
        today = timezone.localdate()
        active = acceptances.filter(status=RiskAcceptance.Status.ACTIVE)
        if status == "in_force":
            acceptances = active.filter(end_date__gte=today)
        elif status == "expiring":
            acceptances = active.filter(end_date__gte=today, end_date__lte=today + timedelta(days=30))
        elif status == "expired":
            acceptances = active.filter(end_date__lt=today)
        elif status:
            acceptances = acceptances.filter(status=status)
        return acceptances
