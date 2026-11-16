"""پذیرش زمان‌دار و امضاهای صاحبان اختیار (بخش ۱۹ و ۲۵ سند v5).

- مالک ریسک همیشه خودش امضا می‌کند (جواب س۳۶). کنار او، سطح متوسط مجوز مدیر همان واحد ریسک را می‌خواهد (جواب س۱۳)
  و بالا و بحرانی تصمیم کمیته امنیت را که کاربر نقش کمیته با شماره یا تاریخ صورت‌جلسه ثبت می‌کند (جواب س۶۴).
- پذیرش با ارزیابی ناقص یا اطمینان کم «عادی» نیست: مهلت جمع‌آوری شاهد و مجوز موقت مقام بالاتر می‌خواهد، پس سطح
  پایین هم مجوز مدیر واحد می‌گیرد.
- عبور از حد تحمل مشتری اختیار پذیرش عمومی را محدود می‌کند و ارزیابی ناقص خدمت حیاتی تصمیم موقت مدیریت ارشد
  می‌خواهد (بخش ۷). مجوز مدیریت ارشد را عضو GRC با شماره، تاریخ و فایل نامه ثبت می‌کند (جواب س۵).
- منع الزام‌آور ریسک را «خارج از اختیار پذیرش» می‌کند و پذیرشی ثبت نمی‌شود.
- متن تصمیم فقط بعد از همه‌ی امضاها نوشته می‌شود؛ سکوت یا تأخیر پذیرش نیست و تمدید خودکار نداریم.
"""

import os

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.accounts.delegation import acts_for, current
from apps.accounts.roles import Role
from apps.assessments.services import decision_assessment
from apps.core.choices import Confidence
from apps.core.jalali import to_jalali
from apps.core.models import Attachment
from apps.methodology.models import RiskLevel
from apps.risks.models import Risk
from apps.workcalendar.workdays import add_period

from .models import AcceptanceSignature, MonitoringNotice, RiskAcceptance, TreatmentPlan
from .permissions import EXECUTION_STATUSES, can_edit_plans
from .services import PlanError, current_plan, plan_required

AUTH = AcceptanceSignature.Authority
STATUS = RiskAcceptance.Status
# پذیرش تصمیم یک ریسک ارزیابی‌شده است: کنار طرح مواجهه، در اجرای آن یا در بازبینی.
ACCEPTANCE_STATUSES = [Risk.Status.TREATMENT_PLAN, *EXECUTION_STATUSES]
OPEN_STATUSES = [STATUS.DRAFT, STATUS.PENDING]


def acceptance_cap(level, start):
    """آخرین روز مجاز پایان اعتبار: سقف اعتبار پذیرش سطح در جدول بخش ۱۹ (مثلاً بالا ۹۰ روز) از روز آغاز."""
    return add_period(start, level.acceptance_value, level.acceptance_unit)


def is_non_normal(assessment):
    """پذیرش با اطمینان کم، محدودیت نامعلوم یا پیامد حیاتی ناقص عادی نیست (بخش ۱۹)."""
    return assessment.is_incomplete or assessment.confidence == Confidence.LOW


def is_temporary(level):
    """برای بالا و بحرانی پذیرش فقط موقت و استثنایی و کنار طرح مواجهه است."""
    return plan_required(level)


def authority_reasons(assessment, risk):
    """صاحبان اختیاری که این پذیرش امضایشان را می‌خواهد، هر کدام با دلیل، به ترتیب امضا."""
    level = assessment.decision_level
    rows = [(AUTH.OWNER, "پاسخ‌گوی ریسک؛ مجوز مقام بالاتر جای امضای او را نمی‌گیرد (بخش ۱۹).")]
    if level.co_approver == RiskLevel.CoApprover.SECURITY_COMMITTEE:
        rows.append((AUTH.COMMITTEE, f"سطح «{level}»: مجوز کمیته امنیت (بخش ۱۹)."))
    elif level.co_approver == RiskLevel.CoApprover.UPPER_MANAGER:
        rows.append((AUTH.UNIT_MANAGER, f"سطح «{level}»: مجوز مدیر واحد ریسک (بخش ۱۹ و جواب س۱۳)."))
    elif is_non_normal(assessment):
        rows.append((AUTH.UNIT_MANAGER, "پذیرش غیرعادی: مجوز موقت مقام بالاتر (بخش ۱۹)."))
    senior = []
    if assessment.customer_tolerance_exceeded:
        senior.append("عبور از حد تحمل مشتری اختیار پذیرش عمومی را محدود می‌کند (بخش ۱۸)")
    if assessment.is_incomplete and risk.service_id and risk.service.is_critical:
        senior.append("ارزیابی ناقص خدمت حیاتی تصمیم موقت در سطح مدیریت ارشد می‌خواهد (بخش ۷)")
    if senior:
        rows.append((AUTH.SENIOR_MANAGEMENT, "؛ ".join(senior) + "."))
    return rows


