"""آزمون و تأیید نتیجه‌ی اقدام (فیگما ۲۴، بخش ۲۰ سند v5): تأییدکننده‌ی مستقل، معیارهای قبولی سنجش‌پذیر، اجراهای
آزمون و تصمیم. اقدام پس از تأیید خروجی بسته می‌شود ولی ریسک بسته نمی‌شود؛ وقتی همه‌ی اقدام‌های طرح تأیید شد، مالک
ریسک و GRC اعلان می‌گیرند که ارزیابی جاری تازه با شواهد واقعی ثبت شود. معیار خارج از دامنه با اقدام پیگیری جدا
دنبال می‌شود و نتیجه‌ی این اقدام را مخدوش نمی‌کند."""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.roles import Role

from .models import ActionCriterion, MonitoringNotice, TreatmentAction
from .services import BY_NAME, PlanError, can_move, perform_move

ST = TreatmentAction.Status
CS = ActionCriterion.Status
DECISIONS = ("verify", "fail")


def separation(action):
    """تفکیک وظایف: تأییدکننده نباید مجری یا پاسخ‌گوی همان اقدام باشد."""
    return action.verifier_id not in (action.assignee_id, action.owner_id)


def scope(action):
    criteria = list(action.criteria.all())
    inside = [criterion for criterion in criteria if criterion.in_scope]
    return {
        "all": criteria,
        "inside": inside,
        "passed": [criterion for criterion in inside if criterion.status == CS.PASSED],
        "outside": [criterion for criterion in criteria if not criterion.in_scope],
    }


def can_decide(user, action):
    return can_move(user, action, BY_NAME["verify"])


def verify_problems(action):
    """چرا «تأییدشده» هنوز ثبت نمی‌شود؛ «ناموفق» شرطی جز توضیح ندارد."""
    problems = []
    parts = scope(action)
    if parts["inside"] and len(parts["passed"]) < len(parts["inside"]):
        problems.append(
            f"{len(parts['inside']) - len(parts['passed'])} معیار دامنه‌ی اقدام هنوز قبول نشده است؛ نتیجه با همه‌ی "
            "معیارهای دامنه تأیید می‌شود."
        )
    if not action.test_runs.filter(passed=True).exists():
        problems.append("اجرای موفق آزمون ثبت نشده است.")
    if not separation(action):
        problems.append("تأییدکننده مجری یا مالک همین اقدام است.")
    return problems


def follow_up_title(criterion):
    return f"پیگیری: {criterion.title}"


def create_follow_ups(action, user):
    """یک اقدام پیگیری «برنامه‌ریزی» برای هر معیار خارج از دامنه، با همان مالک، مجری و تأییدکننده؛ مثل هر اقدام
    تازه‌ی طرح مصوب، تأیید مالک ریسک می‌خواهد."""
    today = timezone.localdate()
    length = max((action.due_date - action.start_date).days, 14)
    created = []
    for criterion in scope(action)["outside"]:
        title = follow_up_title(criterion)
        if action.plan.actions.filter(title=title).exists():
            continue
        item = TreatmentAction(
            plan=action.plan,
            title=title,
            deliverable=f"{criterion.title}؛ خارج از دامنه‌ی {action.code} ماند و جدا آزموده می‌شود.",
            mechanism=action.mechanism,
            dimension=action.dimension,
            path=action.path,
            owner=action.owner,
            assignee=action.assignee,
            verifier=action.verifier,
            start_date=today,
            due_date=today + timedelta(days=length),
            description=criterion.note,
            acceptance_criteria=action.acceptance_criteria,
            test_setting=action.test_setting,
            created_by=user,
        )
        item._history_user = user
        item.save()
        item.controls.set(action.controls.all())
        created.append(item)
    return created


def notify_post_action(action):
    """وقتی هیچ اقدام بازی در طرح نمانده: مالک ریسک و اعضای GRC برای ثبت ارزیابی پس از اقدام اعلان می‌گیرند."""
    plan = action.plan
    if plan.actions.exclude(status=ST.VERIFIED).exists():
        return []
    risk = plan.risk
    recipients = set(User.objects.filter(is_active=True, groups__name=Role.GRC_MEMBER))
    if risk.owner_id and risk.owner.is_active:
        recipients.add(risk.owner)
    message = (
        f"همه‌ی اقدام‌های طرح مواجهه‌ی {risk.code} تأیید شد. ریسک بسته نمی‌شود و به پایش فعال می‌رود؛ ارزیابی جاری "
        "تازه با شواهد واقعی، نه برآورد طرح، ثبت شود."
    )
    sent = []
    for user in recipients:
        _, created = MonitoringNotice.objects.get_or_create(
            recipient=user,
            event_key=f"post-action:{plan.pk}",
            defaults={"risk": risk, "message": message, "href": risk.get_absolute_url()},
        )
        if created:
            sent.append(user)
    return sent


@transaction.atomic
def record_verification(action, user, decision, note, follow_up=False):
    """تصمیم تأییدکننده: «verify» یا «fail» با توضیح. برمی‌گرداند (اقدام‌های پیگیری، گیرندگان اعلان)."""
    action = TreatmentAction.objects.select_for_update().select_related("plan__risk").get(pk=action.pk)
    if decision not in DECISIONS:
        raise PlanError(["تصمیم تأییدکننده «تأییدشده» یا «ناموفق» است."])
    if not can_decide(user, action):
        raise PlanError(["نتیجه را فقط تأییدکننده‌ی همین اقدام وقتی «آماده‌ی آزمون» است ثبت می‌کند."])
    if decision == "verify":
        problems = verify_problems(action)
        if problems:
            raise PlanError(problems)
    perform_move(action, user, decision, note)
    if decision != "verify":
        return [], []
    # اعلان پیش از ساختن پیگیری: معیار خارج از دامنه نتیجه‌ی این طرح را مخدوش نمی‌کند و جلوی ارزیابی را نمی‌گیرد.
    notified = notify_post_action(action)
    follow_ups = create_follow_ups(action, user) if follow_up else []
    return follow_ups, notified
