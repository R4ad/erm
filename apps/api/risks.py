from django.core.paginator import Paginator
from django.db.models import F, OuterRef, Subquery
from django.shortcuts import get_object_or_404
from django.urls import reverse
from rest_framework import status
from rest_framework.response import Response

from apps.actions.context import risk_treatment
from apps.assessments.context import risk_assessments
from apps.assessments.models import Assessment
from apps.catalog.permissions import visible_services
from apps.controls.permissions import visible_controls
from apps.core.records import record_extras
from apps.methodology.models import RiskLevel
from apps.risks.forms import RiskFilterForm
from apps.risks.permissions import can_add_evidence, can_edit_register, visible_evidence, visible_risks
from apps.workflow.context import risk_workflow

from . import formatting as fmt
from .base import ApiView
from .records import record_parts

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


def risk_row(risk, level):
    return {
        "id": risk.pk,
        "code": risk.code,
        "title": risk.title,
        "status": fmt.choice(risk, "status"),
        "is_active": risk.is_active,
        "needs_completion": risk.needs_completion,
        "level": fmt.level(level),
        "category": {"code": risk.category.code, "name": risk.category.name},
        "service": {"code": risk.service.code, "name": risk.service.name} if risk.service_id else None,
        "org_unit": risk.org_unit.name,
        "owner": fmt.person(risk.owner),
        "channel": fmt.choice(risk, "channel"),
        "created_at": fmt.day(risk.created_at),
    }


class RiskListView(ApiView):
    """رجیستر ریسک با همان فیلترها و همان قاعده‌ی دیدن صفحه‌ی جنگو."""

    def get(self, request):
        user = request.user
        form = RiskFilterForm(request.query_params, user=user)
        if not form.is_valid():
            return Response({"errors": fmt.form_errors(form)}, status=status.HTTP_400_BAD_REQUEST)
        ordering = request.query_params.get("ordering", "newest")
        if ordering not in ORDERINGS:
            ordering = "newest"
        risks = form.filter(visible_risks(user).select_related("service", "category", "org_unit", "owner"))
        if ordering.endswith("level"):
            risks = risks.annotate(level_rank=Subquery(latest_current_assessment().values("decision_level__rank")[:1]))
        risks = risks.order_by(*ORDERINGS[ordering])
        page = Paginator(risks, PAGE_SIZE).get_page(request.query_params.get("page"))
        page_risks = list(page.object_list)
        levels = current_levels(visible_risks(user).filter(pk__in=[risk.pk for risk in page_risks]))
        return Response(
            {
                "count": page.paginator.count,
                "page": page.number,
                "pages": page.paginator.num_pages,
                "ordering": ordering,
                "results": [risk_row(risk, levels.get(risk.pk)) for risk in page_risks],
                "can_create": can_edit_register(user),
                "create_url": reverse("risks:risk_create"),
            }
        )


class RiskFiltersView(ApiView):
    """گزینه‌های فیلترهای رجیستر: خدمت‌ها فقط آن‌هایی که کاربر می‌بیند، و واحدها به شکل درخت."""

    def get(self, request):
        form = RiskFilterForm(user=request.user)
        names = ["status", "category", "service", "unit", "tag", "channel", "needs_completion"]
        return Response(
            {name: {"label": str(form.fields[name].label), "choices": fmt.field_choices(form, name)} for name in names}
        )


def transition_link(risk, transition):
    return {
        "name": transition.name,
        "label": transition.label,
        "description": transition.description,
        "target": transition.target_label,
        "href": reverse("workflow:transition", args=[risk.pk, transition.name]),
    }


def related_risk(risk, visible):
    if risk is None:
        return None
    return {"code": risk.code, "href": risk.get_absolute_url() if visible else None}


def assessment_row(assessment):
    return {
        "id": assessment.pk,
        "code": assessment.code,
        "kind": fmt.choice(assessment, "kind"),
        "status": fmt.choice(assessment, "status"),
        "level": fmt.level(assessment.decision_level),
        "score": [assessment.score_low, assessment.score_high] if assessment.score_low else None,
        "meeting_date": fmt.day(assessment.meeting_date),
        "approved_at": fmt.moment(assessment.approved_at),
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
                        "expired": item.is_expired,
                        "confidential": item.access_class == item.AccessClass.CONFIDENTIAL,
                        "href": item.get_absolute_url(),
                    }
                    for item in visible_evidence(user).filter(risks=risk)
                ],
                "controls": [
                    {
                        "code": control.code,
                        "title": control.title,
                        "href": control.get_absolute_url() if control.pk in visible_control_ids else None,
                    }
                    for control in risk.controls.all()
                ],
                "workflow": {
                    "transitions": [transition_link(risk, transition) for transition in workflow["transitions"]],
                    "timeline": [
                        {
                            "from": entry.get_from_status_display(),
                            "to": entry.get_to_status_display(),
                            "reason": entry.reason,
                            "meeting_date": fmt.day(entry.meeting_date),
                            "by": fmt.person(entry.created_by),
                            "at": fmt.moment(entry.created_at),
                        }
                        for entry in workflow["timeline"]
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
                "assessments": [assessment_row(item) for item in assessments["assessments"]],
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
