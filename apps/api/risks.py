from collections import Counter
from io import BytesIO

from django.core.paginator import Paginator
from django.db.models import Count, F, OuterRef, Q, Subquery
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.urls import reverse
from rest_framework import status
from rest_framework.response import Response

from apps.actions.context import risk_treatment
from apps.actions.models import TreatmentAction, TreatmentPlan
from apps.assessments.context import risk_assessments
from apps.assessments.models import Assessment
from apps.catalog.permissions import visible_services
from apps.controls.permissions import visible_controls
from apps.core.records import record_extras
from apps.methodology.models import RiskLevel
from apps.risks.forms import RiskFilterForm
from apps.risks.models import Risk
from apps.risks.permissions import (
    can_add_evidence,
    can_edit_register,
    visible_evidence,
    visible_risks,
)
from apps.workflow.context import risk_workflow
from apps.workflow.lifecycle import can_perform, get_transition
from apps.workflow.services import WorkflowError, perform_transition

from . import formatting as fmt
from . import risk_record
from .base import ApiView
from .records import record_parts
from .routes import spa_route

PAGE_SIZE = 25

# مرتب‌سازی‌های رجیستر. پیش‌فرض همان صفحه‌ی جنگوست: تازه‌ترین بالا. بی‌سطح‌ها در مرتب‌سازی سطح همیشه آخرند.
ORDERINGS = {
    "newest": ("-created_at", "-pk"),
    "oldest": ("created_at", "pk"),
    "code": ("code", "pk"),
    "-code": ("-code", "-pk"),
    "level": (F("level_rank").desc(nulls_last=True), "-created_at", "-pk"),
    "-level": (F("level_rank").asc(nulls_last=True), "-created_at", "-pk"),
}


def latest_current_assessment():
    """آخرین ارزیابی جاری تأییدشده‌ی هر ریسک؛ سطح تصمیم آن «سطح فعلی» ریسک است، همان که صفحه‌ی ریسک می‌گوید."""
    return Assessment.objects.filter(
        risk=OuterRef("pk"), kind=Assessment.Kind.CURRENT, status=Assessment.Status.APPROVED
    ).order_by("-approved_at", "-pk")


def current_levels(risks):
    """سطح فعلی هر ریسک: سطح تصمیم آخرین ارزیابی جاری تأییدشده، همان که صفحه‌ی ریسک «سطح فعلی» می‌داند."""
    latest = latest_current_assessment().values("decision_level")[:1]
    level_ids = dict(risks.annotate(level_id=Subquery(latest)).values_list("pk", "level_id"))
    levels = RiskLevel.objects.in_bulk({pk for pk in level_ids.values() if pk})
    return {risk_id: levels.get(level_id) for risk_id, level_id in level_ids.items()}


# نوار وضعیت بالای رجیستر فیگما، به ترتیب گردش کار. «ارسال‌شده» در فیگما جدا نیست و با «ثبت‌شده» شمرده می‌شود.
PIPELINE = [
    (Risk.Status.QUESTIONS, "در پاسخ به پرسش‌ها", "question"),
    (Risk.Status.REGISTERED, "ثبت‌شده در رجیستر", "list"),
    (Risk.Status.ASSESSMENT, "در ارزیابی", "gauge"),
    (Risk.Status.TREATMENT_PLAN, "برنامه‌ی درمان", "clipboard"),
    (Risk.Status.TREATMENT, "در اجرای درمان", "check-square"),
    (Risk.Status.REVIEW, "در بازبینی", "eye"),
    (Risk.Status.CLOSED, "بسته‌شده", "lock"),
    (Risk.Status.REJECTED, "ردشده", "x-circle"),
]

OPEN_ASSESSMENT = [Assessment.Status.DRAFT, Assessment.Status.IN_QC, Assessment.Status.REFERRED]


def fa(value):
    return str(value).translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def unowned(risk):
    return risk.owner_id is None or not risk.owner.is_active


