"""کنترل کیفیت ارزیابی (جواب س۳۳، س۵۲ و س۶۲): ارزیاب پیش‌نویس را برای کنترل کیفیت می‌فرستد؛ عضو GRC دیگری که
ارزیاب همان پرونده نیست تأیید می‌کند، به ارزیاب برمی‌گرداند یا اختلاف را به کارگروه امنیت ارجاع می‌دهد؛ و عضو
کارگروه یا عضو GRC‌ای که طرف اختلاف نیست تصمیم کارگروه را با تاریخ جلسه ثبت می‌کند. تأیید نتیجه را با موتور محاسبه حساب و ذخیره می‌کند و ارزیابی
را قفل می‌کند."""

from django.db import transaction
from django.utils import timezone

from apps.accounts.roles import Role

from .models import Assessment, AssessmentReview
from .permissions import can_edit_assessment
from .results import compute, submission_problems
from .services import band_list, likelihood_snapshot

S = Assessment.Status
A = AssessmentReview.Action
REVIEW_ACTIONS = [A.APPROVE, A.RETURN, A.REFER]
REFERRAL_ACTIONS = [A.WORKGROUP_APPROVE, A.WORKGROUP_RETURN]
# نتیجه‌ی کارگروه را هم اعضای کارگروه ثبت می‌کنند و هم عضو GRC (جواب س۵۲ و س۶۲)، به شرط اینکه طرف همان اختلاف
# نباشند. مدیر سامانه هم با همین قید می‌تواند.
REFERRAL_ROLES = [Role.SECURITY_WORKGROUP, Role.GRC_MEMBER]


class ReviewError(Exception):
    def __init__(self, problems):
        super().__init__("؛ ".join(problems))
        self.problems = problems


def assessor_ids(assessment):
    """ارزیاب‌های پرونده: ثبت‌کننده‌ی ارزیابی و هر کس که آن را برای کنترل کیفیت فرستاده است."""
    submitters = assessment.reviews.filter(action=A.SUBMIT).values_list("created_by_id", flat=True)
    return {assessment.created_by_id, *submitters}


def dispute_party_ids(assessment):
    """طرف‌های اختلافی که به کارگروه رفته: ارزیاب‌ها و کنترل‌کننده‌ای که ارجاع داده است."""
    referrers = assessment.reviews.filter(action=A.REFER).values_list("created_by_id", flat=True)
    return assessor_ids(assessment) | set(referrers)


def can_submit(user, assessment):
    return can_edit_assessment(user, assessment)


def can_review(user, assessment):
    """کنترل‌کننده عضو GRC دیگری است که ارزیاب همان پرونده نیست؛ مدیر سامانه هم همین قید را دارد."""
    return (
        assessment.status == S.IN_QC
        and assessment.risk.is_active
        and (user.is_system_admin or user.has_role(Role.GRC_MEMBER))
        and user.pk not in assessor_ids(assessment)
    )


def can_decide_referral(user, assessment):
    return (
        assessment.status == S.REFERRED
        and assessment.risk.is_active
        and (user.is_system_admin or user.has_role(*REFERRAL_ROLES))
        and user.pk not in dispute_party_ids(assessment)
    )


def _log(assessment, user, action, notes="", meeting_date=None):
    AssessmentReview.objects.create(
        assessment=assessment, action=action, notes=notes.strip(), meeting_date=meeting_date, created_by=user
    )


def _set_status(assessment, status, user):
    assessment.status = status
    assessment._history_user = user
    assessment.save()


@transaction.atomic
def submit(assessment, user, notes=""):
    if not can_submit(user, assessment):
        raise ReviewError(["این ارزیابی الان برای کنترل کیفیت فرستاده نمی‌شود."])
    problems = submission_problems(assessment)
    if problems:
        raise ReviewError(problems)
    _set_status(assessment, S.IN_QC, user)
    _log(assessment, user, A.SUBMIT, notes)


