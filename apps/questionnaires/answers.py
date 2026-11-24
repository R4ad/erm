"""ویزارد «پاسخ به پرسشنامه‌ها»: مدیر واحد هشت پرسش جلسه‌ی شناسایی را پاسخ می‌دهد (خدمت، هدف یا تعهد، عامل و
وضعیت، داتین یا مشتری، مسیرهای تحقق، رویداد هر مسیر، نوع و دامنه و شرح پیامد هر رویداد، بازبینی) و پاسخنامه را برای
کارشناس ریسک می‌فرستد. ارسال ریسک نمی‌سازد؛ ریسک‌ها را کارشناس از روی پاسخنامه شناسایی می‌کند.

شکل مقدارها، همان که رابط می‌فرستد و می‌گیرد:

    {"service": "", "objective": "", "conditions": "", "responsibility": "",
     "paths": [{"key": "p1", "description": "", "event": "e1"}],
     "events": [{"key": "e1", "text": ""}],
     "impacts": [{"event": "e1", "types": ["S"], "scope": "", "description": ""}]}

کلیدها را رابط می‌سازد و پایدارند، تا ویرایش بعد از بازگرداندن همان مسیر، رویداد و پیامد را نگه دارد و ریسک
تأییدشده‌ی یک پیامد گم نشود. هر مسیر به یک رویداد می‌رسد؛ چند مسیر می‌توانند به یک رویداد برسند و پیامد هر رویداد یک
بار پرسیده می‌شود. شماره‌ی رویداد ترتیب اولین مسیری است که به آن می‌رسد."""

import re

from django.db import transaction
from django.utils import timezone

from apps.methodology.models import Scale
from apps.methodology.services import active_version
from apps.workcalendar.workdays import add_working_days

from .models import PathConsequence, Response, RiskInstance, RiskPath, ServiceObjective, ServiceRecord

STEP_COUNT = 8
TEXT_LIMIT = 1000
PATH_LIMIT = 500
IMPACT_LIMIT = 120
MAX_PATHS = 20
REVIEW_WORKING_DAYS = 3

BASIC_FIELDS = ["service", "objective", "conditions", "responsibility"]
KEY = re.compile(r"^[A-Za-z0-9_-]{1,40}$")

REQUIRED = "این پرسش را پاسخ دهید."
NO_PATH = "دست‌کم یک مسیر تحقق اضافه کنید."
EMPTY_PATH = "شرح این مسیر تحقق را بنویسید."
EMPTY_EVENT = "برای این مسیر یک رویداد بنویسید یا از رویدادهای قبلی انتخاب کنید."
NO_TYPE = "دست‌کم یک نوع پیامد انتخاب کنید."
NO_SCOPE = "دامنه‌ی پیامد را بنویسید."
NO_DESCRIPTION = "شرح پیامد را بنویسید."


FA_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def fa(value):
    return str(value).translate(FA_DIGITS)


def too_long(limit):
    return f"حداکثر {limit:,} نویسه.".replace(",", "٬").translate(FA_DIGITS)


def impact_labels():
    return {item["value"]: item["label"] for item in impact_types()}


def type_labels(codes, labels):
    """نام بُعدهای انتخاب‌شده‌ی پیامد، با «، »؛ کدی که در روش فعال نیست همان کد می‌ماند."""
    return "، ".join(labels.get(code, code) for code in codes)


def impact_types():
    """بُعدهای پیامد روش فعال، گزینه‌های «نوع پیامد» گام ۷."""
    version = active_version()
    if version is None:
        return []
    scales = Scale.objects.filter(version=version, kind=Scale.Kind.IMPACT).order_by("order")
    return [{"value": scale.code, "label": scale.name} for scale in scales]


def blank_values():
    return {**{name: "" for name in BASIC_FIELDS}, "paths": [], "events": [], "impacts": []}


def _text(value):
    return value.strip() if isinstance(value, str) else ""


def _key(value):
    value = _text(value)
    return value if KEY.match(value) else ""


