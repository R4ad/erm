"""فهرست ارزیابی‌ها و صف ریسک‌های ارسالی."""

from django.core.paginator import Paginator
from django.shortcuts import get_object_or_404
from django.urls import reverse
from rest_framework import status
from rest_framework.response import Response

from apps.assessments.permissions import (
    can_start_submitted_assessment,
    visible_assessments,
)
from apps.assessments.results import outcome
from apps.assessments.services import AssessmentError, band_list
from apps.assessments.workspace import start_submitted_assessment
from apps.risks.models import Risk
from apps.risks.permissions import visible_risks

from . import formatting as fmt
from .base import ApiView


def assessment_row(item):
    result = outcome(item)
    return {
        "id": item.pk,
        "code": item.code,
        "risk": {"id": item.risk_id, "code": item.risk.code, "title": item.risk.title},
        "service": item.risk.service.name if item.risk.service_id else "",
        "kind": fmt.choice(item, "kind"),
        "status": fmt.choice(item, "status"),
        "likelihood": band_list(result.likelihood),
        "impact": band_list(result.impact),
        "score": band_list(result.score),
        "level": fmt.level(result.decision_level),
        "provisional": not item.is_approved,
        "incomplete": bool(result.incomplete_reasons or result.problems),
        "href": item.get_absolute_url(),
        "created_at": fmt.day(item.created_at),
    }


class AssessmentListView(ApiView):
    def get(self, request):
        assessments = (
            visible_assessments(request.user)
            .select_related(
                "risk",
                "risk__service",
                "method_version",
                "decision_level",
                "base_level",
            )
            .order_by("-created_at", "-pk")
        )
        page = Paginator(assessments, 25).get_page(request.query_params.get("page"))
        return Response(
            {
                "results": [assessment_row(item) for item in page],
                "count": page.paginator.count,
                "page": page.number,
                "pages": page.paginator.num_pages,
                "can_start": can_start_submitted_assessment(request.user),
            }
        )


class AssessmentCandidatesView(ApiView):
    def get(self, request):
        if not can_start_submitted_assessment(request.user):
            from django.core.exceptions import PermissionDenied

            raise PermissionDenied
        risks = (
            visible_risks(request.user)
            .filter(status=Risk.Status.SUBMITTED)
            .select_related("service", "org_unit", "category", "owner")
            .order_by("-created_at", "-pk")
        )
        page = Paginator(risks, 25).get_page(request.query_params.get("page"))
        return Response(
            {
                "results": [
                    {
                        "id": risk.pk,
                        "code": risk.code,
                        "title": risk.title,
                        "service": risk.service.name if risk.service_id else "",
                        "unit": risk.org_unit.name,
                        "category": risk.category.name,
                        "owner": fmt.person(risk.owner),
                        "status": fmt.choice(risk, "status"),
                    }
                    for risk in page
                ],
                "count": page.paginator.count,
                "page": page.number,
                "pages": page.paginator.num_pages,
            }
        )


class StartAssessmentView(ApiView):
    def post(self, request, pk):
        risk = get_object_or_404(visible_risks(request.user), pk=pk)
        try:
            assessment = start_submitted_assessment(risk, request.user)
        except AssessmentError as error:
            return Response(
                {"message": " ".join(error.problems)}, status=status.HTTP_409_CONFLICT
            )
        return Response(
            {
                "id": assessment.pk,
                "href": reverse("assessments:assessment_detail", args=[assessment.pk]),
            }
        )