def next_action(risk, draft, plan, overdue):
    """قدم بعدی هر ریسک در ستون «اقدام بعدی» فیگما، از وضعیت گردش کار و ارزیابی و طرح باز آن."""
    S = Risk.Status
    url = risk.get_absolute_url()
    if risk.status in Risk.CLOSED_STATUSES:
        return None
    if unowned(risk):
        return {"label": "بدون مالک فعال", "icon": "user", "tone": "danger", "href": url}
    if risk.needs_completion and risk.status in (S.REGISTERED, S.SUBMITTED, S.ASSESSMENT):
        return {"label": "تکمیل اطلاعات ریسک", "icon": "pencil", "tone": "warning", "href": url}
    if risk.status == S.QUESTIONS:
        return {"label": "منتظر پاسخ پرسش‌ها", "icon": "chat", "tone": "neutral", "href": url + "#workflow"}
    if risk.status in (S.REGISTERED, S.SUBMITTED):
        return {"label": "ارسال جهت ارزیابی", "icon": "flow", "tone": "neutral", "href": url + "#workflow"}
    if risk.status == S.ASSESSMENT:
        if draft is None:
            return {"label": "شروع ارزیابی جاری", "icon": "gauge", "tone": "brand", "href": url + "#assessments"}
        href = draft.get_absolute_url()
        if draft.status == Assessment.Status.REFERRED:
            return {"label": "تصمیم کارگروه", "icon": "clock", "tone": "danger", "href": href}
        if draft.status == Assessment.Status.IN_QC:
            return {"label": "ارزیابی در کنترل کیفیت", "icon": "gauge", "tone": "neutral", "href": href}
        if draft.impact_high is None:
            return {"label": "تکمیل پروفایل پیامد", "icon": "pencil", "tone": "warning", "href": href}
        if draft.likelihood_high is None:
            return {"label": "تکمیل احتمال A × B", "icon": "pencil", "tone": "warning", "href": href}
        return {"label": "ارسال برای کنترل کیفیت", "icon": "gauge", "tone": "neutral", "href": href}
    if risk.status == S.TREATMENT_PLAN:
        if plan is None:
            return {"label": "نوشتن طرح مواجهه", "icon": "clipboard", "tone": "danger", "href": url + "#treatment"}
        if not plan.is_owner_approved:
            return {"label": "تأیید طرح توسط مالک", "icon": "signature", "tone": "warning", "href": plan.get_absolute_url()}
        return {"label": "شروع اجرای طرح", "icon": "check-square", "tone": "brand", "href": plan.get_absolute_url()}
    if risk.status == S.TREATMENT:
        href = plan.get_absolute_url() if plan else url + "#treatment"
        if overdue:
            return {"label": f"{fa(overdue)} اقدام معوق", "icon": "warning", "tone": "danger", "href": href}
        return {"label": "پیگیری اقدام‌ها", "icon": "check-square", "tone": "neutral", "href": href}
    if risk.status == S.REVIEW:
        return {"label": "ارزیابی دوباره پس از اقدام", "icon": "gauge", "tone": "neutral", "href": url + "#assessments"}
    return None


def row_context(risks):
    """ارزیابی باز، آخرین طرح و شمار اقدام‌های معوق ریسک‌های یک صفحه، هر کدام با یک پرس‌وجو."""
    ids = [risk.pk for risk in risks]
    drafts = {}
    for assessment in Assessment.objects.filter(risk_id__in=ids, status__in=OPEN_ASSESSMENT).order_by("created_at"):
        drafts[assessment.risk_id] = assessment
    plans = {}
    for plan in TreatmentPlan.objects.filter(risk_id__in=ids).order_by("created_at", "pk"):
        plans[plan.risk_id] = plan
    overdue = Counter(
        TreatmentAction.objects.filter(plan__risk_id__in=ids, due_date__lt=timezone.localdate())
        .exclude(status=TreatmentAction.Status.VERIFIED)
        .values_list("plan__risk_id", flat=True)
    )
    scores = dict(
        Risk.objects.filter(pk__in=ids)
        .annotate(score=Subquery(latest_current_assessment().values("score_high")[:1]))
        .values_list("pk", "score")
    )
    return drafts, plans, overdue, scores