def clean_values(raw, type_codes):
    """مقدارهای رسیده از رابط، تمیز و هم‌خوان: رشته‌ها بی فاصله‌ی دو سر، کلیدهای نادرست و تکراری کنار، رویدادی که
    هیچ مسیری به آن نمی‌رسد و پیامد رویداد ناموجود حذف. خطای طول و تعداد برمی‌گردد؛ اجباری بودن با submit_errors
    است، چون پیش‌نویس نیمه‌کاره هم ذخیره می‌شود."""
    raw = raw if isinstance(raw, dict) else {}
    values = blank_values()
    errors = {}
    for name in BASIC_FIELDS:
        values[name] = _text(raw.get(name))
        if len(values[name]) > TEXT_LIMIT:
            errors[name] = [too_long(TEXT_LIMIT)]

    texts = {}
    for item in raw.get("events") if isinstance(raw.get("events"), list) else []:
        key = _key(item.get("key")) if isinstance(item, dict) else ""
        if key and key not in texts:
            texts[key] = _text(item.get("text"))

    seen = set()
    for item in raw.get("paths") if isinstance(raw.get("paths"), list) else []:
        key = _key(item.get("key")) if isinstance(item, dict) else ""
        # رابط بعد از MAX_PATHS مسیر دکمه‌ی افزودن را غیرفعال می‌کند؛ مسیر بیشتر از کلاینت دیگر نادیده گرفته می‌شود.
        if not key or key in seen or len(seen) >= MAX_PATHS:
            continue
        seen.add(key)
        # مسیری که هنوز رویداد ندارد (گام ۵) رویداد خالی خودش را می‌گیرد.
        event = _key(item.get("event")) or f"{key}-event"
        texts.setdefault(event, "")
        path = {"key": key, "description": _text(item.get("description")), "event": event}
        values["paths"].append(path)
        if len(path["description"]) > PATH_LIMIT:
            errors[f"paths.{key}"] = [too_long(PATH_LIMIT)]

    order = list(dict.fromkeys(path["event"] for path in values["paths"]))
    values["events"] = [{"key": key, "text": texts[key]} for key in order]
    for event in values["events"]:
        if len(event["text"]) > TEXT_LIMIT:
            errors[f"events.{event['key']}"] = [too_long(TEXT_LIMIT)]

    impacts = {}
    for item in raw.get("impacts") if isinstance(raw.get("impacts"), list) else []:
        event = _key(item.get("event")) if isinstance(item, dict) else ""
        if event not in order or event in impacts:
            continue
        chosen = item.get("types") if isinstance(item.get("types"), list) else []
        impacts[event] = {
            "event": event,
            "types": [code for code in type_codes if code in chosen],
            "scope": _text(item.get("scope")),
            "description": _text(item.get("description")),
        }
        if len(impacts[event]["scope"]) > TEXT_LIMIT:
            errors[f"impacts.{event}.scope"] = [too_long(TEXT_LIMIT)]
        if len(impacts[event]["description"]) > IMPACT_LIMIT:
            errors[f"impacts.{event}.description"] = [too_long(IMPACT_LIMIT)]
    values["impacts"] = [
        impacts.get(key) or {"event": key, "types": [], "scope": "", "description": ""} for key in order
    ]
    return values, errors


def submit_errors(values):
    """پرسش‌های اجباری برای ارسال؛ کلید هر خطا همان کلید فیلد در رابط است."""
    errors = {name: [REQUIRED] for name in BASIC_FIELDS if not values[name]}
    if not values["paths"]:
        errors["paths"] = [NO_PATH]
    texts = {event["key"]: event["text"] for event in values["events"]}
    for path in values["paths"]:
        if not path["description"]:
            errors[f"paths.{path['key']}"] = [EMPTY_PATH]
        if not texts.get(path["event"]):
            errors[f"paths.{path['key']}.event"] = [EMPTY_EVENT]
    for impact in values["impacts"]:
        if not texts.get(impact["event"]):
            continue
        key = f"impacts.{impact['event']}"
        if not impact["types"]:
            errors[f"{key}.types"] = [NO_TYPE]
        if not impact["scope"]:
            errors[f"{key}.scope"] = [NO_SCOPE]
        if not impact["description"]:
            errors[f"{key}.description"] = [NO_DESCRIPTION]
    return errors


def start_response(user, org_unit):
    return Response.objects.create(org_unit=org_unit, respondent=user)


