"""ثبت دستی ریسک در رابط React: شش پرسش جلسه‌ی شناسایی با الگوی ثبت سناریو، بازبینی با شاهد و فایل شاهد، پیش‌نویس
و ورودی‌های اخیر. عضو GRC و مدیر سامانه اینجا ریسک ثبت می‌کنند. ساختن ریسک از همان فرم و services در
apps/risks/identification.py می‌گذرد."""

import json

from django.conf import settings
from django.db import transaction
from django.db.models import Min, Q
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.response import Response as ApiResponse

from apps.catalog.models import Commitment, Service
from apps.risks.identification import (
    INTAKE_FIELDS,
    SCENARIO_PARTS,
    TEXT_LIMIT,
    IdentificationForm,
    can_answer,
    clean_evidence_file,
    draft_attachments,
    identify_units,
    pick_owner,
    save_draft,
    split_target,
    submit_identification,
    unit_managers,
    visible_drafts,
)
from apps.risks.models import Risk, RiskCategory
from apps.risks.permissions import can_edit_register, visible_evidence, visible_risks

from . import formatting as fmt
from .base import ApiView

S = Risk.Status
SHORT_SOURCE = {Risk.Source.PERIODIC: "ارزیابی دوره‌ای"}
# مرحله‌ی هر ورودی در گردش کار شناسایی: پیش‌نویس ← شناسایی‌شده ← در ارزیابی، و برگشت برای تکمیل. پیش‌نویس هنوز
# ریسک نیست (IdentificationDraft)؛ بقیه وضعیت ریسک‌اند.
DRAFT_STAGE = {"value": "draft", "label": "پیش‌نویس"}
STAGES = {
    S.ANALYSIS: ("identified", "شناسایی‌شده", "info"),
    S.REGISTERED: ("identified", "شناسایی‌شده", "info"),
    S.QUESTIONS: ("returned", "بازگشت برای تکمیل", "warning"),
    S.SUBMITTED: ("assessment", "در ارزیابی", "brand"),
    S.ASSESSMENT: ("assessment", "در ارزیابی", "brand"),
}
RECENT = 5


def source_label(value):
    if not value:
        return ""
    return SHORT_SOURCE.get(value, Risk.Source(value).label)


class RowLookup:
    """دسته، خدمت، تعهد و مدیران واحد ردیف‌های ورودی، با یک پرس‌وجو برای هر کدام؛ صف عضو GRC سقف ندارد و نباید
    برای هر ردیف پرس‌وجو بزند."""

    def __init__(self, drafts):
        targets = [split_target(draft.data.get("target")) for draft in drafts]
        self.categories = RiskCategory.objects.in_bulk(
            [draft.data["category"] for draft in drafts if draft.data.get("category")]
        )
        self.services = Service.objects.in_bulk([pk for pk, _ in targets if pk])
        self.commitments = Commitment.objects.select_related("customer").in_bulk([pk for _, pk in targets if pk])
        self.managers = unit_managers({draft.org_unit_id for draft in drafts if draft.org_unit_id})

    def category(self, data):
        return self.categories.get(data["category"]) if data.get("category") else None

    def target(self, value):
        """نام خدمت و مشتری گزینه‌ی پرسش اول، یا (None, None) بی خدمت."""
        service_id, commitment_id = split_target(value)
        service = self.services.get(service_id)
        if service is None:
            return None, None
        commitment = self.commitments.get(commitment_id)
        return service.name, commitment.customer.name if commitment and commitment.customer_id else "همه"

    def owner(self, draft):
        """مالک ریسکی که از واحد ورودی ساخته می‌شود، با همان قاعده‌ی unit_owner."""
        return pick_owner(self.managers.get(draft.org_unit_id, []), draft.created_by) if draft.org_unit_id else None


def draft_row(draft, lookup):
    """ردیف پیش‌نویسی که هنوز ریسک نشده. بی خدمت انتخاب‌شده، ستون خدمت موضوعی را نشان می‌دهد که ثبت‌کننده نوشته."""
    data = draft.data
    category = lookup.category(data)
    service_name, customer = lookup.target(data.get("target"))
    if service_name is None:
        service_name = (data.get("subject") or "").strip() or None
    return {
        "key": f"draft-{draft.pk}",
        "code": None,
        "title": (data.get("event") or "").strip() or "پیش‌نویس بی‌عنوان",
        "category": category.code if category else None,
        "scenario": None,
        "service": service_name,
        "customer": customer,
        "source": source_label(data.get("source")),
        "stage": {**DRAFT_STAGE, "tone": "neutral"},
        "owner": fmt.person(lookup.owner(draft)),
        "due": None,
        "href": None,
        "route": f"/identification/manual?draft={draft.pk}",
    }


