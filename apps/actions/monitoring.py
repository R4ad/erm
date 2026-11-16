"""پایش بخش‌های ۱۹، ۲۱ و ۲۳ سند v5؛ فقط کار داخلی می‌سازد و هیچ خدمتی را قطع نمی‌کند."""

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.accounts.delegation import forwarded
from apps.accounts.roles import Role
from apps.assessments.models import Assessment
from apps.controls.models import ControlAssessment
from apps.methodology.models import MethodParameter
from apps.methodology.services import active_version, parameter
from apps.risks.models import Risk
from apps.workcalendar.workdays import add_period

from .models import MonitoringNotice, RiskAcceptance, RiskReview, TreatmentAction

T = RiskReview.Trigger


def latest_current(risk):
    return (
        risk.assessments.filter(
            kind=Assessment.Kind.CURRENT, status=Assessment.Status.APPROVED
        )
        .select_related("decision_level", "method_version")
        .order_by("-approved_at", "-pk")
        .first()
    )


def escalation_users(risk):
    """متولی روش و مرجع مجاز سطح ریسک؛ اعلان اطلاعات فقط به نقش‌های دارای دسترسی ارسال می‌شود."""
    base = latest_current(risk)
    roles = [Role.GRC_MEMBER, Role.SYSTEM_ADMIN]
    if (
        base
        and base.decision_level
        and base.decision_level.co_approver == "security_committee"
    ):
        roles.append(Role.SECURITY_COMMITTEE)
    condition = Q(groups__name__in=roles) | Q(is_superuser=True)
    if (
        base
        and base.decision_level
        and base.decision_level.co_approver == "upper_manager"
    ):
        condition |= Q(managed_units=risk.org_unit_id, groups__name=Role.UNIT_MANAGER)
    return get_user_model().objects.filter(is_active=True).filter(condition).distinct()


def notify(risk, key, message, href, recipients):
    count = 0
    recipients = [*recipients, *forwarded(recipients)]  # جانشین تفویض برقرار هم اعلان را می‌گیرد (فیگما ۲۹)
    for person in {
        user.pk: user for user in recipients if user and user.is_active
    }.values():
        _, created = MonitoringNotice.objects.get_or_create(
            recipient=person,
            event_key=key,
            defaults={"risk": risk, "message": message, "href": href},
        )
        count += created
    return count


def automatic_review(risk, base, trigger, due, key, reason):
    return RiskReview.objects.get_or_create(
        event_key=key,
        defaults={
            "risk": risk,
            "assessment": base,
            "trigger": trigger,
            "due": due,
            "reason": reason,
            "responsible": risk.owner,
        },
    )[0]


@transaction.atomic
def record_trigger(risk, user, trigger, reason, due=None, control=None):
    """رخداد و شکست کنترل یک روز کاری؛ الزام تازه پنج روز کاری؛ تغییرات پیش از موعد تعهد بررسی می‌شوند."""
    from .permissions import can_edit_plans
    from .services import PlanError

    if not can_edit_plans(user) or not risk.is_active:
        raise PlanError(["محرک بازبینی را عضو GRC برای ریسک فعال ثبت می‌کند."])
    manual = {T.INCIDENT, T.CONTROL, T.CHANGE, T.DEPENDENCY, T.CUSTOMER, T.REQUIREMENT}
    if trigger not in manual or not reason.strip():
        raise PlanError(["محرک معتبر و منبع و دامنه بررسی لازم است."])
    if not risk.owner_id or not risk.owner.is_active:
        raise PlanError(["بازبینی مالک ریسک فعال می‌خواهد."])
    base = latest_current(risk)
    version = base.method_version if base else active_version()
    today = timezone.localdate()
    if trigger in {T.INCIDENT, T.CONTROL, T.REQUIREMENT}:
        key = (
            MethodParameter.Key.REASSESS_REQUIREMENT
            if trigger == T.REQUIREMENT
            else MethodParameter.Key.REASSESS_INCIDENT
        )
        maximum = add_period(today, int(parameter(version, key)), "working_day")
        due = min(due, maximum) if due else maximum
    elif due is None:
        raise PlanError(["تاریخ بررسی پیش از تصویب تولید یا پذیرش تعهد را تعیین کنید."])
    if trigger == T.CONTROL:
        if (
            control is None
            or not risk.controls.filter(pk=control.pk, is_key=True).exists()
        ):
            raise PlanError(["کنترل کلیدی مرتبط با همین ریسک را انتخاب کنید."])
        # شکست یک کنترل مشترک بر همه ارزیابی‌های همان کنترل اثر دارد؛ تاریخچه امتیاز تأییدشده حفظ می‌شود.
        for sheet in control.effectiveness_assessments.filter(suspended=False):
            sheet.suspended = True
            sheet._history_user = user
            sheet.save()
        affected = control.risks.exclude(status__in=Risk.CLOSED_STATUSES).exclude(
            pk=risk.pk
        )
        for other in affected:
            if other.owner_id:
                automatic_review(
                    other,
                    latest_current(other),
                    T.CONTROL,
                    due,
                    f"failure:{control.pk}:{timezone.now().isoformat()}:{other.pk}",
                    reason,
                )
    review = RiskReview(
        risk=risk,
        assessment=base,
        trigger=trigger,
        reason=reason.strip(),
        due=due,
        responsible=risk.owner,
        created_by=user,
    )
    review._history_user = user
    review.save()
    # رخداد باید هم‌زمان به مسیر پاسخ رخداد ارجاع شود؛ پیام به کارتابل متولی و مالک می‌رود.
    notify(
        risk,
        f"trigger:{review.pk}",
        f"{review.get_trigger_display()}: {reason.strip()}",
        review.get_absolute_url(),
        [risk.owner, *escalation_users(risk)],
    )
    return review