def save_values(response, values, step):
    """مقدارهای تمیزشده را روی پاسخنامه و زنجیره‌ی خدمت، رویداد، مسیر و پیامد می‌نشاند. ردیف هر کلید به‌روز
    می‌شود و کلیدی که دیگر نیست حذف."""
    with transaction.atomic():
        response.conditions = values["conditions"]
        response.responsibility = values["responsibility"]
        response.wizard_step = max(1, min(int(step or 1), STEP_COUNT))
        response.save(update_fields=["conditions", "responsibility", "wizard_step", "updated_at"])

        record, _ = ServiceRecord.objects.get_or_create(response=response, defaults={"source_key": "service"})
        record.name_and_scope = values["service"]
        record.save(update_fields=["name_and_scope", "updated_at"])
        objective = record.objectives.first() or ServiceObjective(service=record, source_key="objective")
        objective.description = values["objective"]
        objective.save()

        impacts = {impact["event"]: impact for impact in values["impacts"]}
        instances = {item.source_key: item for item in record.risk_instances.all()}
        kept = {}
        for number, event in enumerate(values["events"], 1):
            instance = instances.get(event["key"]) or RiskInstance(service=record, source_key=event["key"])
            impact = impacts[event["key"]]
            instance.number = number
            instance.event = event["text"]
            instance.scope = impact["scope"]
            instance.save()
            kept[event["key"]] = instance
            consequence = instance.consequences.first() or PathConsequence(
                risk_instance=instance, source_key=event["key"]
            )
            consequence.impact_types = impact["types"]
            consequence.description = impact["description"]
            consequence.save()

        paths = {item.source_key: item for item in RiskPath.objects.filter(risk_instance__service=record)}
        for number, value in enumerate(values["paths"], 1):
            path = paths.pop(value["key"], None) or RiskPath(source_key=value["key"])
            path.risk_instance = kept[value["event"]]
            path.number = number
            path.description = value["description"]
            path.save()
        RiskPath.objects.filter(pk__in=[path.pk for path in paths.values()]).delete()
        record.risk_instances.exclude(pk__in=[item.pk for item in kept.values()]).delete()


def answer_values(response):
    """مقدارهای ذخیره‌شده‌ی پاسخنامه به همان شکل رابط."""
    values = blank_values()
    values["conditions"] = response.conditions
    values["responsibility"] = response.responsibility
    record = response.service_records.first()
    if record is None:
        return values
    values["service"] = record.name_and_scope
    objective = record.objectives.first()
    values["objective"] = objective.description if objective else ""
    instances = list(record.risk_instances.order_by("number", "pk").prefetch_related("consequences"))
    for instance in instances:
        consequence = next(iter(instance.consequences.all()), None)
        values["events"].append({"key": instance.source_key, "text": instance.event})
        values["impacts"].append(
            {
                "event": instance.source_key,
                "types": list(consequence.impact_types) if consequence else [],
                "scope": instance.scope,
                "description": consequence.description if consequence else "",
            }
        )
    paths = RiskPath.objects.filter(risk_instance__service=record).select_related("risk_instance")
    values["paths"] = [
        {"key": path.source_key, "description": path.description, "event": path.risk_instance.source_key}
        for path in paths.order_by("number", "pk")
    ]
    return values


def summary(values):
    """شمار مسیرها، رویدادهای نوشته‌شده و پیامدهای کامل؛ برای جدول و پیام ارسال."""
    written = {event["key"] for event in values["events"] if event["text"]}
    complete = [
        impact
        for impact in values["impacts"]
        if impact["event"] in written and impact["types"] and impact["scope"] and impact["description"]
    ]
    return {"paths": len(values["paths"]), "events": len(written), "impacts": len(complete)}


def stored_summary(response):
    """نام خدمت و شمار مسیرها، رویدادها و پیامدهای ذخیره‌شده؛ با service_records و رویدادها و مسیرها و پیامدهایشان
    که پیش‌تر prefetch شده‌اند."""
    record = next(iter(response.service_records.all()), None)
    if record is None:
        return "", {"paths": 0, "events": 0, "impacts": 0}
    instances = list(record.risk_instances.all())
    complete = [
        instance
        for instance in instances
        if instance.event
        and instance.scope
        and any(item.impact_types and item.description for item in instance.consequences.all())
    ]
    counts = {
        "paths": sum(len(instance.paths.all()) for instance in instances),
        "events": sum(1 for instance in instances if instance.event),
        "impacts": len(complete),
    }
    return record.name_and_scope, counts


def submit_response(response):
    """پاسخنامه به «در انتظار بررسی» می‌رود با مهلت بررسی سه روز کاری از امروز."""
    now = timezone.now()
    response.status = Response.Status.SUBMITTED
    response.submitted_at = now
    response.review_due = add_working_days(timezone.localdate(now), REVIEW_WORKING_DAYS)
    response.wizard_step = STEP_COUNT
    response.save(update_fields=["status", "submitted_at", "review_due", "wizard_step", "updated_at"])