def risk_row(risk):
    value, label, tone = STAGES.get(risk.status, (risk.status, risk.get_status_display(), "neutral"))
    customers = [customer.name for customer in risk.customers.all()]
    return {
        "key": f"risk-{risk.pk}",
        "code": risk.code,
        "title": risk.title,
        "category": risk.category.code if risk.category_id else None,
        "scenario": risk.scenario.code if risk.scenario_id else None,
        "service": risk.service.name if risk.service_id else None,
        "customer": "، ".join(customers) if customers else "همه",
        "source": source_label(risk.source) or risk.get_channel_display(),
        "stage": {"value": value, "label": label, "tone": tone},
        "owner": fmt.person(risk.owner),
        "due": fmt.deadline(risk.question_due) if risk.status == S.QUESTIONS else None,
        "href": risk.get_absolute_url(),
        "route": None,
    }


def recent_rows(user):
    """ورودی‌های اخیر: پیش‌نویس‌های خود کاربر و بعد ریسک‌ها، روی هم حداکثر RECENT ردیف."""
    drafts = list(visible_drafts(user).select_related("org_unit", "created_by").order_by("-updated_at")[:RECENT])
    risks = (
        visible_risks(user)
        .filter(merged_into__isnull=True, status__in=list(STAGES))
        .select_related("category", "scenario", "service", "owner")
        .prefetch_related("customers")
        .annotate(question_due=Min("questions__due", filter=Q(questions__answered_at__isnull=True)))
        .order_by("-created_at")[: max(RECENT - len(drafts), 0)]
    )
    lookup = RowLookup(drafts)
    return [draft_row(draft, lookup) for draft in drafts] + [risk_row(risk) for risk in risks]


def unit_choices(units, registrant):
    # واحدها پرسیده نمی‌شوند؛ رابط با همین فهرست و واحد مالک هر خدمت همان انتخاب سرور را حدس می‌زند تا مالک ریسک
    # را در «شرط پذیرش ورودی» نشان دهد. مالک نسبت به ثبت‌کننده‌ی ورودی سنجیده می‌شود، همان‌طور که سرور ریسک را ثبت
    # می‌کند (submit_identification). تصمیم نهایی همیشه با سرور است.
    units = list(units.order_by("name"))
    managers = unit_managers([unit.pk for unit in units])
    return [
        {
            "value": str(unit.pk),
            "name": unit.name,
            "owner": fmt.person(pick_owner(managers.get(unit.pk, []), registrant)),
        }
        for unit in units
    ]


def target_options(form):
    """گزینه‌های پرسش اول (خدمت، مشتری و تعهد)."""
    services = {service.pk: service for service in Service.objects.filter(is_active=True)}
    commitments = {item.pk: item for item in Commitment.objects.select_related("customer")}
    targets = []
    for value, label in form.fields["target"].choices:
        if not value:
            continue
        service_id, _, commitment_id = value.partition(":")
        service = services[int(service_id)]
        commitment = commitments.get(int(commitment_id)) if commitment_id else None
        targets.append(
            {
                "value": value,
                "label": str(label),
                "service": {"id": service.pk, "name": service.name, "environment": service.get_environment_display()},
                "unit": str(service.org_unit_id) if service.org_unit_id else None,
                "customer": commitment.customer.name if commitment and commitment.customer_id else None,
                "commitment": commitment.title if commitment else None,
            }
        )
    return targets


def choices(form, user, units, registrant):
    evidence = visible_evidence(user).filter(Q(valid_until__isnull=True) | Q(valid_until__gte=timezone.localdate()))
    return {
        "org_unit": unit_choices(units, registrant),
        "target": target_options(form),
        "category": [
            {"value": str(category.pk), "code": category.code, "label": category.name}
            for category in form.fields["category"].queryset.order_by("code")
        ],
        "source": [{"value": value, "label": str(label)} for value, label in Risk.Source.choices],
        "evidence": [
            {"value": str(item.pk), "code": item.code, "label": item.title}
            for item in evidence.order_by("-observed_on", "-pk")[:50]
        ],
    }


def blank_values():
    return {
        **{name: "" for name in INTAKE_FIELDS},
        "org_unit": "",
        "target": "",
        "category": "",
        "tags": [],
        "source": "",
        "scenario": "",
        "evidence_items": [],
    }


def form_values(data):
    """مقدارهای ذخیره‌شده‌ی پیش‌نویس به شکل رشته‌ای فرم React."""
    values = blank_values()
    for name in INTAKE_FIELDS + ["target", "source"]:
        values[name] = data.get(name) or ""
    for name in ["org_unit", "category", "scenario"]:
        values[name] = str(data[name]) if data.get(name) else ""
    values["tags"] = list(data.get("tags") or [])
    values["evidence_items"] = [str(pk) for pk in data.get("evidence_items") or []]
    return values


def form_input(values):
    """مقدارهای فرم React برای IdentificationForm: برچسب‌ها با ویرگول به هم می‌چسبند."""
    values = dict(values or {})
    data = {name: values.get(name) or "" for name in [*INTAKE_FIELDS, "org_unit", "target", "category", "source"]}
    data["scenario"] = values.get("scenario") or ""
    data["tags"] = "، ".join(values.get("tags") or [])
    data["evidence_items"] = [str(pk) for pk in values.get("evidence_items") or []]
    return data


