"""بخش‌های پرونده‌ی ریسک فیگما (صفحه‌ی ۰۴) که صفحه‌ی جنگو نداشت: نوار مراحل گردش کار، نوار مهلت، نتیجه‌ی آخرین
ارزیابی جاری با دلیل سطح، اثربخشی کنترل‌ها و خط زمانی با رویداد ثبت."""

from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.actions.services import current_plan, decision_due, pending_actions
from apps.assessments.models import Assessment
from apps.assessments.services import decision_assessment
from apps.controls.effectiveness import Thresholds
from apps.controls.models import ControlAssessment
from apps.methodology.models import PeriodUnit
from apps.methodology.services import active_version
from apps.risks.models import Risk
from apps.workcalendar.workdays import working_days_between
from apps.workflow.lifecycle import blocking_problems

from . import formatting as fmt

S = Risk.Status

# هفت مرحله‌ی نوار بالای پرونده، به ترتیب جدول س۱۵. «ارسال‌شده» و «آنالیز ریسک» همان مرحله‌ی رجیستر است و ریسک
# ردشده به جای «بسته‌شده» در «ردشده» تمام می‌شود. ریسکی که با «آنالیز ریسک» به دنیا آمده این مرحله را با همین نام می‌بیند.
STEPS = [S.QUESTIONS, S.REGISTERED, S.ASSESSMENT, S.TREATMENT_PLAN, S.TREATMENT, S.REVIEW, S.CLOSED]


def step_of(status):
    return S.REGISTERED if status in Risk.REGISTER_STATUSES else status


def fa(value):
    return str(value).translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def stepper(risk, timeline):
    """مرحله‌ها با وضعیت done، current، todo یا skipped و تاریخ آخرین ورود به هر مرحله. timeline قدیمی به جدید است."""
    born = timeline[0].from_status if timeline else risk.status
    entered = {step_of(born): risk.created_at}
    for entry in timeline:
        entered[step_of(entry.to_status)] = entry.created_at
    steps = [S.REJECTED if step == S.CLOSED and risk.status == S.REJECTED else step for step in STEPS]
    current = steps.index(step_of(risk.status))
    labels = dict(S.choices)
    if born == S.ANALYSIS:
        labels[S.REGISTERED] = labels[S.ANALYSIS]
    rows = []
    for index, step in enumerate(steps):
        if index < current:
            state = "done" if step in entered else "skipped"
        elif index == current:
            state = "done" if risk.status in Risk.CLOSED_STATUSES else "current"
        else:
            state = "todo"
        rows.append(
            {
                "status": step,
                "label": labels[step],
                "state": state,
                "date": fmt.day(timezone.localdate(entered[step])) if state in ("done", "current") and step in entered
                else None,
            }
        )
    return rows


def period_text(value, unit):
    return f"{fa(value)} {PeriodUnit(unit).label}"


def plan_state(plan):
    if plan is None:
        return "طرح هنوز ثبت نشده است."
    if not plan.is_owner_approved:
        return "طرح ثبت شده و منتظر تأیید مالک ریسک است."
    pending = list(pending_actions(plan).values_list("code", flat=True))
    if pending:
        return f"طرح تأیید شده و اقدام‌های {'، '.join(pending)} منتظر تأیید مالک ریسک‌اند."
    return "طرح و اقدام‌ها تأیید شده‌اند و اجرای درمان می‌تواند شروع شود."


def deadline_title(label, due):
    today = timezone.localdate()
    if due < today:
        days = working_days_between(due, today)
        return f"مهلت {label} گذشته است: {fa(days)} روز کاری از {fa(fmt.day(due)['jalali'])}", "danger"
    days = working_days_between(today, due)
    return f"مهلت {label}: {fa(days)} روز کاری مانده (تا {fa(fmt.day(due)['jalali'])})", "warning"


def banner(risk, add_plan_url=None):
    """نوار مهلت زیر مراحل: مهلت طرح مواجهه در «برنامه‌ی درمان» (جدول بخش ۱۹) و مهلت جواب پرسش‌ها. None یعنی
    مهلت بازی نیست."""
    if risk.status == S.TREATMENT_PLAN:
        base = decision_assessment(risk)
        if base is None or base.decision_level is None:
            return None
        level = base.decision_level
        plan = current_plan(risk)
        title, tone = deadline_title("ثبت طرح مواجهه", decision_due(risk, level))
        if plan:
            link = {"label": "رفتن به طرح", "href": plan.get_absolute_url()}
        elif add_plan_url:
            link = {"label": "نوشتن طرح", "href": add_plan_url}
        else:
            link = None
        return {
            "tone": tone,
            "title": title,
            "text": f"سطح «{level.name}» ⇒ طرح طی {period_text(level.plan_value, level.plan_unit)} از ورود به "
            f"برنامه‌ی درمان. {plan_state(plan)}",
            "link": link,
            "tab": None,
        }
    if risk.status == S.QUESTIONS:
        open_questions = [question for question in risk.questions.all() if question.is_open]
        if not open_questions:
            return None
        title, tone = deadline_title("جواب پرسش‌ها", min(question.due for question in open_questions))
        return {
            "tone": tone,
            "title": title,
            "text": f"{fa(len(open_questions))} پرسش باز از واحد {risk.org_unit.name}؛ با جواب همه‌ی پرسش‌ها ریسک "
            "به رجیستر برمی‌گردد.",
            "link": None,
            "tab": "questions",
        }
    return None


