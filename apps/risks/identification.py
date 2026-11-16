"""فرم شناسایی ریسک (فیگما ۱۱): مدیر واحد یا عضو GRC سناریو را با الگوی بخش ۴ روش از مأموریت و تعهد واحد ثبت
می‌کند. پیش‌نویس جدا نگه داشته می‌شود و «ارسال برای شناسایی» ریسک را با وضعیت «ثبت‌شده در رجیستر» می‌سازد؛ بعد عضو
GRC آن را برای ارزیابی می‌فرستد یا با پرسش مشخص برای تکمیل برمی‌گرداند."""

from django import forms
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.accounts.roles import Role
from apps.catalog.models import Commitment, Service
from apps.organization.models import OrgUnit

from .models import Evidence, IdentificationDraft, Risk, RiskCategory, RiskScenario
from .permissions import can_edit_register, visible_evidence
from .services import parse_tag_names, set_tags

TEXT_LIMIT = 1000

# اجزای الگوی ثبت سناریو، به ترتیب «پرسش‌های جلسه‌ی شناسایی» فیگما ۱۱. هر کدام یک نشانه‌ی رنگی در پیش‌نمایش جمله دارد.
SCENARIO_PARTS = [
    ("subject", "موضوع بررسی کدام خدمت یا فرآیند است؟", "خدمت"),
    ("objective", "کدام هدف یا تعهد مختل می‌شود؟", "هدف یا تعهد"),
    ("conditions", "چه علت یا شرایطی زمینه‌ی اختلال را فراهم می‌کند؟", "عامل و وضعیت"),
    ("customer", "داتین، مشتری یا هر دو متأثرند؟", "داتین یا مشتری"),
    ("event", "چه اتفاق مشخصی ممکن است رخ دهد؟", "رویداد مشخص"),
    ("harm", "آسیب قابل مشاهده و دامنه‌ی آن چیست؟", "نوع و دامنه‌ی پیامد"),
]
# فیلدهای متنی که با ارسال اجباری‌اند. پیامد برای شرکت و وابستگی اختیاری‌اند؛ نبود شاهد هم دلیل رد نیست و به جایش
# فرض قابل آزمون نوشته می‌شود.
REQUIRED_TEXT = ["mission", "objective", "conditions", "customer", "event", "harm", "evidence"]
INTAKE_FIELDS = ["mission", *(name for name, *_ in SCENARIO_PARTS), "impact", "dependencies", "evidence"]


def identify_units(user):
    """واحدهایی که این کاربر برایشان ریسک شناسایی می‌کند: عضو GRC و مدیر سامانه همه‌ی واحدهای فعال، مدیر واحد
    واحدهای تحت مدیریتش و زیرمجموعه‌هایشان."""
    units = OrgUnit.objects.filter(is_active=True)
    if can_edit_register(user):
        return units
    if user.has_role(Role.UNIT_MANAGER):
        return units.filter(pk__in=user.managed_unit_ids())
    return units.none()


def unit_owner(unit, user):
    """مالک ریسکی که از واحد شناسایی می‌شود: خود مدیر واحد اگر ثبت‌کننده است، وگرنه نخستین مدیر فعال واحد."""
    if unit is None:
        return None
    managers = unit.managers.filter(is_active=True).order_by("first_name", "last_name", "pk")
    if managers.filter(pk=user.pk).exists():
        return user
    return managers.first()


def active_commitments():
    today = timezone.localdate()
    return Commitment.objects.filter(Q(valid_until__isnull=True) | Q(valid_until__gte=today))


def target_choices():
    """گزینه‌های «خدمت، مشتری و تعهد»: هر خدمت فعال برای همه‌ی مشتریان، و هر تعهد فعال آن خدمت با مشتری‌اش."""
    choices = []
    services = Service.objects.filter(is_active=True).select_related("org_unit").order_by("code")
    commitments = (
        active_commitments()
        .filter(services__in=services)
        .distinct()
        .select_related("customer")
        .prefetch_related("services")
        .order_by("title")
    )
    by_service = {}
    for commitment in commitments:
        for service in commitment.services.all():
            by_service.setdefault(service.pk, []).append(commitment)
    for service in services:
        choices.append((str(service.pk), f"{service.name} · همه‌ی مشتریان"))
        for commitment in by_service.get(service.pk, []):
            customer = commitment.customer.name if commitment.customer_id else "همه‌ی مشتریان"
            choices.append((f"{service.pk}:{commitment.pk}", f"{service.name} · {customer} · {commitment.title}"))
    return choices


