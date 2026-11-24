from collections import Counter

from django.urls import reverse
from django.utils import timezone
from rest_framework.response import Response

from apps.actions.acceptance import required_authorities
from apps.actions.models import RiskAcceptance, TreatmentAction
from apps.actions.mywork import my_work
from apps.core.jalali import to_jalali
from apps.questionnaires.models import Response as QuestionnaireResponse
from apps.questionnaires.permissions import can_manage_questionnaires, visible_responses
from apps.workcalendar.workdays import working_days_between

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


def action_item(action, href=None):
    owner, assignee = fmt.person(action.owner)["name"], fmt.person(action.assignee)["name"]
    meta = f"مالک {owner}" if owner == assignee else f"مالک {owner}، مجری {assignee}"
    return item(
        f"action-{action.pk}",
        f"{action.code} {action.title}",
        href or action.get_absolute_url(),
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
            [action_item(action, reverse("actions:action_verify", args=[action.pk])) for action in work["to_verify"]],
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


# ───────────── صف کارهای فیگما ─────────────
# زبانه‌های «صف کارها»: اقدام‌ها، امضا و تأیید، ارزیابی‌ها، پرسش‌ها، پذیرش‌ها. هر کار یک ردیف با آیکون و لحن نوع،
# عنوان، نوع و زمینه، کد، سطح، مهلت و اقدام بعدی (دکمه‌ی اصلی، ثانویه یا کم‌رنگ).
CATEGORIES = [
    ("actions", "اقدام‌ها"),
    ("signoff", "امضا و تأیید"),
    ("assessments", "ارزیابی‌ها"),
    ("questions", "پرسش‌ها"),
    ("acceptances", "پذیرش‌ها"),
]


def task(key, category, title, kind, context, code, href, *, icon, tone, cta, cta_style="secondary", level=None,
         due=None, due_text=None, route=None, no_due="بدون مهلت", rated=True):
    """rated=False برای کاری که موضوعش ریسک نیست (پاسخنامه) و ستون سطح ریسکش خالی می‌ماند."""
    return {
        "key": key,
        "category": category,
        "title": title,
        "kind": kind,
        "context": context,
        "code": code,
        "href": href,
        "route": route or spa_route(href),
        "icon": icon,
        "tone": tone,
        "cta": cta,
        "cta_style": cta_style,
        "level": fmt.level(level),
        "rated": rated,
        "due": fmt.deadline(due),
        "due_text": due_text,
        "no_due": no_due,
    }


def due_tone(due, default="brand"):
    if due is None:
        return default
    return "danger" if due <= timezone.localdate() else default


def latest_level(risk):
    assessment = (
        risk.assessments.filter(status="approved", kind="current").select_related("decision_level")
        .order_by("-approved_at").first()
    )
    return assessment.decision_level if assessment else None


def action_task(action, verify=False):
    risk = action.plan.risk
    level = action.plan.assessment.decision_level
    if verify:
        return task(
            f"verify-{action.pk}", "signoff", f"تأیید نتیجه‌ی اقدام: {action.title}", "تأیید نتیجه",
            risk.title, action.code, reverse("actions:action_verify", args=[action.pk]),
            icon="check-circle", tone="success", cta="تأیید یا رد", level=level, due=action.due_date,
        )
    blocked = action.status == TreatmentAction.Status.BLOCKED
    cta, style = {
        TreatmentAction.Status.IN_PROGRESS: ("ثبت پیشرفت", "primary"),
        TreatmentAction.Status.APPROVED: ("شروع اجرا", "primary"),
        TreatmentAction.Status.BLOCKED: ("پیگیری", "ghost"),
        TreatmentAction.Status.FAILED: ("بازنگری", "secondary"),
        TreatmentAction.Status.READY: ("مشاهده", "ghost"),
    }.get(action.status, ("مشاهده", "ghost"))
    return task(
        f"action-{action.pk}", "actions",
        f"اقدام مسدود: {action.title}" if blocked else action.title,
        "اقدام مسدود" if blocked else "اقدام", risk.title, action.code, action.get_absolute_url(),
        icon="warning" if blocked else "check-square",
        tone="danger" if blocked else due_tone(action.due_date if action.is_open else None),
        cta=cta, cta_style=style, level=level, due=action.due_date if action.is_open else None,
    )


def acceptance_followup(acceptance):
    needed = len(required_authorities(acceptance))
    signed = acceptance.signatures.filter(decision="approve").count()
    return task(
        f"follow-{acceptance.pk}", "acceptances",
        f"پیگیری امضاهای پذیرش ریسک باقیمانده — {fmt_fa(signed)} از {fmt_fa(needed)} امضا",
        "پذیرش", acceptance.risk.title, acceptance.code, acceptance.get_absolute_url(),
        icon="signature", tone="warning", cta="پیگیری", level=acceptance.assessment.decision_level,
        due=acceptance.end_date if acceptance.status == RiskAcceptance.Status.ACTIVE else None,
    )


def fmt_fa(value):
    return str(value).translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def plan_due_text(due, short=False):
    """مهلت طرح مواجهه به روز کاری شمرده می‌شود (بخش ۱۹ روش)، پس متنش هم روز کاری است نه روز تقویمی."""
    if due is None:
        return None
    today = timezone.localdate()
    if due < today:
        return f"{fmt_fa((today - due).days)} روز تأخیر"
    if due == today:
        return "امروز"
    days = working_days_between(today, due)
    return f"{fmt_fa(days)} روز کاری" if short else f"مهلت طرح: {fmt_fa(days)} روز کاری"


def response_tasks(user):
    """پاسخنامه‌های بازگشتی برای پاسخ‌دهنده با مهلت تکمیل، و صف «در انتظار بررسی» برای کارشناس ریسک با مهلت بررسی."""
    S = QuestionnaireResponse.Status
    rows = []
    for response in QuestionnaireResponse.objects.filter(respondent=user, status=S.RETURNED).select_related("org_unit"):
        route = response.answer_route
        rows.append(task(
            f"response-{response.pk}", "questions", f"تکمیل پاسخنامه‌ی {response.code}", "پاسخنامه",
            response.org_unit.name, response.code, f"/app{route}", icon="file-text",
            tone=due_tone(response.return_due), cta="پاسخ", cta_style="primary", due=response.return_due, route=route,
            rated=False,
        ))
    if can_manage_questionnaires(user):
        waiting = visible_responses(user).filter(status=S.SUBMITTED).select_related("org_unit")
        for response in waiting:
            route = response.review_route
            rows.append(task(
                f"review-response-{response.pk}", "questions", f"بررسی پاسخنامه‌ی {response.code}", "پاسخنامه",
                response.org_unit.name, response.code, f"/app{route}", icon="file-text",
                tone=due_tone(response.review_due), cta="بررسی", due=response.review_due, route=route, rated=False,
            ))
    return rows


def tasks(user, work):
    rows = [action_task(action) for action in work["my_actions"]]
    rows += [action_task(action, verify=True) for action in work["to_verify"]]
    for plan in work["plans_to_approve"]:
        rows.append(task(
            f"plan-{plan.pk}", "signoff", f"تأیید طرح مواجهه — {plan.risk.title}", "طرح مواجهه",
            "منتظر تأیید مالک ریسک", plan.risk.code, plan.get_absolute_url(), icon="clipboard", tone="warning",
            cta="بررسی و تأیید", cta_style="primary", level=plan.assessment.decision_level, due=plan.decision_due,
        ))
    for acceptance in work["acceptances_to_sign"]:
        rows.append(task(
            f"sign-{acceptance.pk}", "signoff", f"امضای پذیرش ریسک — {acceptance.risk.title}", "امضای پذیرش",
            acceptance.risk.title, acceptance.code, acceptance.get_absolute_url(), icon="signature", tone="warning",
            cta="امضا", cta_style="primary", level=acceptance.assessment.decision_level, due=acceptance.end_date,
        ))
    for change in work["change_requests"]:
        rows.append(task(
            f"change-{change.pk}", "signoff", f"{change.get_kind_display()} {change.risk.code}",
            "ادغام و تفکیک", "منتظر تصمیم مالک", change.risk.code, change.get_absolute_url(), icon="merge",
            tone="neutral", cta="بررسی", cta_style="ghost", level=latest_level(change.risk),
        ))
    for row in work["waiting_risks"]:
        if row.plan is not None:
            continue
        rows.append(task(
            f"write-plan-{row.risk.pk}", "actions",
            f"نوشتن طرح مواجهه — سطح {row.level.name}", "طرح مواجهه", row.risk.title, row.risk.code,
            row.risk.get_absolute_url() + "#treatment", icon="clipboard",
            tone="danger" if row.level.rank >= 4 else "warning", cta="نوشتن طرح", cta_style="primary",
            level=row.level, due=row.due, due_text=plan_due_text(row.due, short=True),
        ))
    for assessment in work["qc"]:
        rows.append(task(
            f"qc-{assessment.pk}", "assessments", f"کنترل کیفیت ارزیابی {assessment.get_kind_display()}",
            "ارزیابی", assessment.risk.title, assessment.code, assessment.get_absolute_url() + "#review",
            icon="gauge", tone="brand", cta="شروع بررسی", level=assessment.decision_level,
        ))
    for assessment in work["referrals"]:
        rows.append(task(
            f"referral-{assessment.pk}", "assessments", "تصمیم درباره‌ی اختلاف ارجاع‌شده به کارگروه", "ارزیابی",
            assessment.risk.title, assessment.code, assessment.get_absolute_url() + "#review", icon="users",
            tone="warning", cta="بررسی", level=assessment.decision_level,
        ))
    for review in work["monitoring_reviews"]:
        rows.append(task(
            f"monitor-review-{review.pk}", "assessments", f"بازبینی ریسک: {review.get_trigger_display()}",
            "بازبینی", review.risk.title, review.risk.code, review.get_absolute_url(), icon="eye", tone="info",
            cta="شروع بازبینی", level=latest_level(review.risk), due=review.due,
        ))
    for plan in work["ready_for_review"]:
        rows.append(task(
            f"review-{plan.pk}", "assessments", "بازبینی ریسک پس از تأیید همه‌ی اقدام‌ها", "بازبینی",
            plan.risk.title, plan.risk.code, plan.get_absolute_url(), icon="eye", tone="info", cta="شروع بازبینی",
            cta_style="ghost", level=plan.level,
        ))
    for question in work["questions"]:
        rows.append(task(
            f"question-{question.pk}", "questions", f"پاسخ به پرسش ریسک: {question.text}", "پرسش ریسک",
            str(question.risk.org_unit), question.risk.code,
            reverse("workflow:question_answer", args=[question.pk]), icon="chat", tone="neutral", cta="پاسخ",
            due=question.due, route="/questionnaires/risk-questions",
        ))
    rows += response_tasks(user)
    pending = RiskAcceptance.objects.filter(status=RiskAcceptance.Status.PENDING, follow_up_by=user)
    rows += [acceptance_followup(acceptance) for acceptance in pending.select_related("risk", "assessment__decision_level")]

    def urgency(row):
        due = row["due"]["days_left"] if row["due"] else 10_000
        rank = row["level"]["rank"] if row["level"] else 0
        return (due, -rank)

    return sorted(rows, key=urgency)


def kpis(rows, work):
    today = [row for row in rows if row["due"] and row["due"]["days_left"] == 0]
    overdue = [row for row in rows if row["due"] and row["due"]["days_left"] < 0]
    counts = {key: sum(1 for row in rows if row["category"] == key) for key, _ in CATEGORIES}
    breakdown = [
        (counts["actions"], "اقدام"),
        (counts["signoff"] + counts["acceptances"], "پیگیری"),
        (counts["questions"] + counts["assessments"], "بررسی"),
    ]
    return {
        "waiting": {
            "count": len(rows),
            "note": " · ".join(f"{fmt_fa(n)} {label}" for n, label in breakdown if n) or "کاری منتظر شما نیست",
        },
        "due_today": {
            "count": len(today),
            "note": " و ".join(
                f"{fmt_fa(n)} {kind}" for kind, n in Counter(row["kind"] for row in today).most_common()
            ) or "امروز سررسیدی ندارید",
        },
        "overdue": {
            "count": len(overdue),
            "note": f"قدیمی‌ترین: {fmt_fa(-min(row['due']['days_left'] for row in overdue))} روز تأخیر"
            if overdue else "کار عقب‌افتاده‌ای ندارید",
        },
        "to_verify": {"count": len(work["to_verify"]), "note": "به‌عنوان تأییدکننده‌ی اقدام"},
    }


PLAN_STATES = {
    "بدون طرح": "danger",
    "منتظر تأیید مالک": "warning",
    "آماده‌ی شروع اجرا": "success",
    "منتظر بازسنجی طرح قبلی": "warning",
}


def plan_rows(work):
    today = timezone.localdate()
    rows = []
    for row in work["waiting_risks"]:
        if row.state == "آماده‌ی شروع اجرا" and row.plan and row.plan.owner_approved_at:
            note = f"طرح تأیید شد {fmt_fa(to_jalali(timezone.localdate(row.plan.owner_approved_at)))}"
        elif row.due and row.due < today:
            note = f"مهلت طرح: {fmt_fa((today - row.due).days)} روز گذشته"
        elif row.due:
            note = plan_due_text(row.due)
        else:
            note = ""
        route = spa_route(row.plan.get_absolute_url()) if row.plan else spa_route(row.risk.get_absolute_url())
        rows.append({
            "key": f"plan-risk-{row.risk.pk}", "code": row.risk.code, "title": row.risk.title,
            "level": fmt.level(row.level), "note": note, "state": row.state,
            "tone": PLAN_STATES.get(row.state, "neutral"), "route": route,
        })
    for plan in work["ready_for_review"]:
        rows.append({
            "key": f"plan-review-{plan.pk}", "code": plan.risk.code, "title": plan.risk.title,
            "level": fmt.level(plan.level), "note": "همه‌ی اقدام‌ها تأیید شده", "state": "آماده‌ی بازبینی",
            "tone": "info", "route": spa_route(plan.get_absolute_url()),
        })
    return rows


def acceptance_rows(work):
    rows = []
    for acceptance in work["expiring_acceptances"]:
        days = acceptance.days_left
        if acceptance.is_expired or days < 0:
            label, tone = "منقضی‌شده", "danger"
        else:
            label, tone = f"{fmt_fa(days)} روز مانده", "warning" if days <= 7 else "neutral"
        owner = fmt.person(acceptance.risk.owner)
        rows.append({
            "key": f"acc-{acceptance.pk}", "code": acceptance.code, "risk_code": acceptance.risk.code,
            "owner": owner["name"] if owner else None, "label": label, "tone": tone,
            "route": spa_route(acceptance.get_absolute_url()),
        })
    return rows


class MyWorkView(ApiView):
    def get(self, request):
        work = my_work(request.user)
        rows = tasks(request.user, work)
        return Response({
            "today": fmt.today(),
            "first_name": request.user.first_name or request.user.get_full_name() or request.user.username,
            "kpis": kpis(rows, work),
            "categories": [
                {"key": key, "label": label, "count": sum(1 for row in rows if row["category"] == key)}
                for key, label in CATEGORIES
            ],
            "tasks": rows,
            "plans": plan_rows(work),
            "acceptances": acceptance_rows(work),
            "sections": sections(request.user),
        })
