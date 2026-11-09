"""اعلان‌های پایش و کار بازبینی ریسک (بخش ۲۱) در رابط React (actions/notices.html و actions/review_detail.html).

مثل pages.py، هر تابع context همان view جنگو را به JSON می‌دهد. «خواندم» و ثبت نتیجه‌ی بازبینی با همان view جنگو
فرستاده می‌شوند (bridge_pages.POST_ONLY_PAGES) و ثبت محرک بازبینی فرم همان view است (bridge_pages.FORM_PAGES).
"""

from django.urls import reverse

from . import formatting as fmt
from .forms import describe_field


def _risk(risk):
    return {"id": risk.pk, "code": risk.code, "title": risk.title, "href": risk.get_absolute_url()}


def notice_list(context, request):
    return {
        "title": "اعلان‌های پایش",
        "notices": [
            {
                "id": notice.pk,
                "risk": _risk(notice.risk),
                "message": notice.message,
                "href": notice.href,
                "created_at": fmt.moment(notice.created_at),
                "read": notice.read_at is not None,
                "read_url": reverse("actions:notice_read", args=[notice.pk]) if notice.read_at is None else None,
            }
            for notice in context["notices"]
        ],
    }


def review_detail(context, request):
    review = context["review"]
    complete = None
    if context["can_complete"]:
        complete = {"url": review.get_absolute_url(), "result": describe_field(context["form"]["result"])}
    return {
        "title": f"بازبینی {review.risk.code}",
        "review": {
            "id": review.pk,
            "trigger": fmt.choice(review, "trigger"),
            "risk": _risk(review.risk),
            "assessment": {"code": review.assessment.code, "href": review.assessment.get_absolute_url()}
            if review.assessment_id
            else None,
            "reason": review.reason,
            "due": fmt.deadline(review.due) if not review.completed_at else fmt.day(review.due),
            "responsible": fmt.person(review.responsible),
            "created_by": fmt.person(review.created_by),
            "created_at": fmt.moment(review.created_at),
            "completed_at": fmt.moment(review.completed_at),
            "completed_by": fmt.person(review.completed_by),
            "result": review.result,
        },
        "complete": complete,
    }


MONITORING_PAGES = {
    "actions:notices": notice_list,
    "actions:review_detail": review_detail,
}