def transitions(risk, user, available):
    """انتقال‌های نقش کاربر با شرط‌های برقرارنشده‌شان، تا دکمه‌ی انتقال مسدود با دلیلش دیده شود."""
    return [
        {"name": transition.name, "problems": blocking_problems(transition, risk, {"reason": "-"})}
        for transition in available
    ]


def floor_for(version, impact):
    """کف پیامدی که برای این I برقرار است (بالاترین سطح میان کف‌های min_impact ≤ I)، یا None."""
    floors = [floor for floor in version.impact_floors.select_related("min_level") if impact >= floor.min_impact]
    return max(floors, key=lambda row: row.min_level.rank, default=None)


def level_reason(version, impact, score, base, decision, escalation_reasons=()):
    """کف پیامد، سطح پایه و قاعده‌های تقدم به زبان کاربر (بخش ۱۸)؛ پرونده‌ی ریسک و پرونده‌ی ارزیابی هر دو آن را
    نشان می‌دهند."""
    if impact is None or score is None or decision is None:
        return ""
    parts = []
    floor = floor_for(version, impact)
    sentence = f"سطح پایه‌ی امتیاز {fa(score)} «{base.name}» است" if base else ""
    if floor and base:
        if floor.min_level.rank > base.rank:
            parts.append(f"کف پیامد برای I={fa(impact)} دست‌کم «{floor.min_level.name}» است؛ {sentence}، پس کف سطح "
                         f"را به «{floor.min_level.name}» رساند.")
        else:
            parts.append(f"کف پیامد برای I={fa(impact)} دست‌کم «{floor.min_level.name}» است؛ {sentence}، پس کف "
                         "تغییری نداد.")
    elif sentence:
        parts.append(f"{sentence}.")
    if escalation_reasons:
        parts.append(f"قاعده‌ی تقدم سطح تصمیم را «{decision.name}» کرد: {'، '.join(escalation_reasons)}.")
    return " ".join(parts)


def explanation(assessment):
    """دلیل سطح تصمیم ارزیابی تأییدشده: پیامد غالب، کف پیامد، سطح پایه و قاعده‌های تقدم."""
    impact, score = assessment.impact_high, assessment.score_high
    if impact is None or score is None or assessment.decision_level is None:
        return ""
    parts = []
    detail = (
        assessment.impacts.select_related("scale", "customer")
        .filter(level__isnull=False)
        .annotate(top=Coalesce("level_high", "level"))
        .order_by("-top", "pk")
        .first()
    )
    if detail and (detail.level_high or detail.level) == impact:
        whom = f" برای {detail.customer.name}" if detail.customer_id else ""
        parts.append(f"پیامد I از بُعد {detail.scale.code} ({detail.scale.name}){whom} برابر {fa(impact)} است.")
    parts.append(
        level_reason(
            assessment.method_version, impact, score, assessment.base_level, assessment.decision_level,
            assessment.escalation_reasons,
        )
    )
    return " ".join(part for part in parts if part)


FLAGS = ["رویداد در حال وقوع", "منع الزام‌آور", "عبور از حد تحمل مشتری"]