def risk_row(risk, level, context=None):
    drafts, plans, overdue, scores = context or ({}, {}, {}, {})
    action = next_action(risk, drafts.get(risk.pk), plans.get(risk.pk), overdue.get(risk.pk, 0))
    if action:
        action["route"] = spa_route(action["href"])
    return {
        "id": risk.pk,
        "code": risk.code,
        "title": risk.title,
        "status": fmt.choice(risk, "status"),
        "is_active": risk.is_active,
        "needs_completion": risk.needs_completion,
        "level": fmt.level(level),
        "score": scores.get(risk.pk),
        "category": {"code": risk.category.code, "name": risk.category.name},
        "service": {"code": risk.service.code, "name": risk.service.name} if risk.service_id else None,
        "scenario": (
            {"code": risk.scenario.code, "version": risk.scenario_version or 1} if risk.scenario_id else None
        ),
        "org_unit": risk.org_unit.name,
        "owner": None if unowned(risk) else fmt.person(risk.owner),
        "channel": fmt.choice(risk, "channel"),
        "created_at": fmt.day(risk.created_at),
        "next_action": action,
    }


def filtered_risks(request):
    """ریسک‌های رجیستر با فیلترهای درخواست. بدون فیلتر وضعیت فقط ریسک‌های فعال می‌آیند (زبانه‌ی «همه»‌ی فیگما)؛
    بسته‌شده و ردشده از نوار وضعیت باز می‌شوند. ریسک هرگز حذف نمی‌شود."""
    user = request.user
    form = RiskFilterForm(request.query_params, user=user)
    if not form.is_valid():
        return form, None
    risks = form.filter(
        visible_risks(user).select_related("service", "category", "org_unit", "owner", "scenario")
    )
    if not form.cleaned_data["status"]:
        risks = risks.exclude(status__in=Risk.CLOSED_STATUSES)
    ids = request.query_params.getlist("ids")
    if ids:
        risks = risks.filter(pk__in=[int(pk) for pk in ids if pk.isdigit()])
    return form, risks


def register_counts(user):
    """شمار نوار وضعیت و زبانه‌های رجیستر، روی همه‌ی ریسک‌هایی که کاربر می‌بیند و بدون فیلترهای دیگر."""
    visible = visible_risks(user)
    by_status = dict(visible.values_list("status").annotate(total=Count("pk")))
    by_status[Risk.Status.REGISTERED] = by_status.get(Risk.Status.REGISTERED, 0) + by_status.get(
        Risk.Status.SUBMITTED, 0
    )
    active = visible.exclude(status__in=Risk.CLOSED_STATUSES)
    return {
        "pipeline": [
            {"status": status, "label": label, "icon": icon, "count": by_status.get(status, 0)}
            for status, label, icon in PIPELINE
        ],
        "tabs": {
            "all": active.count(),
            "mine": active.filter(owner=user).count(),
            "assessment": by_status.get(Risk.Status.ASSESSMENT, 0),
            "treatment_plan": by_status.get(Risk.Status.TREATMENT_PLAN, 0),
            "incomplete": active.filter(needs_completion=True).count(),
            "unowned": active.filter(Q(owner__isnull=True) | Q(owner__is_active=False)).count(),
        },
        "active": active.count(),
        "closed": visible.filter(status__in=Risk.CLOSED_STATUSES).count(),
    }


