"""ورودی LLM از پاسخنامه (بخش ۳ ERM-DEV-PROMPT). گروه‌بندی را کد انجام می‌دهد، نه LLM: هر رویداد یکتا (RiskInstance) با
پیامدش یک گروه است و همه‌ی مسیرهایی که به آن رویداد می‌رسند در همان گروه‌اند. گروهی کامل است که رویداد، دامنه، پیامد
با نوع و شرح، و دست‌کم یک مسیر داشته باشد. پیامدی که ریسک تأییدشده دارد دوباره به LLM نمی‌رود.

شناسه‌ها از شماره‌های پاسخنامه‌اند: مسیر P{n}، رویداد E{n} و پیامد I{n} (پیامد همان شماره‌ی رویدادش را دارد). نام
پاسخ‌دهنده و واحد در ورودی نیست."""

from apps.risks.models import RiskCategory

from ..answers import impact_types
from ..models import PendingRisk


def path_id(path):
    return f"P{path.number}"


def event_id(instance):
    return f"E{instance.number}"


def impact_id(instance):
    return f"I{instance.number}"


def complete_groups(response):
    """(رویداد، پیامد، مسیرها) برای هر گروه کامل، به ترتیب شماره‌ی رویداد."""
    record = response.service_records.first()
    if record is None:
        return []
    groups = []
    for instance in record.risk_instances.order_by("number", "pk").prefetch_related("paths", "consequences"):
        paths = sorted((path for path in instance.paths.all() if path.description.strip()), key=lambda p: p.number)
        consequence = next(iter(instance.consequences.all()), None)
        if not (instance.event.strip() and instance.scope.strip() and paths and consequence):
            continue
        if not (consequence.description.strip() and consequence.impact_types):
            continue
        groups.append((instance, consequence, paths))
    return groups


def approved_consequences(response):
    return set(
        PendingRisk.objects.filter(response=response, status=PendingRisk.Status.CONVERTED).values_list(
            "consequence_id", flat=True
        )
    )


def build_input(response):
    """(payload، گروه‌ها). payload همان شیء ورودی بخش ۳ است؛ گروه‌ها برای ذخیره‌ی پیش‌نویس‌ها کنار آن برمی‌گردند."""
    record = response.service_records.first()
    labels = {item["value"]: item["label"] for item in impact_types()}
    done = approved_consequences(response)
    groups = [group for group in complete_groups(response) if group[1].pk not in done]
    payload = {
        "response_id": response.code,
        "service": record.name_and_scope if record else "",
        "objective": "؛ ".join(item.description for item in record.objectives.all()) if record else "",
        "initiating_factor_answer": response.conditions,
        "responsibility": response.responsibility,
        "risk_groups": [
            {
                "impact_id": impact_id(instance),
                "impact": {
                    "text": consequence.description,
                    "type": "، ".join(labels.get(code, code) for code in consequence.impact_types),
                    "scope": instance.scope,
                },
                "target_event": {"event_id": event_id(instance), "text": instance.event},
                "realization_paths": [{"path_id": path_id(path), "text": path.description} for path in paths],
            }
            for instance, consequence, paths in groups
        ],
        "allowed_categories": list(
            RiskCategory.objects.filter(is_active=True).order_by("code").values_list("name", flat=True)
        ),
    }
    return payload, groups