@transaction.atomic
def complete_review(review, user, result):
    from .permissions import can_edit_plans
    from .services import PlanError

    review = RiskReview.objects.select_for_update().get(pk=review.pk)
    if review.completed_at or not (
        can_edit_plans(user) or user.pk == review.responsible_id
    ):
        raise PlanError(["ثبت نتیجه این بازبینی مجاز نیست."])
    if not result.strip():
        raise PlanError(["نتیجه و اقدام بعدی را بنویسید."])
    if review.trigger == T.ANNUAL:
        fresh = review.risk.assessments.filter(
            kind=Assessment.Kind.CURRENT,
            status=Assessment.Status.APPROVED,
            approved_at__gte=review.created_at,
            incomplete_reasons=[],
            score_high__isnull=False,
        ).exists()
        if not fresh:
            raise PlanError(
                ["ارزیابی کامل سالانه با ارزیابی جاری تأییدشده تازه پایان می‌یابد."]
            )
    review.result = result.strip()
    review.completed_at = timezone.now()
    review.completed_by = user
    review._history_user = user
    review.save()
    return review


def _schedule(risk, base, today):
    if not base or not base.approved_at or not base.decision_level or not risk.owner_id:
        return
    level = base.decision_level
    approved_on = timezone.localdate(base.approved_at)
    last = (
        risk.monitoring_reviews.filter(
            assessment=base, trigger=T.PERIODIC, completed_at__isnull=False
        )
        .order_by("-completed_at")
        .first()
    )
    start = timezone.localdate(last.completed_at) if last else approved_on
    periodic_due = add_period(start, level.review_value, level.review_unit)
    annual_due = add_period(
        approved_on,
        int(parameter(base.method_version, MethodParameter.Key.FULL_ASSESSMENT)),
        "month",
    )
    if periodic_due <= today:
        automatic_review(
            risk,
            base,
            T.PERIODIC,
            periodic_due,
            f"periodic:{base.pk}:{periodic_due}",
            "بررسی تغییر شواهد، کنترل و دامنه مطابق دوره سطح تصمیم.",
        )
    if annual_due <= today:
        automatic_review(
            risk,
            base,
            T.ANNUAL,
            annual_due,
            f"annual:{base.pk}",
            "ارزیابی کامل دست‌کم سالانه لازم است.",
        )
    # فقط کنترل‌های مورد اتکای ارزیابی جاری، با E بالاتر از ۱.
    for sheet in (
        ControlAssessment.objects.filter(paths__assessment=base, e__gte=2)
        .select_related("control")
        .distinct()
    ):
        if sheet.suspended or (sheet.valid_until and sheet.valid_until < today):
            automatic_review(
                risk,
                base,
                T.EVIDENCE,
                today,
                f"evidence:{base.pk}:{sheet.pk}",
                f"اعتبار کاهش {sheet.code} برای {sheet.control.code} نیازمند آزمون تازه است.",
            )