@transaction.atomic
def review(assessment, user, action, notes=""):
    if not can_review(user, assessment):
        raise ReviewError(["کنترل کیفیت این ارزیابی با عضو GRC دیگری است که ارزیاب همین پرونده نیست."])
    if action not in REVIEW_ACTIONS:
        raise ReviewError(["کار کنترل کیفیت شناخته نشد."])
    if action in (A.RETURN, A.REFER) and not notes.strip():
        raise ReviewError(["برای برگشت یا ارجاع، اختلاف‌ها را بنویسید."])
    if action == A.APPROVE:
        _approve(assessment, user)
    else:
        _set_status(assessment, S.DRAFT if action == A.RETURN else S.REFERRED, user)
    _log(assessment, user, action, notes)


@transaction.atomic
def decide_referral(assessment, user, action, notes, meeting_date):
    if not can_decide_referral(user, assessment):
        raise ReviewError(["تصمیم کارگروه را عضو کارگروه امنیت یا عضو GRC دیگری ثبت می‌کند که طرف این اختلاف نیست."])
    if action not in REFERRAL_ACTIONS:
        raise ReviewError(["تصمیم کارگروه شناخته نشد."])
    problems = []
    if not meeting_date:
        problems.append("تاریخ جلسه‌ی کارگروه را بنویسید.")
    if not notes.strip():
        problems.append("تصمیم کارگروه را بنویسید.")
    if problems:
        raise ReviewError(problems)
    if action == A.WORKGROUP_APPROVE:
        _approve(assessment, user)
    else:
        _set_status(assessment, S.DRAFT, user)
    _log(assessment, user, action, notes, meeting_date)


def _approve(assessment, user):
    """نتیجه را با موتور محاسبه، نسخه‌ی روش ارزیابی و E کنترل‌ها در همین روز حساب و ذخیره می‌کند. قاعده‌های
    مسدودکننده دوباره چک می‌شوند، چون از زمان ارسال چیزی مثل ریسک یا شاهد ممکن است عوض شده باشد."""
    computation = compute(assessment, on=timezone.localdate())
    problems = submission_problems(assessment, computation)
    if problems:
        raise ReviewError(problems)
    outcome = computation.outcome
    for name, band in [
        ("b", outcome.b),
        ("likelihood", outcome.likelihood),
        ("impact", outcome.impact),
        ("score", outcome.score),
    ]:
        setattr(assessment, f"{name}_low", band.low if band else None)
        setattr(assessment, f"{name}_high", band.high if band else None)
    assessment.base_level = outcome.base_level
    assessment.decision_level = outcome.decision_level
    assessment.escalation_reasons = outcome.escalation_reasons
    assessment.incomplete_reasons = outcome.incomplete_reasons
    assessment.confidence = outcome.confidence
    assessment.out_of_acceptance_authority = outcome.out_of_acceptance_authority
    assessment.acceptance_restricted = outcome.acceptance_restricted
    assessment.result_detail = {
        "on": timezone.localdate().isoformat(),
        "paths": likelihood_snapshot(computation.likelihood),
        "b": band_list(outcome.b),
    }
    risk = assessment.risk
    assessment.scope_snapshot = {
        "risk_title": risk.title,
        "service_id": risk.service_id,
        "service": str(risk.service) if risk.service_id else "",
        "owner_id": risk.owner_id,
        "customers": [{"id": customer.pk, "name": customer.name}
                      for customer in computation.impacts.stakeholders if customer is not None],
        "description": risk.description,
        "scope": risk.scope,
        "initiator": risk.initiator,
        "count_unit": risk.count_unit,
        # دسته پیش از ارزیابی اجباری است؛ ریسک قدیمی بی‌دسته هم خطا نمی‌دهد.
        "category": {
            "id": risk.category_id,
            "code": risk.category.code if risk.category_id else "",
            "name": risk.category.name if risk.category_id else "بدون دسته",
        },
        "horizon_months": assessment.horizon_months,
    }
    assessment.approved_at = timezone.now()
    _set_status(assessment, S.APPROVED, user)