def draft_payload(draft):
    return {
        "id": draft.pk,
        "status": DRAFT_STAGE,
        "saved_at": fmt.moment(draft.updated_at),
        "attachments": draft_attachments(draft),
    }


def read_request(request):
    """بدنه‌ی POST: JSON، یا با فایل شاهد multipart با همان مقدارها در فیلد payload و فایل در evidence_file."""
    upload = request.FILES.get("evidence_file")
    if request.content_type and request.content_type.startswith("multipart/"):
        try:
            payload = json.loads(request.data.get("payload") or "{}")
        except ValueError:
            payload = {}
    else:
        payload = request.data
    if not isinstance(payload, dict):
        payload = {}
    remove = [int(pk) for pk in payload.get("remove_attachments") or [] if str(pk).isdigit()]
    return payload, upload, remove


def page_data(user, form, draft, units, recent, **flags):
    """داده‌ی صفحه‌ی ویزارد؛ form None است وقتی کاربر فرم ندارد، و units واحدهایی است که رابط مالک را با آن‌ها حدس
    می‌زند."""
    return {
        **flags,
        "parts": [{"name": name, "label": label, "token": token} for name, label, token in SCENARIO_PARTS],
        "choices": choices(form, user, units, draft.created_by if draft else user) if form is not None else None,
        "values": form_values(draft.data) if draft else blank_values(),
        "draft": draft_payload(draft) if draft else None,
        "text_limit": TEXT_LIMIT,
        # قاعده‌ی پیوست برای کادر فایل شاهد؛ جنگو همان را دوباره می‌سنجد (check_upload).
        "attachment": {
            "accept": ",".join(f".{extension}" for extension in settings.ATTACHMENT_EXTENSIONS),
            "max_size": settings.ATTACHMENT_MAX_SIZE,
        },
        "recent": recent,
        "scenarios_url": reverse("risks:scenario_list"),
        "register_url": reverse("risks:risk_list"),
        "evidence_url": reverse("risks:evidence_create"),
    }


class IdentificationView(ApiView):
    """GET داده‌ی صفحه (و پیش‌نویس ?draft=)، POST ذخیره یا با submit=true ساختن ریسک، DELETE حذف پیش‌نویس. ثبت با عضو
    GRC و مدیر سامانه است. بدنه‌ی POST، JSON است یا multipart با فایل شاهد. پیش‌نویس با قفل ردیف پیدا می‌شود تا دو
    ارسال هم‌زمان یک پیش‌نویس را دو بار ریسک نکنند و ذخیره‌ای که دیر برسد پیش‌نویسِ ارسال‌شده و پاک‌شده را دوباره
    نسازد."""

    parser_classes = (JSONParser, MultiPartParser)

    def draft(self, user, pk):
        return get_object_or_404(visible_drafts(user).select_for_update(), pk=pk)

    def post(self, request):
        user = request.user
        if not can_edit_register(user):
            raise PermissionDenied
        payload, upload, remove = read_request(request)
        submit = bool(payload.get("submit"))
        with transaction.atomic():
            draft = self.draft(user, payload["draft"]) if payload.get("draft") else None
            form = IdentificationForm(form_input(payload.get("values")), user=user, submit=submit)
            valid = form.is_valid()
            errors = (fmt.form_errors(form) if not valid else {}) | clean_evidence_file(upload)
            if errors:
                message = "ورودی بدون پرسش‌های اجباری ارسال نمی‌شود." if submit else "پیش‌نویس ذخیره نشد."
                return ApiResponse({"message": message, "errors": errors}, status=status.HTTP_400_BAD_REQUEST)
            if submit:
                risk = submit_identification(form, draft, upload, remove)
                return ApiResponse(
                    {
                        "message": f"ریسک {risk.code} شناسایی و در رجیستر ثبت شد.",
                        "risk": {"id": risk.pk, "code": risk.code},
                        "redirect": f"/risks/{risk.pk}",
                    },
                    status=status.HTTP_201_CREATED,
                )
            draft = save_draft(form, draft, upload, remove)
        # جدول بیرون از تراکنش ساخته می‌شود تا قفل پیش‌نویس بیش از ذخیره نگه داشته نشود.
        return ApiResponse({"message": "پیش‌نویس ذخیره شد.", "draft": draft_payload(draft), "recent": recent_rows(user)})

    def delete(self, request):
        user = request.user
        if not can_edit_register(user):
            raise PermissionDenied
        with transaction.atomic():
            self.draft(user, request.query_params.get("draft")).delete()
        return ApiResponse({"message": "پیش‌نویس حذف شد.", "recent": recent_rows(user)})

    def get(self, request):
        user = request.user
        can_identify = can_edit_register(user)
        draft = None
        if request.query_params.get("draft"):
            draft = get_object_or_404(visible_drafts(user), pk=request.query_params["draft"])
        return ApiResponse(
            page_data(
                user,
                IdentificationForm(user=user) if can_identify else None,
                draft,
                identify_units(user) if can_identify else None,
                recent_rows(user),
                can_identify=can_identify,
                can_answer=can_answer(user),
            )
        )
