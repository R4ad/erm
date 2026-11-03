from django import forms

from apps.core.forms import BootstrapFormMixin, JalaliDateField
from apps.risks.permissions import visible_risks
from apps.risks.services import active_risks

from .models import ChangeRequest, RiskQuestion
from .services import change_problems


class TransitionForm(BootstrapFormMixin, forms.Form):
    """فرم یک انتقال: فقط فیلدهایی که همان انتقال لازم دارد."""

    def __init__(self, *args, transition, **kwargs):
        self.transition = transition
        super().__init__(*args, **kwargs)
        if transition.asks_questions:
            self.fields["questions"] = forms.CharField(
                label="پرسش‌ها",
                widget=forms.Textarea(attrs={"rows": 4, "class": "form-control"}),
                help_text="هر پرسش در یک خط. مدیران واحد ریسک تا پنج روز کاری جواب می‌دهند.",
            )
        if transition.meeting_date:
            self.fields["meeting_date"] = JalaliDateField(label="تاریخ جلسه‌ی کارگروه")
            self.fields["meeting_date"].widget.attrs.setdefault("class", "form-control")
        self.fields["reason"] = forms.CharField(
            label=transition.reason_label,
            required=transition.reason_required,
            widget=forms.Textarea(attrs={"rows": 3, "class": "form-control"}),
        )
        if transition.name == "send_to_assessment":
            self.fields["reason"].help_text = "اگر شاهدی به ریسک وصل نیست، فرض قابل آزمون را اینجا بنویسید."

    def clean_questions(self):
        lines = [line.strip() for line in self.cleaned_data["questions"].splitlines() if line.strip()]
        if not lines:
            raise forms.ValidationError("دست‌کم یک پرسش بنویسید.")
        return lines


class AnswerForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = RiskQuestion
        fields = ["answer"]
        widgets = {"answer": forms.Textarea(attrs={"rows": 4})}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["answer"].required = True


class RiskChoiceField(forms.ModelChoiceField):
    def label_from_instance(self, risk):
        return f"{risk.code} {risk.title}"


class ChangeRequestForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = ChangeRequest
        fields = ["merge_into", "parts", "reason"]
        field_classes = {"merge_into": RiskChoiceField}
        widgets = {"parts": forms.Textarea(attrs={"rows": 4}), "reason": forms.Textarea(attrs={"rows": 3})}

    def __init__(self, *args, user, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.instance
        if request.kind == ChangeRequest.Kind.MERGE:
            del self.fields["parts"]
            self.fields["merge_into"].required = True
            self.fields["merge_into"].queryset = (
                active_risks(visible_risks(user)).exclude(pk=request.risk_id).order_by("code")
            )
        else:
            del self.fields["merge_into"]
            self.fields["parts"].required = True

    def clean(self):
        data = super().clean()
        for problem in change_problems(self.instance.risk, self.instance.kind, data.get("merge_into")):
            self.add_error(None, problem)
        return data


class DecisionForm(BootstrapFormMixin, forms.Form):
    # مقدار تصمیم از دکمه‌ی «تأیید» یا «رد» می‌آید، نه از فیلد فرم.
    decision = forms.ChoiceField(choices=[("approve", "تأیید"), ("reject", "رد")])
    note = forms.CharField(
        label="توضیح",
        required=False,
        widget=forms.Textarea(attrs={"rows": 3}),
        help_text="برای رد اجباری است.",
    )

    def clean(self):
        data = super().clean()
        if data.get("decision") == "reject" and not data.get("note", "").strip():
            self.add_error("note", "دلیل رد را بنویسید.")
        return data


class ChangeRequestFilterForm(BootstrapFormMixin, forms.Form):
    status = forms.ChoiceField(label="وضعیت", required=False, choices=[("", "همه")] + ChangeRequest.Status.choices)
    kind = forms.ChoiceField(label="نوع", required=False, choices=[("", "همه")] + ChangeRequest.Kind.choices)
    mine = forms.ChoiceField(label="تأییدکننده", required=False, choices=[("", "همه"), ("yes", "منتظر تأیید من")])

    def __init__(self, *args, user, **kwargs):
        self.user = user
        super().__init__(*args, **kwargs)

    def filter(self, requests):
        data = self.cleaned_data
        if data["status"]:
            requests = requests.filter(status=data["status"])
        if data["kind"]:
            requests = requests.filter(kind=data["kind"])
        if data["mine"] == "yes":
            requests = requests.filter(status=ChangeRequest.Status.PENDING, risk__owner=self.user)
        return requests
