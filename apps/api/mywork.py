from django.urls import reverse
from rest_framework.response import Response

from apps.actions.mywork import my_work

from . import formatting as fmt
from .base import ApiView
from .routes import spa_route


def risk_ref(risk):
    return {"id": risk.pk, "code": risk.code, "title": risk.title}


def item(key, label, href, risk=None, level=None, due=None, status=None, meta=None, route=None):
    """یک ردیف «کارهای من»؛ همه‌ی بخش‌ها یک شکل دارند تا رابط React یک جور نشانشان دهد. route مسیر همان کار در
    رابط React است و اگر داده نشود از جدول routes.py ساخته می‌شود."""
    return {
        "key": key,
        "label": label,
        "href": href,
        "route": route or spa_route(href),
        "risk": risk_ref(risk) if risk else None,
        "level": fmt.level(level),
        "due": fmt.deadline(due),
        "status": status,
        "meta": meta,
    }


def action_item(action):
    owner, assignee = fmt.person(action.owner)["name"], fmt.person(action.assignee)["name"]
    meta = f"مالک {owner}" if owner == assignee else f"مالک {owner}، مجری {assignee}"
    return item(
        f"action-{action.pk}",
        f"{action.code} {action.title}",
        action.get_absolute_url(),
        risk=action.plan.risk,
        due=action.due_date if action.is_open else None,
        status=action.get_status_display(),
        meta=meta,
    )


def acceptance_item(acceptance):
    return item(
        f"acceptance-{acceptance.pk}",
        f"پذیرش {acceptance.code}",
        acceptance.get_absolute_url(),
        risk=acceptance.risk,
        level=acceptance.assessment.decision_level,
        due=acceptance.end_date,
        status=acceptance.state_label,
    )


def sections(user):
    """بخش‌های «کارهای من» به همان ترتیب صفحه‌ی جنگو؛ بخشی که خالی است نمی‌آید."""
    work = my_work(user)
    rows = [
        (
            "monitoring_reviews", "بازبینی‌های ریسک", "بررسی شواهد، کنترل و دامنه و ثبت اقدام بعدی.",
            [item(f"monitor-review-{row.pk}", row.get_trigger_display(), row.get_absolute_url(),
                  risk=row.risk, due=row.due) for row in work["monitoring_reviews"]],
        ),
        (
            "monitoring_notices", "اعلان‌های پایش", "یادآوری سررسید و تصعید به مقام مجاز.",
            [item(f"notice-{row.pk}", row.message, reverse("actions:notices"), risk=row.risk)
             for row in work["monitoring_notices"]],
        ),
        (
            "my_actions",
            "اقدام‌های من",
            "اقدام‌هایی که مالک یا مجری آن‌ها هستید و هنوز تأیید نهایی نگرفته‌اند.",
            [action_item(action) for action in work["my_actions"]],
        ),
        (
            "to_verify",
            "منتظر تأیید نتیجه‌ی شما",
            "مجری کار را آماده‌ی آزمون اعلام کرده است؛ نتیجه را با معیار پذیرش بسنجید.",
            [action_item(action) for action in work["to_verify"]],
        ),
        (
            "plans_to_approve",
            "طرح‌های مواجهه‌ی منتظر تأیید شما",
            "شما مالک این ریسک‌ها هستید؛ تا تأیید نکنید اجرای طرح شروع نمی‌شود.",
            [
                item(
                    f"plan-{plan.pk}",
                    str(plan),
                    plan.get_absolute_url(),
                    risk=plan.risk,
                    level=plan.assessment.decision_level,
                    due=plan.decision_due,
                )
                for plan in work["plans_to_approve"]
            ],
        ),
        (
            "acceptances_to_sign",
            "پذیرش‌های منتظر امضای شما",
            "متن تصمیم فقط بعد از همه‌ی امضاها نوشته می‌شود.",
            [acceptance_item(acceptance) for acceptance in work["acceptances_to_sign"]],
        ),
        (
            "questions",
            "پرسش‌های ریسک منتظر جواب",
            "عضو GRC برای ارزیابی ریسک‌های واحد شما این‌ها را پرسیده است.",
            [
                item(
                    f"question-{question.pk}",
                    question.text,
                    reverse("workflow:question_answer", args=[question.pk]),
                    risk=question.risk,
                    due=question.due,
                    route="/questionnaires/risk-questions",
                )
                for question in work["questions"]
            ],
        ),
        (
            "change_requests",
            "درخواست‌های ادغام و تفکیک منتظر تأیید شما",
            "",
            [
                item(
                    f"change-{change.pk}",
                    f"{change.get_kind_display()} {change.risk.code}",
                    change.get_absolute_url(),
                    risk=change.risk,
                )
                for change in work["change_requests"]
            ],
        ),
        (
            "waiting_risks",
            "ریسک‌های منتظر طرح مواجهه",
            "به ترتیب سطح تصمیم، امتیاز و مهلت.",
            [
                item(
                    f"waiting-{row.risk.pk}",
                    row.state,
                    row.plan.get_absolute_url() if row.plan else row.risk.get_absolute_url() + "#treatment",
                    risk=row.risk,
                    level=row.level,
                    due=row.due,
                    meta=f"امتیاز {row.assessment.score_high}" if row.assessment.score_high else None,
                )
                for row in work["waiting_risks"]
            ],
        ),
        (
            "ready_for_review",
            "طرح‌هایی که همه‌ی اقدام‌هایشان تأیید شده است",
            "آماده‌ی بازبینی ریسک و ارزیابی جاری تازه برای بازسنجی.",
            [
                item(f"review-{plan.pk}", str(plan), plan.get_absolute_url(), risk=plan.risk, level=plan.level)
                for plan in work["ready_for_review"]
            ],
        ),
        (
            "expiring_acceptances",
            "پذیرش‌های رو به انقضا",
            "تا ۳۰ روز دیگر تمام می‌شوند یا تمام شده‌اند. تمدید خودکار نیست.",
            [acceptance_item(acceptance) for acceptance in work["expiring_acceptances"]],
        ),
        (
            "qc",
            "ارزیابی‌های منتظر کنترل کیفیت شما",
            "",
            [
                item(f"qc-{assessment.pk}", assessment.code, assessment.get_absolute_url() + "#review", assessment.risk)
                for assessment in work["qc"]
            ],
        ),
        (
            "referrals",
            "اختلاف‌های ارجاع‌شده به کارگروه امنیت",
            "",
            [
                item(
                    f"referral-{assessment.pk}",
                    assessment.code,
                    assessment.get_absolute_url() + "#review",
                    assessment.risk,
                )
                for assessment in work["referrals"]
            ],
        ),
    ]
    return [{"key": key, "title": title, "hint": hint, "items": items} for key, title, hint, items in rows if items]


class MyWorkView(ApiView):
    def get(self, request):
        return Response({"today": fmt.today(), "sections": sections(request.user)})
