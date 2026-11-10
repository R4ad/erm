from django import forms
from django.contrib import messages
from django.core.exceptions import PermissionDenied
from django.shortcuts import get_object_or_404, redirect
from django.template.response import TemplateResponse
from django.utils import timezone
from django.views.decorators.http import require_POST

from apps.core.forms import BootstrapFormMixin, JalaliDateField
from apps.risks.permissions import visible_risks

from .models import MonitoringNotice, RiskReview
from .monitoring import complete_review, record_trigger
from .permissions import can_edit_plans
from .services import PlanError


class TriggerForm(BootstrapFormMixin, forms.Form):
    trigger = forms.ChoiceField(
        label="محرک",
        choices=[
            (key, label)
            for key, label in RiskReview.Trigger.choices
            if key
            in {
                "incident",
                "control",
                "change",
                "dependency",
                "customer",
                "requirement",
            }
        ],
    )
    reason = forms.CharField(
        label="منبع، دامنه و دلیل", widget=forms.Textarea(attrs={"rows": 3})
    )
    due = JalaliDateField(label="مهلت بررسی پیش از تعهد یا تولید", required=False)
    control = forms.ModelChoiceField(
        label="کنترل کلیدی شکست‌خورده", queryset=None, required=False
    )

    def __init__(self, *args, risk, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["control"].queryset = risk.controls.filter(is_key=True)


class ResultForm(BootstrapFormMixin, forms.Form):
    result = forms.CharField(
        label="نتیجه و اقدام بعدی", widget=forms.Textarea(attrs={"rows": 4})
    )


def review_create(request, risk_pk):
    risk = get_object_or_404(visible_risks(request.user), pk=risk_pk)
    if not can_edit_plans(request.user):
        raise PermissionDenied
    form = TriggerForm(request.POST or None, risk=risk)
    if request.method == "POST" and form.is_valid():
        try:
            review = record_trigger(risk, request.user, **form.cleaned_data)
        except PlanError as error:
            form.add_error(None, error.problems)
        else:
            messages.success(
                request,
                "کار بازبینی ثبت شد. رخداد مهم هم‌زمان باید در مسیر پاسخ رخداد پیگیری شود.",
            )
            return redirect(review)
    return TemplateResponse(
        request,
        "form_page.html",
        {
            "form": form,
            "title": f"محرک بازبینی {risk.code}",
            "cancel_url": risk.get_absolute_url(),
        },
    )


def review_detail(request, pk):
    review = get_object_or_404(
        RiskReview.objects.filter(risk__in=visible_risks(request.user)), pk=pk
    )
    allowed = not review.completed_at and (
        can_edit_plans(request.user) or request.user.pk == review.responsible_id
    )
    form = ResultForm(request.POST or None)
    if request.method == "POST":
        if not allowed:
            raise PermissionDenied
        if form.is_valid():
            try:
                complete_review(review, request.user, form.cleaned_data["result"])
            except PlanError as error:
                form.add_error(None, error.problems)
            else:
                messages.success(request, "نتیجه بازبینی ثبت شد.")
                return redirect(review)
    return TemplateResponse(
        request,
        "actions/review_detail.html",
        {"review": review, "form": form, "can_complete": allowed},
    )


def notice_list(request):
    notices = MonitoringNotice.objects.filter(
        recipient=request.user, risk__in=visible_risks(request.user)
    )
    return TemplateResponse(request, "actions/notices.html", {"notices": notices[:100]})


@require_POST
def notice_read(request, pk):
    notice = get_object_or_404(
        MonitoringNotice,
        pk=pk,
        recipient=request.user,
        risk__in=visible_risks(request.user),
    )
    if notice.read_at is None:
        notice.read_at = timezone.now()
        notice._history_user = request.user
        notice.save()
        messages.success(request, "اعلان خوانده شد.")
    return redirect("actions:notices")