def required_authorities(acceptance):
    return [authority for authority, _ in authority_reasons(acceptance.assessment, acceptance.risk)]


def unit_managers(risk):
    """مدیران خود واحد ریسک، نه واحد بالادست (جواب س۱۳)، جز مالک ریسک که امضای خودش را جدا می‌دهد."""
    return (
        get_user_model()
        .objects.filter(is_active=True, managed_units=risk.org_unit_id)
        .exclude(pk=risk.owner_id)
        .order_by("first_name", "last_name", "username")
    )


def risk_problems(risk, assessment=None):
    """چیزهایی که ثبت یا امضای هر پذیرشی را برای این ریسک می‌بندند."""
    problems = []
    if not risk.is_active or risk.status not in ACCEPTANCE_STATUSES:
        problems.append("پذیرش وقتی ثبت می‌شود که ریسک «برنامه‌ی درمان»، «در اجرای درمان» یا «در بازبینی» است.")
    base = decision_assessment(risk)
    if base is None:
        problems.append("ارزیابی جاری تأییدشده‌ای با سطح تصمیم برای این دور ارزیابی ریسک نیست.")
        return problems
    if assessment is not None and assessment.pk != base.pk:
        problems.append(
            f"ارزیابی {assessment.code} دیگر ارزیابی تصمیم این ریسک نیست؛ پذیرش تازه با {base.code} لازم است."
        )
        return problems
    if base.binding_prohibition:
        problems.append(
            f"ارزیابی {base.code} نشان «منع الزام‌آور» دارد و ریسک خارج از اختیار پذیرش است؛ پذیرش داخلی مجوز نقض "
            "الزام نیست (بخش ۱۸)."
        )
    if is_temporary(base.decision_level):
        plan = current_plan(risk)
        if plan is None or plan.option == TreatmentPlan.Option.ACCEPT:
            problems.append(
                f"برای ریسک «{base.decision_level}» طرح مواجهه الزامی است؛ پذیرش موقت و استثنایی کنار طرح ثبت می‌شود "
                "(بخش ۱۹)."
            )
    return problems


def creation_problems(risk):
    problems = risk_problems(risk)
    base = decision_assessment(risk)
    if base is not None:
        open_one = RiskAcceptance.objects.filter(assessment=base, status__in=OPEN_STATUSES).first()
        if open_one:
            problems.append(f"پذیرش {open_one.code} برای همین ارزیابی هنوز باز است.")
    return problems


def acceptance_problems(acceptance):
    """قاعده‌هایی که ارسال برای امضا و هر تأیید را می‌بندند (بخش ۱۹ و قواعد مسدودکننده‌ی بخش ۲۴)."""
    problems = risk_problems(acceptance.risk, acceptance.assessment)
    level = acceptance.level
    cap = acceptance_cap(level, acceptance.start_date)
    if acceptance.end_date > cap:
        problems.append(
            f"پایان اعتبار از سقف سطح «{level}» ({level.acceptance_value} {level.get_acceptance_unit_display()}، تا "
            f"{to_jalali(cap)}) دیرتر است."
        )
    if acceptance.end_date < timezone.localdate():
        problems.append("پایان اعتبار گذشته است.")
    if is_non_normal(acceptance.assessment) and not acceptance.evidence_due:
        problems.append("پذیرش غیرعادی است (ارزیابی ناقص یا اطمینان کم) و مهلت جمع‌آوری شاهد می‌خواهد (بخش ۱۹).")
    if AUTH.UNIT_MANAGER in required_authorities(acceptance) and not unit_managers(acceptance.risk).exists():
        problems.append(
            f"واحد «{acceptance.risk.org_unit}» جز مالک ریسک مدیر فعالی در سامانه ندارد تا مجوز بدهد؛ مدیر سامانه "
            "مدیر واحد را تعیین می‌کند."
        )
    if not acceptance.follow_up_by.is_active:
        problems.append("مسئول پیگیری غیرفعال است.")
    return problems


