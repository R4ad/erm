"""اعتبارسنجی و ثبت پاسخ شاخه‌ای پرسشنامه."""

import copy

from django.core.exceptions import ValidationError
from django.db import transaction

from .models import (
    InitialEvidence,
    PathConsequence,
    PathControl,
    RiskInstance,
    RiskPath,
    ServiceObjective,
    ServiceRecord,
)


def _list(value):
    if not isinstance(value, list) or any(not isinstance(item, dict) for item in value):
        raise ValidationError("ساختار پاسخ نامعتبر است.")
    return value


def _answers(node, stages, questions, submit, allowed_stages=None):
    answers = node.get("answers", {})
    if not isinstance(answers, dict):
        raise ValidationError("پاسخ سؤال نامعتبر است.")
    for key, value in answers.items():
        if not isinstance(key, str) or not isinstance(value, str) or len(value) > 20000:
            raise ValidationError("متن پاسخ نامعتبر است.")
        if not any(
            str(q.pk) == key and q.stage in (allowed_stages or stages)
            for q in questions
        ):
            raise ValidationError("سؤال متعلق به این بخش نیست.")
    for question in questions:
        if (
            question.is_active
            and question.stage in stages
            and submit
            and question.is_required
            and not answers.get(str(question.pk), "").strip()
        ):
            raise ValidationError(
                f"پاسخ سؤال «{question.text}» در همه بخش‌های مربوط اجباری است."
            )
    return "\n".join(
        answers.get(str(q.pk), "").strip() for q in questions if q.stage in stages
    ).strip()


def _key(node):
    key = node.get("key")
    if not isinstance(key, str) or not key or len(key) > 80:
        raise ValidationError("شناسه شاخه نامعتبر است.")
    return key