def parse_target(value):
    """«۱۲» یعنی خدمت ۱۲ برای همه‌ی مشتریان و «۱۲:۳» یعنی تعهد ۳ همان خدمت."""
    service_id, _, commitment_id = (value or "").partition(":")
    service = Service.objects.filter(pk=service_id, is_active=True).first() if service_id.isdigit() else None
    commitment = None
    if service and commitment_id.isdigit():
        commitment = active_commitments().filter(pk=commitment_id, services=service).select_related("customer").first()
    return service, commitment


def narrative(values):
    """جمله‌ی الگوی بخش ۴ روش، همان که پیش‌نمایش زنده‌ی فیگما ۱۱ نشان می‌دهد؛ مثل RiskScenario.build_narrative."""
    part = {name: (values.get(name) or "").strip() or "…" for name, *_ in SCENARIO_PARTS}
    return (
        f"در خدمت یا فرآیند {part['subject']}، به علت یا در شرایط {part['conditions']}، ممکن است {part['event']} "
        f"رخ دهد و انجام {part['objective']} برای {part['customer']} را مختل کند. "
        f"پیامد قابل مشاهده‌ی آن {part['harm']} است."
    )


def risk_title(event, service):
    """عنوان ریسک همان رویداد مشخص است، با نام خدمت اگر رویداد آن را نگفته است؛ مثل «اعمال بسته‌ی نامعتبر در تولید
    ساتنا» در فیگما."""
    event = " ".join(event.split())
    if service and service.name not in event:
        event = f"{event} در {service.name}"
    return event[:300]


class IdentificationForm(forms.Form):
    """مقدارهای فرم شناسایی. پیش‌نویس فقط شکل مقدارها را چک می‌کند؛ ارسال، فیلدهای اجباری را هم (submit=True)."""

    org_unit = forms.ModelChoiceField(OrgUnit.objects.none(), label="واحد و تکمیل‌کننده", required=False)
    target = forms.ChoiceField(label="خدمت، مشتری و تعهد", required=False)
    mission = forms.CharField(label="مأموریت و خروجی اصلی", required=False, max_length=TEXT_LIMIT)
    subject = forms.CharField(label=SCENARIO_PARTS[0][1], required=False, max_length=TEXT_LIMIT)
    objective = forms.CharField(label=SCENARIO_PARTS[1][1], required=False, max_length=TEXT_LIMIT)
    conditions = forms.CharField(label=SCENARIO_PARTS[2][1], required=False, max_length=TEXT_LIMIT)
    customer = forms.CharField(label=SCENARIO_PARTS[3][1], required=False, max_length=TEXT_LIMIT)
    event = forms.CharField(label=SCENARIO_PARTS[4][1], required=False, max_length=TEXT_LIMIT)
    harm = forms.CharField(label=SCENARIO_PARTS[5][1], required=False, max_length=TEXT_LIMIT)
    impact = forms.CharField(label="پیامد برای شرکت و مشتری", required=False, max_length=TEXT_LIMIT)
    dependencies = forms.CharField(label="وابستگی و جایگزین", required=False, max_length=TEXT_LIMIT)
    evidence = forms.CharField(label="شاهد، تجربه و تغییر اخیر", required=False, max_length=TEXT_LIMIT)
    evidence_items = forms.ModelMultipleChoiceField(Evidence.objects.none(), label="شواهد پیوست", required=False)
    category = forms.ModelChoiceField(RiskCategory.objects.none(), label="دسته‌ی اصلی", required=False)
    tags = forms.CharField(label="برچسب فرعی", required=False, max_length=500)
    source = forms.ChoiceField(label="منبع شناسایی", choices=[("", "")] + Risk.Source.choices, required=False)
    scenario = forms.ModelChoiceField(RiskScenario.objects.none(), label="سناریوی مشابه", required=False)

    def __init__(self, *args, user, submit=False, **kwargs):
        super().__init__(*args, **kwargs)
        self.user = user
        self.submit = submit
        self.fields["org_unit"].queryset = identify_units(user)
        self.fields["target"].choices = [("", "")] + target_choices()
        self.fields["category"].queryset = RiskCategory.objects.filter(is_active=True)
        self.fields["scenario"].queryset = RiskScenario.objects.filter(is_active=True)
        self.fields["evidence_items"].queryset = visible_evidence(user)

    def clean_tags(self):
        return parse_tag_names(self.cleaned_data["tags"])

    def clean(self):
        data = super().clean()
        data["service"], data["commitment"] = parse_target(data.get("target"))
        if not self.submit:
            if not data.get("org_unit") and "org_unit" not in self.errors:
                self.add_error("org_unit", "واحد را انتخاب کنید تا پیش‌نویس ذخیره شود.")
            return data
        required = {
            "org_unit": "واحد را انتخاب کنید.",
            "target": "خدمت و مشتری را انتخاب کنید.",
            "category": "دسته‌ی اصلی را انتخاب کنید.",
            "source": "منبع شناسایی را انتخاب کنید.",
        }
        for name, message in required.items():
            if not data.get(name) and name not in self.errors:
                self.add_error(name, message)
        for name in REQUIRED_TEXT:
            if not (data.get(name) or "").strip() and name not in self.errors:
                self.add_error(name, "این پرسش برای ارسال اجباری است.")
        if data.get("target") and not data.get("service") and "target" not in self.errors:
            self.add_error("target", "این خدمت دیگر فعال نیست؛ گزینه‌ی دیگری انتخاب کنید.")
        return data

    def draft_data(self):
        """مقدارهای پیش‌نویس به شکلی که فرم دوباره می‌خواند."""
        data = self.cleaned_data
        values = {name: (data.get(name) or "") for name in INTAKE_FIELDS}
        values |= {
            "org_unit": data["org_unit"].pk if data.get("org_unit") else None,
            "target": data.get("target") or "",
            "category": data["category"].pk if data.get("category") else None,
            "tags": data.get("tags") or [],
            "source": data.get("source") or "",
            "scenario": data["scenario"].pk if data.get("scenario") else None,
            "evidence_items": [item.pk for item in data.get("evidence_items") or []],
        }
        return values