@transaction.atomic
def create_acceptance(acceptance, risk, user):
    """acceptance از فرم می‌آید. ارزیابی و طرح را سامانه تعیین می‌کند."""
    problems = creation_problems(risk)
    if problems:
        raise PlanError(problems)
    acceptance.risk = risk
    acceptance.assessment = decision_assessment(risk)
    acceptance.plan = current_plan(risk)
    acceptance.created_by = user
    acceptance._history_user = user
    acceptance.save()
    return acceptance


@transaction.atomic
def submit_acceptance(acceptance, user):
    if not can_edit_plans(user) or acceptance.status != STATUS.DRAFT:
        raise PlanError(["فقط پیش‌نویس پذیرش، به دست عضو GRC، برای امضا فرستاده می‌شود."])
    problems = acceptance_problems(acceptance)
    if problems:
        raise PlanError(problems)
    acceptance.status = STATUS.PENDING
    acceptance.submitted_at = timezone.now()
    acceptance._history_user = user
    acceptance.save()


def signature_of(acceptance, authority):
    return next((item for item in acceptance.signatures.all() if item.authority == authority), None)


def can_sign(user, acceptance, authority):
    if acceptance.status != STATUS.PENDING or not acceptance.risk.is_active:
        return False
    if authority not in required_authorities(acceptance) or signature_of(acceptance, authority):
        return False
    owner_id = acceptance.risk.owner_id
    if authority == AUTH.OWNER:
        # جانشین تفویض برقرار تا سطح تفویض به جای مالک امضا می‌کند (فیگما ۲۹)
        return user.pk == owner_id or acts_for(user, acceptance.risk.owner, acceptance.assessment.decision_level)
    owner_signature = signature_of(acceptance, AUTH.OWNER)
    if user.pk == owner_id or (owner_signature and owner_signature.created_by_id == user.pk):
        return False
    if authority == AUTH.UNIT_MANAGER:
        return unit_managers(acceptance.risk).filter(pk=user.pk).exists()
    if authority == AUTH.COMMITTEE:
        return user.has_role(Role.SECURITY_COMMITTEE)
    return can_edit_plans(user)  # مدیریت ارشد: عضو GRC تصمیم را با نامه ثبت می‌کند (جواب س۵)


def copy_to_owner(acceptance, signature):
    """رونوشت تصمیم جانشین برای مالک، اگر تفویض آن را خواسته است."""
    owner = acceptance.risk.owner
    found = current(owner)
    if found and found.copy_owner:
        MonitoringNotice.objects.get_or_create(
            recipient=owner,
            event_key=f"delegate-sign-{signature.pk}",
            defaults={
                "risk": acceptance.risk,
                "message": f"{signature.created_by.get_full_name() or signature.created_by.username} به جانشینی شما "
                f"پذیرش {acceptance.code} را {signature.get_decision_display()} کرد.",
                "href": acceptance.get_absolute_url(),
            },
        )


def signable_authorities(user, acceptance):
    return [authority for authority in required_authorities(acceptance) if can_sign(user, acceptance, authority)]


def decision_text(acceptance):
    """عبارت صریح تصمیم بخش ۲۵."""
    assessment = acceptance.assessment
    return (
        f"ریسک باقیمانده‌ی {acceptance.risk.code} بر اساس ارزیابی {assessment.code} (روش نسخه‌ی "
        f"{assessment.method_version.number}، سطح {assessment.decision_level}) در دامنه‌ی «{acceptance.scope.strip()}» "
        f"تا تاریخ {to_jalali(acceptance.end_date)} با شروط «{acceptance.conditions.strip()}» پذیرفته می‌شود."
    )


def _save_letter(acceptance, user, upload, reference):
    attachment = Attachment(
        content_object=acceptance,
        original_name=os.path.basename(upload.name)[:255],
        size=upload.size,
        description=f"نامه‌ی مدیریت ارشد شماره‌ی {reference}"[:300],
        created_by=user,
    )
    attachment.file.save(upload.name, upload, save=False)
    attachment.save()
    return attachment