@transaction.atomic
def reminder_days(acceptance):
    """روزهای یادآوری اول و دوم پیش از پایان اعتبار پذیرش، از پارامترهای نسخه‌ی روش. پذیرش کوتاه‌تر از یادآوری اول
    در نیمه‌ی دوره یادآوری می‌گیرد و یادآوری دوم هیچ‌وقت از نصف اولی دیرتر نیست."""
    version = acceptance.assessment.method_version
    span = max(1, (acceptance.end_date - acceptance.start_date).days)
    first_limit = int(parameter(version, MethodParameter.Key.REMINDER_FIRST))
    first = first_limit if span > first_limit else max(1, span // 2)
    second = min(int(parameter(version, MethodParameter.Key.REMINDER_SECOND)), max(1, first // 2))
    return first, second


def run_monitoring(today=None):
    """اجرای تکرارپذیر زمان‌بند؛ هر اعلان یک بار برای هر گیرنده و رویداد ثبت می‌شود."""
    today = today or timezone.localdate()
    notices = 0
    risks = Risk.objects.exclude(status__in=Risk.CLOSED_STATUSES).select_related(
        "owner"
    )
    for risk in risks:
        _schedule(risk, latest_current(risk), today)
    acceptances = (
        RiskAcceptance.objects.select_for_update(of=("self",))
        .filter(
            status__in=[RiskAcceptance.Status.ACTIVE, RiskAcceptance.Status.EXPIRED]
        )
        .select_related("risk__owner", "follow_up_by", "assessment__method_version")
    )
    for acceptance in acceptances:
        risk = acceptance.risk
        days = (acceptance.end_date - today).days
        first, second = reminder_days(acceptance)
        stage = (
            "expired"
            if days < 0
            else "second"
            if days <= second
            else "first"
            if days <= first
            else None
        )
        if stage is None:
            continue
        recipients = [acceptance.follow_up_by, risk.owner]
        if stage == "expired":
            if acceptance.status != RiskAcceptance.Status.EXPIRED:
                acceptance.status = RiskAcceptance.Status.EXPIRED
                acceptance.save()
            recipients.extend(escalation_users(risk))
            if risk.is_active and risk.owner_id:
                automatic_review(
                    risk,
                    acceptance.assessment,
                    T.ACCEPTANCE,
                    acceptance.end_date,
                    f"acceptance:{acceptance.pk}",
                    f"پذیرش {acceptance.code} منقضی است؛ تمدید خودکار مجاز نیست.",
                )
        message = f"پذیرش {acceptance.code}: " + (
            "منقضی؛ تصمیم مجدد مقام مجاز لازم است."
            if days < 0
            else f"{days} روز تا پایان اعتبار."
        )
        notices += notify(
            risk,
            f"acceptance:{acceptance.pk}:{stage}",
            message,
            acceptance.get_absolute_url(),
            recipients,
        )
    for action in (
        TreatmentAction.objects.exclude(status=TreatmentAction.Status.VERIFIED)
        .filter(due_date__lte=today, plan__risk__in=risks)
        .select_related("plan__risk__owner", "owner", "assignee")
    ):
        overdue = action.due_date < today
        recipients = [action.owner, action.assignee]
        if overdue:
            recipients += [action.plan.risk.owner, *escalation_users(action.plan.risk)]
        notices += notify(
            action.plan.risk,
            f"action:{action.pk}:{'overdue' if overdue else 'due'}:{action.due_date}",
            f"اقدام {action.code}: {'معوق و نیازمند پیگیری' if overdue else 'سررسید امروز'}.",
            action.get_absolute_url(),
            recipients,
        )
    for review in RiskReview.objects.filter(
        completed_at__isnull=True, due__lte=today, risk__in=risks
    ).select_related("risk__owner", "responsible"):
        recipients = [review.responsible]
        if review.due < today:
            recipients.extend(escalation_users(review.risk))
        notices += notify(
            review.risk,
            f"review:{review.pk}:{'overdue' if review.due < today else 'due'}",
            f"{review.get_trigger_display()} برای {review.risk.code}؛ مهلت بررسی رسیده است.",
            review.get_absolute_url(),
            recipients,
        )
    from apps.workflow.models import RiskQuestion

    from .mywork import waiting_risks
    from .services import containment_due

    for row in waiting_risks():
        risk = row.risk
        if row.due <= today:
            notices += notify(
                risk,
                f"plan:{row.assessment.pk}:{row.state}",
                f"مهلت طرح یا تصمیم {risk.code} رسیده است: {row.state}.",
                risk.get_absolute_url(),
                [risk.owner, *escalation_users(risk)],
            )
        containment = containment_due(risk, row.level)
        if containment and containment <= timezone.now():
            notices += notify(
                risk,
                f"containment:{row.assessment.pk}",
                f"مهلت مهار {risk.code} رسیده است؛ اقدام بی‌درنگ و ارجاع به مقام مجاز لازم است.",
                risk.get_absolute_url(),
                [risk.owner, *escalation_users(risk)],
            )
    for question in RiskQuestion.objects.filter(
        risk__in=risks, answered_at__isnull=True, due__lt=today
    ).select_related("risk__owner", "risk__org_unit"):
        managers = get_user_model().objects.filter(
            is_active=True, managed_units=question.risk.org_unit_id
        )
        notices += notify(
            question.risk,
            f"question:{question.pk}:overdue",
            "مهلت پاسخ به پرسش ریسک گذشته است.",
            question.risk.get_absolute_url(),
            [*managers, *escalation_users(question.risk)],
        )
    return notices
