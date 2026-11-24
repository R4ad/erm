"""«بررسی پاسخنامه‌ها» در رابط React (فریم 11a): صف «در انتظار بررسی» برای کارشناس ریسک، قدیمی‌ترین ارسال اول، و جدول
همه‌ی پاسخنامه‌هایی که کاربر می‌بیند با جستجو، فیلتر واحد، تب وضعیت و صفحه‌بندی. پاسخ‌دهنده و مدیر واحد همین جدول را
بدون صف می‌بینند. صف و جدول در یک پاسخ می‌آیند تا صفحه با یک درخواست کامل شود."""

from django.core.paginator import Paginator
from django.db.models import Count, Prefetch, Q
from django.utils import timezone
from rest_framework.response import Response as ApiResponse

from apps.core.jalali import jalali_year, jalali_year_range
from apps.organization.models import OrgUnit
from apps.questionnaires.answers import stored_summary
from apps.questionnaires.models import PendingRisk, Response
from apps.questionnaires.permissions import can_manage_questionnaires, visible_responses

from . import formatting as fmt
from .base import ApiView
from .questionnaire_answers import response_route, response_status, with_answers

PAGE_SIZE = 8
QUEUE_SIZE = 4
SEARCH_LIMIT = 100
S = Response.Status
TABS = [S.SUBMITTED, S.RETURNED, S.IDENTIFIED, S.REVIEWED, S.DRAFT]


def review_route(response):
    return f"/identification/responses/{response.pk}"


def submitted_day(response):
    return fmt.day(timezone.localdate(response.submitted_at)) if response.submitted_at else None


def queue_card(response):
    service, counts = stored_summary(response)
    return {
        "id": response.pk,
        "code": response.code,
        "service": service,
        "summary": counts,
        "org_unit": response.org_unit.name,
        "respondent": fmt.person(response.respondent),
        "submitted_at": submitted_day(response),
        "review_due": fmt.deadline(response.review_due),
        "route": review_route(response),
    }


def review_queue(user):
    """پاسخنامه‌های در انتظار بررسی، قدیمی‌ترین ارسال اول؛ شمار کل و شمار گذشته از مهلت هم می‌آید."""
    waiting = visible_responses(user).filter(status=S.SUBMITTED)
    first = with_answers(waiting).order_by("submitted_at", "pk")[:QUEUE_SIZE]
    counts = waiting.aggregate(
        count=Count("pk"), overdue=Count("pk", filter=Q(review_due__lt=timezone.localdate()))
    )
    return {**counts, "cards": [queue_card(response) for response in first]}


def return_note(response):
    """خلاصه‌ی ردیف بازگشتی: اولین پرسش تکمیلی، یا پیام کارشناس اگر پرسشی نیست."""
    for question in response.return_questions or []:
        if isinstance(question, dict) and question.get("text"):
            return question["text"]
    return response.return_message


def table_row(response, user, can_review):
    service, counts = stored_summary(response)
    pending = list(response.pending_risks.all())
    if response.status == S.SUBMITTED and can_review:
        action = "review"
    elif response.status != S.DRAFT or response.respondent_id == user.pk:
        action = "view"
    else:
        action = None
    return {
        "id": response.pk,
        "code": response.code,
        "service": service,
        "summary": counts,
        "step": response.wizard_step,
        "org_unit": response.org_unit.name,
        "status": response_status(response),
        "respondent": fmt.person(response.respondent),
        "updated_at": fmt.moment(response.updated_at),
        "review_due": fmt.deadline(response.review_due) if response.status == S.SUBMITTED else None,
        "return_note": return_note(response) if response.status == S.RETURNED else "",
        "risks": [item.risk.code for item in pending if item.risk_id],
        "all_dismissed": bool(pending) and all(item.status == PendingRisk.Status.DISMISSED for item in pending),
        "route": response_route(response, user),
        "action": action,
    }


def search(responses, text):
    """جستجو در کد، خدمت و نام یا نام کاربری پاسخ‌دهنده."""
    text = text.strip()[:SEARCH_LIMIT]
    if not text:
        return responses
    return responses.filter(
        Q(code__icontains=text)
        | Q(service_records__name_and_scope__icontains=text)
        | Q(respondent__first_name__icontains=text)
        | Q(respondent__last_name__icontains=text)
        | Q(respondent__username__icontains=text)
    ).distinct()


class QuestionnaireResponsesView(ApiView):
    """GET صف و یک صفحه از جدول. پارامترها: status (یکی از تب‌ها)، unit، q و page. شمار تب‌ها با جستجو و واحد
    فیلتر می‌شود و شمار زیرعنوان پاسخنامه‌های سال ارزیابی جاری است."""

    def get(self, request):
        user = request.user
        params = request.query_params
        can_review = can_manage_questionnaires(user)
        visible = visible_responses(user)
        year = jalali_year(timezone.localdate())
        start, end = jalali_year_range(year)

        filtered = visible
        unit = params.get("unit", "")
        if unit.isdigit():
            filtered = filtered.filter(org_unit_id=int(unit))
        filtered = search(filtered, params.get("q", ""))
        counts = Response.objects.filter(pk__in=filtered.values("pk")).aggregate(
            all=Count("pk"), **{tab: Count("pk", filter=Q(status=tab)) for tab in TABS}
        )
        status = params.get("status", "")
        if status in TABS:
            filtered = filtered.filter(status=status)

        rows = with_answers(Response.objects.filter(pk__in=filtered.values("pk"))).prefetch_related(
            Prefetch("pending_risks", queryset=PendingRisk.objects.select_related("risk"))
        )
        page = Paginator(rows.order_by("-updated_at", "-pk"), PAGE_SIZE).get_page(params.get("page"))
        units = OrgUnit.objects.filter(pk__in=visible.values("org_unit")).order_by("name")
        return ApiResponse(
            {
                "can_review": can_review,
                "queue": review_queue(user) if can_review else None,
                "year": year,
                "year_total": visible.filter(created_at__date__gte=start, created_at__date__lt=end).count(),
                "counts": counts,
                "units": [{"value": str(item.pk), "label": item.name} for item in units],
                "rows": [table_row(response, user, can_review) for response in page.object_list],
                "page": {
                    "number": page.number,
                    "pages": page.paginator.num_pages,
                    "size": PAGE_SIZE,
                    "count": page.paginator.count,
                    "start": page.start_index(),
                    "end": page.end_index(),
                },
            }
        )
