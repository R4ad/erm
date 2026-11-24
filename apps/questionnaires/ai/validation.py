"""اعتبارسنجی خروجی LLM طبق بخش ۳ ERM-DEV-PROMPT، با کد دستی و بدون jsonschema: شکل اسکیما (فیلدهای الزامی، بدون
فیلد اضافه، نوع‌ها، enumها، maxLength و maxItems) و قاعده‌های بک‌اند (یک ریسک برای هر گروه، مسیرها و رویداد همان
گروه، دسته‌ی مجاز، متن خالی ممنوع، about به شناسه‌ی موجود). خطاها جمله‌های کوتاه‌اند تا در پیام تلاش دوباره به مدل
برگردند."""

import json

TITLE_LIMIT = 120
QUESTION_LIMIT = 5
CONFIDENCE = ("high", "medium", "low")
RISK_FIELDS = (
    "impact_id",
    "title",
    "initiating_factor",
    "realization_paths",
    "target_event",
    "impact",
    "category",
    "confidence",
    "confidence_reason",
    "gaps",
)
QUESTION_FIELDS = ("question", "about", "reason")
# شناسه‌ی پرسش‌های پایه که about می‌تواند به آن‌ها اشاره کند (خدمت، هدف، عامل و وضعیت، مسئولیت).
QUESTION_IDS = ("Q1", "Q2", "Q3", "Q4")


def parse(raw):
    """متن خام مدل را به شیء JSON تبدیل می‌کند؛ اگر مدل با وجود دستور، JSON را در ``` پیچیده باشد آن را برمی‌دارد."""
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.index("\n") + 1 :] if "\n" in text else ""
    return json.loads(text)


def _keys(obj, required, where, errors):
    if not isinstance(obj, dict):
        errors.append(f"{where} باید شیء JSON باشد.")
        return False
    missing = [key for key in required if key not in obj]
    extra = [key for key in obj if key not in required]
    if missing:
        errors.append(f"{where}: فیلدهای الزامی نیامده‌اند: {', '.join(missing)}.")
    if extra:
        errors.append(f"{where}: فیلدهای اضافه مجاز نیستند: {', '.join(extra)}.")
    return not missing


def _text(value, where, errors, limit=None):
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{where} خالی است یا متن نیست.")
        return
    if limit and len(value) > limit:
        errors.append(f"{where} بیش از {limit} نویسه است.")


def _risk(risk, index, groups, categories, errors):
    where = f"risks[{index}]"
    if not _keys(risk, RISK_FIELDS, where, errors):
        return None
    impact_id = risk["impact_id"]
    _text(impact_id, f"{where}.impact_id", errors)
    _text(risk["title"], f"{where}.title", errors, TITLE_LIMIT)
    _text(risk["initiating_factor"], f"{where}.initiating_factor", errors)
    _text(risk["confidence_reason"], f"{where}.confidence_reason", errors)
    if risk["confidence"] not in CONFIDENCE:
        errors.append(f"{where}.confidence باید یکی از high، medium یا low باشد.")
    if risk["category"] not in categories:
        errors.append(f"{where}.category در فهرست دسته‌های مجاز نیست.")
    gaps = risk["gaps"]
    if not isinstance(gaps, list) or not all(isinstance(gap, str) and gap.strip() for gap in gaps):
        errors.append(f"{where}.gaps باید فهرستی از متن‌های ناخالی باشد.")

    group = groups.get(impact_id) if isinstance(impact_id, str) else None
    paths = risk["realization_paths"]
    path_ids = []
    if not isinstance(paths, list) or not paths:
        errors.append(f"{where}.realization_paths دست‌کم یک مسیر می‌خواهد.")
    else:
        for n, path in enumerate(paths):
            if _keys(path, ("path_id", "text"), f"{where}.realization_paths[{n}]", errors):
                path_ids.append(path["path_id"])
                _text(path["text"], f"{where}.realization_paths[{n}].text", errors)
    event = risk["target_event"]
    if _keys(event, ("event_id", "text"), f"{where}.target_event", errors):
        _text(event["text"], f"{where}.target_event.text", errors)
    impact = risk["impact"]
    if _keys(impact, ("text", "type", "scope"), f"{where}.impact", errors):
        for key in ("text", "type", "scope"):
            _text(impact[key], f"{where}.impact.{key}", errors)

    if group is None:
        errors.append(f"{where}.impact_id «{impact_id}» در risk_groups نیست.")
        return impact_id
    expected = [path["path_id"] for path in group["realization_paths"]]
    if sorted(path_ids) != sorted(expected):
        errors.append(f"{where}: مسیرهای ریسک باید دقیقاً {', '.join(expected)} باشند.")
    if isinstance(event, dict) and event.get("event_id") != group["target_event"]["event_id"]:
        errors.append(f"{where}.target_event.event_id باید {group['target_event']['event_id']} باشد.")
    return impact_id


def validate(output, payload):
    """فهرست خطاهای خروجی نسبت به ورودی payload؛ فهرست خالی یعنی خروجی پذیرفته است."""
    errors = []
    if not _keys(output, ("risks", "follow_up_questions"), "خروجی", errors):
        return errors
    groups = {group["impact_id"]: group for group in payload["risk_groups"]}
    categories = set(payload["allowed_categories"])
    risks = output["risks"]
    if not isinstance(risks, list):
        errors.append("risks باید فهرست باشد.")
        risks = []
    seen = []
    for index, risk in enumerate(risks):
        impact_id = _risk(risk, index, groups, categories, errors)
        if impact_id is not None:
            seen.append(impact_id)
    if len(risks) != len(groups):
        errors.append(f"تعداد ریسک‌ها باید {len(groups)} باشد، یکی برای هر گروه.")
    for impact_id in groups:
        if seen.count(impact_id) != 1:
            errors.append(f"برای impact_id «{impact_id}» باید دقیقاً یک ریسک بیاید.")

    known = set(QUESTION_IDS) | set(groups)
    for group in payload["risk_groups"]:
        known.add(group["target_event"]["event_id"])
        known.update(path["path_id"] for path in group["realization_paths"])
    questions = output["follow_up_questions"]
    if not isinstance(questions, list):
        errors.append("follow_up_questions باید فهرست باشد.")
        return errors
    if len(questions) > QUESTION_LIMIT:
        errors.append(f"حداکثر {QUESTION_LIMIT} پرسش تکمیلی مجاز است.")
    for n, question in enumerate(questions):
        where = f"follow_up_questions[{n}]"
        if not _keys(question, QUESTION_FIELDS, where, errors):
            continue
        _text(question["question"], f"{where}.question", errors)
        _text(question["reason"], f"{where}.reason", errors)
        if question["about"] not in known:
            errors.append(f"{where}.about باید به شناسه‌ای از ورودی اشاره کند.")
    return errors