def save_draft(form, draft=None):
    draft = draft or IdentificationDraft(created_by=form.user)
    draft.org_unit = form.cleaned_data.get("org_unit")
    draft.data = form.draft_data()
    draft.save()
    return draft


@transaction.atomic
def submit_identification(form, draft=None):
    """ریسک را از فرم شناسایی می‌سازد: «ثبت‌شده در رجیستر» با مالک واحد، سناریوی پیوندشده یا «مورد جدید»، و
    شواهد انتخاب‌شده. پیش‌نویس با ارسال پاک می‌شود."""
    data = form.cleaned_data
    service, commitment, scenario = data["service"], data["commitment"], data.get("scenario")
    intake = {name: (data.get(name) or "").strip() for name in INTAKE_FIELDS}
    if commitment:
        intake["commitment"] = commitment.title
    risk = Risk(
        title=risk_title(intake["event"], service),
        description=narrative(intake),
        service=service,
        org_unit=data["org_unit"],
        owner=unit_owner(data["org_unit"], form.user),
        category=data["category"],
        channel=Risk.Channel.IDENTIFICATION,
        source=data["source"],
        scope=intake["subject"],
        intake=intake,
        status=Risk.Status.REGISTERED,
    )
    if scenario:
        risk.scenario = scenario
        risk.scenario_snapshot = {
            "code": scenario.code,
            "version": scenario.version,
            "title": scenario.title,
            "service": scenario.service_name_snapshot or (scenario.service.name if scenario.service_id else ""),
            "service_code": scenario.service.code if scenario.service_id else "",
            "conditions": scenario.conditions,
            "event": scenario.event,
            "objective": scenario.objective,
            "customer": scenario.customer_text,
            "consequence": scenario.consequence,
            "narrative": scenario.narrative,
            "category": str(scenario.category),
            "status": "active",
        }
    risk.save()
    if commitment and commitment.customer_id:
        risk.customers.set([commitment.customer])
    set_tags(risk, data["tags"])
    for item in data.get("evidence_items") or []:
        item.risks.add(risk)
    if draft and draft.pk:
        draft.delete()
    return risk


def visible_drafts(user):
    return IdentificationDraft.objects.filter(created_by=user)


def scenario_rows():
    """سناریوهای فعال کتابخانه برای «سناریوهای مشابه»: شباهت را رابط React همان لحظه از متن فرم حساب می‌کند."""
    scenarios = (
        RiskScenario.objects.filter(is_active=True)
        .select_related("category", "service")
        .prefetch_related("risks")
        .order_by("code")
    )
    return [
        {
            "id": scenario.pk,
            "code": scenario.code,
            "title": scenario.title,
            "text": " ".join([scenario.title, scenario.event, scenario.conditions, scenario.objective]),
            "service_id": scenario.service_id,
            "category": {"id": scenario.category_id, "code": scenario.category.code, "name": scenario.category.name},
            "risk_count": sum(1 for risk in scenario.risks.all() if risk.is_active),
        }
        for scenario in scenarios
    ]