@transaction.atomic
def sign_acceptance(acceptance, user, authority, decision, note="", reference="", reference_date=None, letter=None):
    """یک امضا. رد پذیرش را می‌بندد؛ با آخرین تأیید پذیرش معتبر می‌شود و متن تصمیم نوشته می‌شود."""
    acceptance = RiskAcceptance.objects.select_for_update().get(pk=acceptance.pk)
    if not can_sign(user, acceptance, authority):
        raise PlanError(["این امضا برای شما یا در وضعیت فعلی پذیرش ممکن نیست."])
    note, reference = note.strip(), reference.strip()
    problems = []
    if decision == AcceptanceSignature.Decision.REJECT and not note:
        problems.append("برای رد پذیرش دلیل را بنویسید.")
    if reference_date and reference_date > timezone.localdate():
        problems.append("تاریخ صورت‌جلسه یا نامه نمی‌تواند بعد از امروز باشد.")
    if authority == AUTH.COMMITTEE and not (reference or reference_date):
        problems.append("شماره یا تاریخ صورت‌جلسه‌ی کمیته را بنویسید (جواب س۶۴).")
    if authority == AUTH.SENIOR_MANAGEMENT and not (reference and reference_date and letter):
        problems.append("شماره، تاریخ و فایل نامه‌ی مدیریت ارشد لازم است (جواب س۵).")
    if decision == AcceptanceSignature.Decision.APPROVE:
        problems += acceptance_problems(acceptance)
    if problems:
        raise PlanError(problems)
    signature = AcceptanceSignature.objects.create(
        acceptance=acceptance,
        authority=authority,
        decision=decision,
        note=note,
        reference=reference,
        reference_date=reference_date,
        letter=_save_letter(acceptance, user, letter, reference) if letter else None,
        created_by=user,
    )
    acceptance._history_user = user
    if authority == AUTH.OWNER and user.pk != acceptance.risk.owner_id:
        copy_to_owner(acceptance, signature)
    if not signature.is_approval:
        acceptance.status = STATUS.REJECTED
        acceptance.closed_at = timezone.now()
        acceptance.closed_by = user
        acceptance.closed_reason = f"{signature.get_authority_display()}: {note}"
        acceptance.save()
    elif all(signature_of(acceptance, item) for item in required_authorities(acceptance)):
        acceptance.status = STATUS.ACTIVE
        acceptance.decided_at = timezone.now()
        acceptance.decision_text = decision_text(acceptance)
        acceptance.save()
    return acceptance


def can_revoke(user, acceptance):
    """پذیرش معتبر یا منتظر امضا را عضو GRC، مدیر سامانه یا مالک ریسک با دلیل لغو می‌کند، مثلاً وقتی شرطی شکسته
    شده است. لغو، پذیرش را به وضعیت قبل برنمی‌گرداند و پذیرش تازه رکورد تازه است."""
    return acceptance.status in (STATUS.PENDING, STATUS.ACTIVE) and (
        can_edit_plans(user) or user.pk == acceptance.risk.owner_id
    )


@transaction.atomic
def revoke_acceptance(acceptance, user, reason):
    if not can_revoke(user, acceptance):
        raise PlanError(["این پذیرش را شما یا در وضعیت فعلی‌اش نمی‌توانید لغو کنید."])
    reason = reason.strip()
    if not reason:
        raise PlanError(["دلیل لغو را بنویسید."])
    acceptance.status = STATUS.REVOKED
    acceptance.closed_at = timezone.now()
    acceptance.closed_by = user
    acceptance.closed_reason = reason
    acceptance._history_user = user
    acceptance.save()


def valid_acceptance(assessment):
    """پذیرش معتبر و منقضی‌نشده‌ی یک ارزیابی، اگر هست."""
    return (
        RiskAcceptance.objects.filter(assessment=assessment, status=STATUS.ACTIVE, end_date__gte=timezone.localdate())
        .order_by("-end_date")
        .first()
    )


def acceptances_to_sign(user):
    """پذیرش‌های منتظر امضایی که یکی از امضاهای باقیمانده‌شان با همین کاربر است."""
    pending = RiskAcceptance.objects.filter(status=STATUS.PENDING).select_related(
        "risk__owner", "risk__service", "assessment__decision_level"
    )
    return [item for item in pending.prefetch_related("signatures") if signable_authorities(user, item)]