class RiskListView(ApiView):
    """رجیستر ریسک فیگما با همان فیلترها و همان قاعده‌ی دیدن صفحه‌ی جنگو."""

    def get(self, request):
        user = request.user
        form, risks = filtered_risks(request)
        if risks is None:
            return Response({"errors": fmt.form_errors(form)}, status=status.HTTP_400_BAD_REQUEST)
        ordering = request.query_params.get("ordering", "newest")
        if ordering not in ORDERINGS:
            ordering = "newest"
        if ordering.endswith("level"):
            risks = risks.annotate(level_rank=Subquery(latest_current_assessment().values("decision_level__rank")[:1]))
        risks = risks.order_by(*ORDERINGS[ordering])
        page = Paginator(risks, PAGE_SIZE).get_page(request.query_params.get("page"))
        page_risks = list(page.object_list)
        levels = current_levels(visible_risks(user).filter(pk__in=[risk.pk for risk in page_risks]))
        context = row_context(page_risks)
        return Response(
            {
                "count": page.paginator.count,
                "page": page.number,
                "pages": page.paginator.num_pages,
                "page_size": PAGE_SIZE,
                "ordering": ordering,
                "results": [risk_row(risk, levels.get(risk.pk), context) for risk in page_risks],
                **register_counts(user),
                "can_create": can_edit_register(user),
                "can_send_to_assessment": can_perform_transition(user, "send_to_assessment"),
                "create_url": reverse("risks:scenario_list"),
            }
        )


def can_perform_transition(user, name):
    return can_perform(user, get_transition(name))


class RiskFiltersView(ApiView):
    """گزینه‌های فیلترهای رجیستر: خدمت‌ها فقط آن‌هایی که کاربر می‌بیند، و واحدها به شکل درخت."""

    def get(self, request):
        form = RiskFilterForm(user=request.user)
        names = ["status", "level", "category", "service", "owner", "unit", "tag", "channel", "needs_completion"]
        return Response(
            {name: {"label": str(form.fields[name].label), "choices": fmt.field_choices(form, name)} for name in names}
        )