def latest_result(assessment):
    """کاشی‌های «نتیجه‌ی آخرین ارزیابی جاری»: A، B، L، I، امتیاز و سطح تصمیم، با کران بالا (مبنای تصمیم)."""
    if assessment is None:
        return None
    flags = [
        label
        for label, on in zip(
            FLAGS,
            [assessment.ongoing_incident, assessment.binding_prohibition, assessment.customer_tolerance_exceeded],
            strict=True,
        )
        if on
    ]
    confidence = assessment.get_confidence_display() if assessment.confidence else ""
    if flags:
        flag_text = f"با نشان {'، '.join(f'«{flag}»' for flag in flags)}."
    else:
        flag_text = "بدون نشان «رویداد در حال وقوع»، «منع الزام‌آور» یا «عبور از حد تحمل مشتری»."
    return {
        "code": assessment.code,
        "href": assessment.get_absolute_url(),
        "approved_at": fmt.day(timezone.localdate(assessment.approved_at)) if assessment.approved_at else None,
        "method_version": assessment.method_version.number,
        "horizon_months": assessment.horizon_months,
        "a": assessment.a_high or assessment.a,
        "b": assessment.b_high,
        "likelihood": assessment.likelihood_high,
        "impact": assessment.impact_high,
        "score": assessment.score_high,
        "level": fmt.level(assessment.decision_level),
        "explanation": explanation(assessment),
        "note": f"اطمینان کلی: {confidence} · {flag_text}" if confidence else flag_text,
    }


def assessment_detail(assessment, control_codes, is_decision=False):
    """توضیح کوتاه هر ردیف ارزیابی در فیگما: موعد هدف، «مبنای تصمیم» برای ارزیابی جاری تصمیم، و کنترل‌هایی که
    ارزیابی ذاتی بدون آن‌ها سنجیده شده است."""
    when = assessment.approved_at or assessment.created_at
    day = fmt.day(timezone.localdate(when))["jalali"]
    if assessment.kind == Assessment.Kind.TARGET:
        return f"موعد تحقق {fa(fmt.day(assessment.target_due)['jalali'])}" if assessment.target_due else fa(day)
    if assessment.kind == Assessment.Kind.INHERENT and control_codes:
        shown = control_codes[:2]
        rest = len(control_codes) - len(shown)
        codes = " و ".join(shown) + (f" و {fa(rest)} کنترل دیگر" if rest else "")
        return f"{fa(day)} · بدون {codes}"
    if assessment.kind == Assessment.Kind.CURRENT and assessment.is_approved and is_decision:
        return f"مبنای تصمیم · {fa(day)}"
    return fa(day)


def control_rows(risk, visible_ids):
    """کنترل‌های فعلی با E مؤثر آخرین ارزیابی اثربخشی. کنترل بدون ارزیابی یا با شاهد کهنه E1 است (بخش ۱۵)."""
    controls = list(risk.controls.prefetch_related("iso_controls").order_by("-is_key", "code"))
    latest = {}
    for row in ControlAssessment.objects.filter(control__in=controls).select_related("control", "method_version"):
        latest.setdefault(row.control_id, row)  # ترتیب مدل: تازه‌ترین اول
    rows = []
    for control in controls:
        assessment = latest.get(control.pk)
        problem = "ارزیابی اثربخشی ندارد" if assessment is None else assessment.credit_problem()
        e = 1 if assessment is None else assessment.effective_e()
        iso = [f"A.{item.code}" for item in control.iso_controls.all()]
        rows.append(
            {
                "code": control.code,
                "title": control.title,
                "kind": control.get_kind_display(),
                "iso": iso,
                "is_key": control.is_key,
                "e": e,
                "no_valid_evidence": e == 1 and problem is not None,
                "problem": problem,
                "href": control.get_absolute_url() if control.pk in visible_ids else None,
            }
        )
    return rows


def key_evidence_age():
    version = active_version()
    return Thresholds.of(version).evidence_age(True) if version else None


def role_of(user):
    if user is None:
        return "سامانه"
    names = user.role_names
    return names[0] if names else ""


def timeline_rows(risk, timeline):
    """خط زمانی: تازه‌ترین بالا، و ثبت خود ریسک پایین‌ترین ردیف (فیگما «ساخته‌شده از پاسخ پرسشنامه»)."""
    labels = dict(S.choices)
    rows = [
        {
            "status": step_of(entry.to_status),
            "label": labels[entry.to_status],
            "from": labels[entry.from_status],
            "reason": entry.reason,
            "meeting_date": fmt.day(entry.meeting_date),
            "by": fmt.person(entry.created_by),
            "role": role_of(entry.created_by),
            "at": fmt.moment(entry.created_at),
        }
        for entry in reversed(timeline)
    ]
    born = timeline[0].from_status if timeline else risk.status
    if risk.channel == Risk.Channel.QUESTIONNAIRE:
        reason = f"ساخته‌شده از پاسخ پرسشنامه‌ی واحد {risk.org_unit.name}"
    else:
        reason = f"ثبت در رجیستر از کانال «{risk.get_channel_display()}»"
    rows.append(
        {
            "status": step_of(born),
            "label": labels[born],
            "from": None,
            "reason": reason,
            "meeting_date": None,
            "by": None,
            "role": "سامانه",
            "at": fmt.moment(risk.created_at),
        }
    )
    return rows
