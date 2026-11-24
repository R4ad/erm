"""اقدام کارشناس ریسک روی ریسک‌های پیشنهادی (فریم‌های 12c و 12d): ذخیره‌ی ویرایش، تأیید و ارسال به آنالیز، رد با دلیل،
گزینه‌های فرم ویرایش و مقایسه با ریسک مشابه رجیستر. اعتبارسنجی بدنه دستی است، مثل ذخیره‌ی ویزارد پاسخنامه."""

from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import status as http
from rest_framework.response import Response as ApiResponse

from apps.organization.models import OrgUnit
from apps.questionnaires.answers import EMPTY_PATH, PATH_LIMIT, TEXT_LIMIT, too_long
from apps.questionnaires.models import PendingRisk
from apps.questionnaires.services import (
    OWNER_REQUIRED,
    REQUIRED_MESSAGES,
    DecisionError,
    approve,
    reject,
    save_draft,
)
from apps.risks.identification import pick_owner, unit_managers
from apps.risks.models import RiskCategory
from apps.risks.permissions import visible_risks

from . import formatting as fmt
from .base import ApiView
from .response_review import draft_payload, get_response, require_reviewer, reviewable, visible_similar

LIMITS = {
    "title": PendingRisk.TITLE_LIMIT,
    "initiating_factor": TEXT_LIMIT,
    "target_event": TEXT_LIMIT,
    "impact": TEXT_LIMIT,
}


def get_draft(user, pk):
    require_reviewer(user)
    return get_object_or_404(PendingRisk.objects.filter(response__in=reviewable(user)), pk=pk)


def pick(queryset, value, errors, name, message):
    """شناسه‌ی یک گزینه یا None؛ شناسه‌ای که در گزینه‌ها نیست خطای همان فیلد است."""
    if value in (None, ""):
        return None
    found = queryset.filter(pk=value).first() if str(value).isdigit() else None
    if found is None:
        errors[name] = [message]
    return found


def clean_changes(draft, data):
    """بدنه‌ی فرم 12d: متن‌ها اجباری با سقف طول، متن مسیرها با همان شماره‌ها، دسته اختیاری، واحد مالک اجباری و شخص
    اختیاری. فیلدی که در بدنه نیامده دست نمی‌خورد."""
    if not isinstance(data, dict):
        raise DecisionError("بدنه‌ی درخواست نادرست است.")
    errors, changes = {}, {}
    for name, message in REQUIRED_MESSAGES.items():
        if name not in data:
            continue
        value = data[name] if isinstance(data[name], str) else ""
        value = value.strip()
        if not value:
            errors[name] = [message]
        elif len(value) > LIMITS[name]:
            errors[name] = [too_long(LIMITS[name])]
        changes[name] = value
    if "paths" in data:
        numbers = {item["number"] for item in draft.paths}
        items = data["paths"] if isinstance(data["paths"], list) else []
        texts = {}
        for item in items:
            if isinstance(item, dict) and item.get("number") in numbers and isinstance(item.get("text"), str):
                texts[item["number"]] = item["text"].strip()
        for number in sorted(numbers):
            text = texts.get(number, "")
            if not text:
                errors[f"paths.{number}"] = [EMPTY_PATH]
            elif len(text) > PATH_LIMIT:
                errors[f"paths.{number}"] = [too_long(PATH_LIMIT)]
        changes["paths"] = [{"number": number, "text": text} for number, text in texts.items()]
    if "category" in data:
        changes["category"] = pick(
            RiskCategory.objects.filter(is_active=True), data["category"], errors, "category", "این دسته فعال نیست."
        )
    if "owner_unit" in data:
        unit = pick(OrgUnit.objects.filter(is_active=True), data["owner_unit"], errors, "owner_unit", "این واحد فعال نیست.")
        if unit is None and "owner_unit" not in errors:
            errors["owner_unit"] = [OWNER_REQUIRED]
        changes["owner_unit"] = unit
    if "owner" in data:
        changes["owner"] = pick(
            get_user_model().objects.filter(is_active=True), data["owner"], errors, "owner", "این کاربر فعال نیست."
        )
    if errors:
        raise DecisionError("ریسک پیشنهادی کامل نیست.", errors)
    return changes


def failure(error):
    body = {"errors": error.errors}
    if error.message:
        body["message"] = error.message
    code = http.HTTP_400_BAD_REQUEST if error.errors else http.HTTP_409_CONFLICT
    return ApiResponse(body, status=code)