class RiskExportView(ApiView):
    """«خروجی Excel» و «خروجی انتخاب‌شده‌ها»ی رجیستر: همه‌ی ریسک‌های فیلترشده یا فقط ids، بدون صفحه‌بندی."""

    def get(self, request):
        from openpyxl import Workbook
        from openpyxl.styles import Font

        form, risks = filtered_risks(request)
        if risks is None:
            return Response({"errors": fmt.form_errors(form)}, status=status.HTTP_400_BAD_REQUEST)
        risks = list(risks.order_by("code"))
        levels = current_levels(visible_risks(request.user).filter(pk__in=[risk.pk for risk in risks]))
        context = row_context(risks)
        book = Workbook()
        sheet = book.active
        sheet.title = "رجیستر ریسک"
        sheet.sheet_view.rightToLeft = True
        sheet.append(["کد", "عنوان", "خدمت", "دسته", "مالک", "واحد", "وضعیت", "سطح تصمیم", "امتیاز", "اقدام بعدی"])
        for cell in sheet[1]:
            cell.font = Font(bold=True)
        for risk in risks:
            row = risk_row(risk, levels.get(risk.pk), context)
            sheet.append([
                row["code"],
                row["title"],
                row["service"]["name"] if row["service"] else "",
                row["category"]["code"],
                row["owner"]["name"] if row["owner"] else "بدون مالک",
                row["org_unit"],
                row["status"]["label"],
                row["level"]["name"] if row["level"] else "ارزیابی‌نشده",
                row["score"],
                row["next_action"]["label"] if row["next_action"] else "",
            ])
        buffer = BytesIO()
        book.save(buffer)
        response = HttpResponse(
            buffer.getvalue(), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response["Content-Disposition"] = 'attachment; filename="risk-register.xlsx"'
        return response


class RiskBulkTransitionView(ApiView):
    """«ارسال جهت ارزیابی» و «ارسال به تصمیم» گروهی: همان انتقال گردش کار برای هر ریسک انتخاب‌شده، با همان چک نقش و شرط‌ها. هر ریسکی که
    شرطش برقرار نیست با دلیلش برمی‌گردد و بقیه انجام می‌شوند."""

    # «ارسال جهت ارزیابی» رجیستر (فیگما ۰۳) و «ارسال به تصمیم» سنجش ریسک (فیگما ۱۳).
    ALLOWED = {"send_to_assessment", "approve"}

    def post(self, request):
        name = request.data.get("transition")
        transition = get_transition(name) if name in self.ALLOWED else None
        if transition is None:
            return Response({"errors": {"transition": ["این انتقال گروهی انجام نمی‌شود."]}}, status=400)
        ids = [int(pk) for pk in request.data.get("ids", []) if str(pk).isdigit()]
        done, failed = [], []
        for risk in visible_risks(request.user).filter(pk__in=ids).order_by("code"):
            if risk.status != transition.source:
                failed.append({"code": risk.code, "problems": [f"وضعیت «{risk.get_status_display()}» است."]})
                continue
            try:
                perform_transition(risk, transition, request.user, reason=request.data.get("reason", ""))
            except WorkflowError as error:
                failed.append({"code": risk.code, "problems": error.problems})
            else:
                done.append(risk.code)
        return Response({"done": done, "failed": failed})


def transition_link(risk, transition, problems=()):
    return {
        "name": transition.name,
        "label": transition.label,
        "description": transition.description,
        "target": transition.target_label,
        "href": reverse("workflow:transition", args=[risk.pk, transition.name]),
        # شرط‌های برقرارنشده؛ دکمه‌ی انتقال تا رفع آن‌ها با دلیلش غیرفعال است (فیگما ۰۴).
        "problems": list(problems),
    }


def related_risk(risk, visible):
    if risk is None:
        return None
    return {"code": risk.code, "href": risk.get_absolute_url() if visible else None}


def assessment_row(assessment, control_codes=(), decision_id=None):
    return {
        "id": assessment.pk,
        "code": assessment.code,
        "kind": fmt.choice(assessment, "kind"),
        "status": fmt.choice(assessment, "status"),
        "level": fmt.level(assessment.decision_level),
        "score": [assessment.score_low, assessment.score_high] if assessment.score_low else None,
        "meeting_date": fmt.day(assessment.meeting_date),
        "approved_at": fmt.moment(assessment.approved_at),
        "detail": risk_record.assessment_detail(assessment, list(control_codes), assessment.pk == decision_id),
        "href": assessment.get_absolute_url(),
    }


class RiskDetailView(ApiView):
    """پرونده‌ی یک ریسک. بخش‌ها از همان context صفحه‌ی ریسک جنگو ساخته می‌شوند؛ کارهایی که هنوز در React نیستند
    پیوند به صفحه‌ی جنگوی همان کارند."""

    def get(self, request, pk):
        user = request.user
        risk = get_object_or_404(
            visible_risks(user).select_related("scenario", "service", "category", "org_unit", "owner"), pk=pk
        )
        workflow = risk_workflow(risk, user)
        assessments = risk_assessments(risk, user)
        treatment = risk_treatment(risk, user)
        extras = record_extras(risk, user)
        current = assessments["current_assessment"]
        service_visible = risk.service_id and visible_services(user).filter(pk=risk.service_id).exists()
        visible_control_ids = set(visible_controls(user).filter(risks=risk).values_list("pk", flat=True))
        plan = treatment["current_plan"]
        timeline = list(workflow["timeline"].order_by("created_at", "pk"))
        controls = risk_record.control_rows(risk, visible_control_ids)
        control_codes = [control["code"] for control in controls]
        problems = {
            row["name"]: row["problems"]
            for row in risk_record.transitions(risk, user, workflow["transitions"])
        }
        # ریسک ردشده یا بسته‌شده فقط سابقه است و ویرایش نمی‌شود، مثل صفحه‌ی جنگو.
        can_edit = risk.is_active and can_edit_register(user)
        return Response(
            {
                "id": risk.pk,
                "code": risk.code,
                "title": risk.title,
                "description": risk.description,
                "status": fmt.choice(risk, "status"),
                "is_active": risk.is_active,
                "needs_completion": risk.needs_completion,
                "level": fmt.level(current.decision_level if current else None),
                "score": [current.score_low, current.score_high] if current and current.score_low else None,
                "created_at": fmt.day(risk.created_at),
                "updated_at": fmt.moment(risk.updated_at),
                "channel": fmt.choice(risk, "channel"),
                "scenario": (
                    {
                        "code": risk.scenario.code,
                        "title": risk.scenario.title,
                        "version": risk.scenario_version,
                        "changed": risk.scenario_changed,
                        "href": risk.scenario.get_absolute_url(),
                    }
                    if risk.scenario_id
                    else None
                ),
                "service": (
                    {
                        "code": risk.service.code,
                        "name": risk.service.name,
                        "href": risk.service.get_absolute_url() if service_visible else None,
                    }
                    if risk.service_id
                    else None
                ),
                "org_unit": risk.org_unit.name,
                "owner": fmt.person(risk.owner),
                "category": {"code": risk.category.code, "name": risk.category.name},
                "customers": [customer.name for customer in risk.customers.all()],
                "tags": [tag.name for tag in risk.tags.all()],
                "scope": risk.scope,
                "initiator": risk.initiator,
                "realization_path": risk.realization_path,
                "additional_notes": risk.additional_notes,
                "scenario_snapshot": risk.scenario_snapshot,
                "count_unit": risk.count_unit,
                "count_exclusions": risk.count_exclusions,
                "data_class": fmt.choice(risk, "data_class"),
                "cia": risk.cia_labels,
                "links": [
                    {
                        "kind": link.get_kind_display(),
                        "ref": link.ref,
                        "url": link.url,
                        "edit_url": reverse("risks:link_update", args=[link.pk]) if can_edit else None,
                    }
                    for link in risk.links.all()
                ],
                "evidence": [
                    {
                        "code": item.code,
                        "title": item.title,
                        "kind": item.get_kind_display(),
                        "reliability": item.get_reliability_display(),
                        "observed_on": fmt.day(item.observed_on),
                        "valid_until": fmt.day(item.valid_until),
                        "expired": item.is_expired,
                        "confidential": item.access_class == item.AccessClass.CONFIDENTIAL,
                        "href": item.get_absolute_url(),
                    }
                    for item in visible_evidence(user).filter(risks=risk)
                ],
                "key_evidence_age": risk_record.key_evidence_age(),
                "controls": controls,
                "stepper": risk_record.stepper(risk, timeline),
                "banner": risk_record.banner(
                    risk, reverse("actions:plan_create", args=[risk.pk]) if treatment["can_add_plan"] else None
                ),
                "latest": risk_record.latest_result(current),
                "timeline": risk_record.timeline_rows(risk, timeline),
                "workflow": {
                    "transitions": [
                        transition_link(risk, transition, problems.get(transition.name, ()))
                        for transition in workflow["transitions"]
                    ],
                    "questions": [
                        {
                            "text": question.text,
                            "due": fmt.deadline(question.due) if question.is_open else fmt.day(question.due),
                            "answer": question.answer,
                            "asked_by": fmt.person(question.asked_by),
                            "answered_by": fmt.person(question.answered_by),
                            "is_open": question.is_open,
                        }
                        for question in workflow["risk_questions"]
                    ],
                    "pending_change": (
                        {
                            "label": str(workflow["pending_change"]),
                            "merge_into": workflow["pending_change"].merge_into.code
                            if workflow["pending_change"].merge_into_id
                            else None,
                            "can_decide": workflow["can_decide_change"],
                            "href": workflow["pending_change"].get_absolute_url(),
                        }
                        if workflow["pending_change"]
                        else None
                    ),
                    # ادغام و تفکیک: کد همیشه دیده می‌شود و پیوند فقط برای ریسکی که کاربر می‌بیند.
                    "merged_into": related_risk(risk.merged_into, workflow["merged_into_visible"]),
                    "split_from": related_risk(risk.split_from, workflow["split_from_visible"]),
                    "merged_risks": [related_risk(item, True) for item in workflow["merged_risks"]],
                    "split_parts": [related_risk(item, True) for item in workflow["split_parts"]],
                },
                "assessments": [
                    assessment_row(item, control_codes, current.pk if current else None)
                    for item in assessments["assessments"].order_by(
                        F("approved_at").desc(nulls_first=True), "-created_at", "-pk"
                    )
                ],
                "treatment": {
                    "current_plan": (
                        {
                            "label": str(plan),
                            "option": plan.get_option_display(),
                            "owner_approved": plan.is_owner_approved,
                            "actions": [
                                {
                                    "code": action.code,
                                    "title": action.title,
                                    "status": action.get_status_display(),
                                    "due": fmt.deadline(action.due_date)
                                    if action.is_open
                                    else fmt.day(action.due_date),
                                    "href": action.get_absolute_url(),
                                }
                                for action in plan.actions.all()
                            ],
                            "href": plan.get_absolute_url(),
                        }
                        if plan
                        else None
                    ),
                    "plan_due": fmt.deadline(treatment["plan_due"]),
                    "acceptances": [
                        {
                            "code": acceptance.code,
                            "status": acceptance.state_label,
                            "level": fmt.level(acceptance.assessment.decision_level),
                            "start": fmt.day(acceptance.start_date),
                            "end": fmt.day(acceptance.end_date),
                            "href": acceptance.get_absolute_url(),
                        }
                        for acceptance in treatment["acceptances"]
                    ],
                },
                **record_parts(risk, user, extras),
                "actions": {
                    "add_review": reverse("actions:review_create", args=[risk.pk]) if can_edit else None,
                    "classic": risk.get_absolute_url(),
                    "edit": reverse("risks:risk_update", args=[risk.pk]) if can_edit else None,
                    "add_link": reverse("risks:link_create", args=[risk.pk]) if can_edit else None,
                    "propose_merge": reverse("workflow:change_request_create", args=[risk.pk, "merge"])
                    if workflow["can_propose_change"]
                    else None,
                    "propose_split": reverse("workflow:change_request_create", args=[risk.pk, "split"])
                    if workflow["can_propose_change"]
                    else None,
                    "add_evidence": reverse("risks:evidence_create") + f"?risk={risk.pk}"
                    if can_add_evidence(user, risk)
                    else None,
                    "add_assessment": reverse("assessments:assessment_create", args=[risk.pk])
                    if assessments["can_add_assessment"]
                    else None,
                    "add_plan": reverse("actions:plan_create", args=[risk.pk]) if treatment["can_add_plan"] else None,
                },
            }
        )


class CoverageExportView(ApiView):
    """«خروجی Excel» جهان ریسک (فیگما ۰۹): همه‌ی خدمت‌های فیلترشده، بی‌صفحه‌بندی، با وضعیت هر دسته و پوشش خدمت."""

    def get(self, request):
        from openpyxl import Workbook
        from openpyxl.styles import Font

        from apps.risks.forms import CoverageFilterForm
        from apps.risks.services import active_categories, coverage_rows

        form = CoverageFilterForm(request.query_params)
        if not form.is_valid():
            return Response({"errors": fmt.form_errors(form)}, status=status.HTTP_400_BAD_REQUEST)
        categories = active_categories()
        services = form.filter(visible_services(request.user).filter(is_active=True).select_related("org_unit"))
        rows = coverage_rows(services.order_by("code"), categories, visible_risks(request.user))
        book = Workbook()
        sheet = book.active
        sheet.title = "جهان ریسک"
        sheet.sheet_view.rightToLeft = True
        sheet.append(
            ["کد خدمت", "خدمت یا فرایند", "واحد", "حیاتی"]
            + [f"{category.code} {category.name}" for category in categories]
            + ["پوشش"]
        )
        for cell in sheet[1]:
            cell.font = Font(bold=True)
        for service, cells in rows:
            labels = []
            for cell in cells:
                label = cell.get_status_display()
                if cell.status == cell.Status.REVIEWED:
                    label += f" · {cell.risk_count} ریسک" if cell.risk_count else " · بدون ریسک"
                elif cell.reason:
                    label += f": {cell.reason}"
                labels.append(label)
            done = sum(1 for cell in cells if not cell.is_pending)
            sheet.append(
                [service.code, service.name, str(service.org_unit), "بله" if service.is_critical else "خیر"]
                + labels
                + [f"{done} از {len(cells)}"]
            )
        buffer = BytesIO()
        book.save(buffer)
        response = HttpResponse(
            buffer.getvalue(), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response["Content-Disposition"] = 'attachment; filename="risk-universe.xlsx"'
        return response