@transaction.atomic
def save_structured(response, data, submit=False):
    services = _list(data)
    questions = list(response.questionnaire.questions.all())
    if submit and not services:
        raise ValidationError("دست‌کم یک خدمت ثبت کنید.")
    # اعتبارسنجی و ساخت در یک تراکنش است؛ هر خطا تمام تغییرات را برمی‌گرداند.
    for service in services:
        _key(service)
        stext = _answers(
            service, ["service"], questions, submit, ["service", "purpose"]
        )
        s, _ = ServiceRecord.objects.update_or_create(
            response=response,
            source_key=service["key"],
            defaults={
                "name_and_scope": stext,
                "purpose": _answers(
                    service, ["purpose"], questions, submit, ["service", "purpose"]
                ),
            },
        )
        objectives, events = (
            _list(service.get("objectives")),
            _list(service.get("events")),
        )
        if submit and (not objectives or not events):
            raise ValidationError("برای هر خدمت دست‌کم یک انتظار و یک اتفاق ثبت کنید.")
        # مسیرها ابتدا ساخته می‌شوند تا یک تمهید چند اتفاق را پوشش دهد.
        service_paths = {}
        for event in events:
            event_key = _key(event)
            event_text = _answers(event, ["event"], questions, submit)
            event_risk, _ = RiskInstance.objects.update_or_create(
                service=s,
                source_key=event_key,
                defaults={"scope": stext, "trigger": event_text, "event": event_text},
            )
            for path in _list(event.get("paths")):
                path_key = _key(path)
                if path_key in service_paths:
                    raise ValidationError("شناسه مسیر تکراری است.")
                item, _ = RiskPath.objects.update_or_create(
                    risk_instance=event_risk,
                    source_key=path_key,
                    defaults={
                        "description": _answers(
                            path, ["path"], questions, submit, ["path", "recovery"]
                        ),
                        "recovery": _answers(
                            path, ["recovery"], questions, submit, ["path", "recovery"]
                        ),
                    },
                )
                service_paths[path_key] = item
        for objective in objectives:
            _key(objective)
            ServiceObjective.objects.update_or_create(
                service=s,
                source_key=objective["key"],
                defaults={
                    "description": _answers(objective, ["objective"], questions, submit)
                },
            )
        for event in events:
            _key(event)
            event_text = _answers(event, ["event"], questions, submit)
            risk, _ = RiskInstance.objects.update_or_create(
                service=s,
                source_key=event["key"],
                defaults={"scope": stext, "trigger": event_text, "event": event_text},
            )
            paths, controls = _list(event.get("paths")), _list(event.get("controls"))
            consequences, evidence = (
                _list(event.get("consequences")),
                _list(event.get("evidence")),
            )
            if submit and not paths:
                raise ValidationError("برای هر اتفاق دست‌کم یک راه ثبت کنید.")
            if submit:
                for stage, items, label in [
                    ("control", controls, "تمهید"),
                    ("consequence", consequences, "پیامد"),
                    ("evidence", evidence, "شاهد"),
                ]:
                    if not items and any(
                        q.is_active and q.is_required and q.stage == stage
                        for q in questions
                    ):
                        raise ValidationError(
                            f"برای هر اتفاق دست‌کم یک {label} ثبت کنید."
                        )
            path_map, control_map, consequence_map = {}, {}, {}
            for path in paths:
                key = _key(path)
                if key in path_map:
                    raise ValidationError("شناسه مسیر تکراری است.")
                path_map[key], _ = RiskPath.objects.update_or_create(
                    risk_instance=risk,
                    source_key=key,
                    defaults={
                        "description": _answers(
                            path, ["path"], questions, submit, ["path", "recovery"]
                        ),
                        "recovery": _answers(
                            path, ["recovery"], questions, submit, ["path", "recovery"]
                        ),
                    },
                )
            for control in controls:
                key = _key(control)
                if key in control_map:
                    raise ValidationError("شناسه تمهید تکراری است.")
                refs = control.get("paths")
                if not isinstance(refs, list) or any(
                    not isinstance(ref, str) or ref not in service_paths for ref in refs
                ):
                    raise ValidationError("مسیر تمهید معتبر نیست.")
                if submit and not refs:
                    raise ValidationError("مسیر پوشش‌داده‌شده توسط تمهید را انتخاب کنید.")
                obj, _ = PathControl.objects.update_or_create(
                    risk_instance=risk,
                    source_key=key,
                    defaults={
                        "description": _answers(control, ["control"], questions, submit)
                    },
                )
                obj.paths.set([service_paths[ref] for ref in refs])
                control_map[key] = obj
            for consequence in consequences:
                key = _key(consequence)
                if key in consequence_map:
                    raise ValidationError("شناسه پیامد تکراری است.")
                ref = consequence.get("path", "")
                if not isinstance(ref, str) or (ref and ref not in path_map):
                    raise ValidationError("مسیر پیامد معتبر نیست.")
                consequence_map[key], _ = PathConsequence.objects.update_or_create(
                    risk_instance=risk,
                    source_key=key,
                    defaults={
                        "path": path_map.get(ref),
                        "description": _answers(
                            consequence, ["consequence"], questions, submit
                        ),
                    },
                )
            for item in evidence:
                _key(item)
                target = item.get("target", "event")
                if not isinstance(target, str):
                    raise ValidationError("هدف شاهد نامعتبر است.")
                kind, _, ref = target.partition(":")
                maps = {
                    "path": path_map,
                    "control": control_map,
                    "consequence": consequence_map,
                }
                if target != "event" and (kind not in maps or ref not in maps[kind]):
                    raise ValidationError("هدف شاهد متعلق به این اتفاق نیست.")
                kwargs = {"path": None, "control": None, "consequence": None}
                if target != "event":
                    kwargs[kind] = maps[kind][ref]
                InitialEvidence.objects.update_or_create(
                    risk_instance=risk,
                    source_key=item["key"],
                    defaults={
                        "description": _answers(item, ["evidence"], questions, submit),
                        **kwargs,
                    },
                )
            risk.evidence.exclude(
                source_key__in=[item["key"] for item in evidence]
            ).delete()
            risk.consequences.exclude(source_key__in=consequence_map).delete()
            risk.controls.exclude(source_key__in=control_map).delete()
            risk.paths.exclude(source_key__in=path_map).delete()
        s.objectives.exclude(
            source_key__in=[item["key"] for item in objectives]
        ).delete()
        s.risk_instances.exclude(
            source_key__in=[item["key"] for item in events]
        ).delete()
    response.service_records.exclude(
        source_key__in=[item["key"] for item in services]
    ).delete()

    # متن سؤال و پاسخ در زمان ثبت حفظ می‌شود تا منشأ برداشت قابل ردیابی بماند.
    def nodes(value):
        if isinstance(value, list):
            for item in value:
                yield from nodes(item)
        elif isinstance(value, dict) and "key" in value:
            yield value
            for child in value.values():
                if isinstance(child, list) and child and isinstance(child[0], dict):
                    yield from nodes(child)

    previous = {n["key"]: n for n in nodes(response.structured_data)}
    data = copy.deepcopy(data)
    names = {str(q.pk): q.text for q in questions}
    seen = set()
    for item in nodes(data):
        key = _key(item)
        if key in seen:
            raise ValidationError("شناسه بخش تکراری است.")
        seen.add(key)
        old = previous.get(key, {})
        sources = {}
        for qid, answer in item.get("answers", {}).items():
            old_source = old.get("_sources", {}).get(qid)
            if old_source and old_source.get("answer") == answer:
                sources[qid] = old_source
            else:
                sources[qid] = {"question": names[qid], "answer": answer}
        item["_sources"] = sources
    response.structured_data = data
    response.save(update_fields=["structured_data", "updated_at"])