def fresh(user, draft):
    """پیش‌نویس ذخیره‌شده با همان شکل فهرست 12c."""
    draft = PendingRisk.objects.select_related(
        "consequence__risk_instance", "category", "owner_unit", "owner", "risk", "decided_by"
    ).get(pk=draft.pk)
    return draft_payload(draft, visible_similar(user, [draft]))


class PendingRiskView(ApiView):
    """PATCH «ذخیره‌ی پیش‌نویس» فرم 12d."""

    def patch(self, request, pk):
        draft = get_draft(request.user, pk)
        try:
            saved = save_draft(draft, request.user, clean_changes(draft, request.data))
        except DecisionError as error:
            return failure(error)
        return ApiResponse(fresh(request.user, saved))


class PendingRiskApproveView(ApiView):
    """POST تأیید و ارسال به آنالیز؛ بدنه‌ی اختیاری همان فرم 12d برای «ذخیره و تأیید» است."""

    def post(self, request, pk):
        draft = get_draft(request.user, pk)
        try:
            changes = clean_changes(draft, request.data) if request.data else None
            approved = approve(draft, request.user, changes)
        except DecisionError as error:
            return failure(error)
        return ApiResponse(fresh(request.user, approved))


class PendingRiskRejectView(ApiView):
    """POST رد با دلیل اجباری."""

    def post(self, request, pk):
        draft = get_draft(request.user, pk)
        reason = request.data.get("reason") if isinstance(request.data, dict) else ""
        try:
            rejected = reject(draft, request.user, reason if isinstance(reason, str) else "")
        except DecisionError as error:
            return failure(error)
        return ApiResponse(fresh(request.user, rejected))


class DecisionOptionsView(ApiView):
    """GET گزینه‌های فرم 12d: دسته‌های فعال، واحدهای فعال با مدیر پیش‌فرض هر کدام و کاربران فعال برای مالک شخص."""

    def get(self, request, pk):
        require_reviewer(request.user)
        response = get_response(request.user, pk)
        units = list(OrgUnit.objects.filter(is_active=True).order_by("name"))
        managers = unit_managers([unit.pk for unit in units])
        people = get_user_model().objects.filter(is_active=True).order_by("first_name", "last_name", "username")
        return ApiResponse(
            {
                "categories": [
                    {"id": item.pk, "name": item.name}
                    for item in RiskCategory.objects.filter(is_active=True).order_by("code")
                ],
                "units": [
                    {
                        "id": unit.pk,
                        "name": unit.name,
                        "owner": getattr(pick_owner(managers.get(unit.pk, []), response.respondent), "pk", None),
                    }
                    for unit in units
                ],
                "people": [fmt.person(user) for user in people],
                "respondent_unit": response.org_unit_id,
            }
        )


def existing_values(risk):
    """همان ردیف‌های 12c برای ریسک رجیستر: از فیلدهای خود ریسک، و جایی که خالی است از ورودی شناسایی یا سناریو."""
    intake = risk.intake or {}
    snapshot = risk.scenario_snapshot or {}
    return {
        "title": risk.title,
        "initiating_factor": risk.initiator or intake.get("conditions") or snapshot.get("conditions") or "",
        "paths": [line.strip() for line in risk.realization_path.splitlines() if line.strip()],
        "target_event": intake.get("event") or snapshot.get("event") or "",
        "impact": intake.get("harm") or snapshot.get("consequence") or "",
        "category": risk.category.name if risk.category_id else "",
    }


class PendingRiskSimilarView(ApiView):
    """GET مقایسه‌ی ریسک پیشنهادی با یکی از ریسک‌های مشابهش (?risk=شناسه). ادغام در این نسخه نیست."""

    def get(self, request, pk):
        draft = get_draft(request.user, pk)
        match = next((item for item in draft.similar_risks if str(item["id"]) == request.query_params.get("risk")), None)
        if match is None:
            return ApiResponse({"detail": "این ریسک در فهرست ریسک‌های مشابه نیست."}, status=http.HTTP_404_NOT_FOUND)
        risk = get_object_or_404(visible_risks(request.user).select_related("category"), pk=match["id"])
        return ApiResponse(
            {
                "percent": round(match["similarity"] * 100),
                "suggested": {
                    "title": draft.title,
                    "initiating_factor": draft.initiating_factor,
                    "paths": [item["text"] for item in draft.paths],
                    "target_event": draft.target_event,
                    "impact": draft.impact,
                    "category": draft.category.name if draft.category_id else "",
                },
                "existing": {
                    "id": risk.pk,
                    "code": risk.code,
                    "route": f"/risks/{risk.pk}",
                    "status": fmt.choice(risk, "status"),
                    **existing_values(risk),
                },
            }
        )

