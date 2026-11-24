"""اجرای شناسایی هوشمند یک پاسخنامه (AiRun)، در پنج مرحله‌ای که پنل 12b نشان می‌دهد:

۱. خواندن پاسخ‌ها و مسیرها  ۲. تفکیک پیامدهای متمایز (گروه‌بندی با کد)  ۳. استخراج اجزای هر ریسک با LLM
۴. مقایسه با ریسک‌های رجیستر (شباهت سه‌حرفی در بک‌اند)  ۵. ثبت پیش‌نویس‌ها در یک تراکنش

اگر گروه کاملی نباشد LLM صدا زده نمی‌شود و اجرا «ریسکی ساخته نشد» تمام می‌شود. خروجی نامعتبر یک بار با فهرست خطاها
دوباره فرستاده می‌شود؛ شکست دوم یا خطای سرویس‌دهنده اجرا را با کد پیگیری به «انجام نشد» می‌برد و پیش‌نویس ناقصی ذخیره
نمی‌شود. اجرایی که کاربر لغو کرده بین مرحله‌ها رها می‌شود. پیش‌نویس‌های بررسی‌نشده‌ی قبلی در همان تراکنشی بایگانی می‌شوند
که نتیجه‌ی تازه ثبت می‌شود؛ اجرای ناموفق یا لغوشده به آن‌ها دست نمی‌زند."""

import hashlib
import json
import secrets
from pathlib import Path

from django.conf import settings
from django.contrib.postgres.search import TrigramSimilarity
from django.db import transaction
from django.db.models import TextField, Value
from django.db.models.functions import Concat, Greatest
from django.utils import timezone

from apps.risks.identification import unit_owner
from apps.risks.models import Risk, RiskCategory

from .. import notices
from ..models import AiRun, PendingRisk, Response
from . import validation
from .grouping import build_input
from .providers import ProviderError, get_provider

PROMPT_VERSION = "v3"
PROMPTS = Path(__file__).parent / "prompts" / "risk_identification" / PROMPT_VERSION
SIMILAR_LIMIT = 3


class Cancelled(Exception):
    pass


def prompt(name):
    return (PROMPTS / name).read_text(encoding="utf-8")


def output_schema(categories):
    schema = json.loads(prompt("schema.json"))
    schema["properties"]["risks"]["items"]["properties"]["category"]["enum"] = categories
    return schema


def tracking_code(status):
    return f"AI-{status}-{secrets.token_hex(2).upper()}"


def registry():
    """ریسک‌های رجیستر که با پیشنهاد تازه مقایسه می‌شوند: باز و ادغام‌نشده."""
    return Risk.objects.exclude(status__in=Risk.CLOSED_STATUSES).filter(merged_into__isnull=True)


def similar_risks(response, title, event, impact):
    """حداکثر سه ریسک رجیستر با بیشترین شباهت سه‌حرفی: عنوان با عنوان، و رویداد و پیامد با شرح و مسیر ریسک. ریسک‌هایی
    که از همین پاسخنامه تأیید شده‌اند پیامد دیگری دارند و مشابه حساب نمی‌شوند."""
    threshold = settings.RISK_SIMILARITY_THRESHOLD
    text = f"{event} {impact}".strip()
    matches = (
        registry()
        .exclude(pending_sources__response=response)
        .annotate(
            similarity=Greatest(
                TrigramSimilarity("title", title),
                TrigramSimilarity(Concat("description", Value(" "), "realization_path", output_field=TextField()), text),
            )
        )
        .filter(similarity__gte=threshold)
        .order_by("-similarity", "-pk")[:SIMILAR_LIMIT]
    )
    return [
        {"id": risk.pk, "code": risk.code, "title": risk.title, "similarity": round(risk.similarity, 2)}
        for risk in matches
    ]


class Runner:
    def __init__(self, run):
        self.run = run
        self.response = run.response

    def stage(self, number):
        """مرحله را ثبت می‌کند؛ اگر کاربر در این فاصله لغو کرده باشد اجرا همین‌جا رها می‌شود."""
        status = AiRun.objects.filter(pk=self.run.pk).values_list("status", flat=True).first()
        if status == AiRun.Status.CANCELLED:
            raise Cancelled
        self.run.stage = number
        self.run.save(update_fields=["stage", "updated_at"])

    def lock(self):
        """قفل ردیف اجرا داخل تراکنش؛ اگر کاربر لغو کرده باشد اجرا رها می‌شود. endpoint لغو هم همین ردیف را قفل می‌کند،
        پس لغو و ثبت نتیجه هم‌زمان رخ نمی‌دهند."""
        status = AiRun.objects.select_for_update().filter(pk=self.run.pk).values_list("status", flat=True).first()
        if status == AiRun.Status.CANCELLED:
            raise Cancelled

    def finish(self, status, **fields):
        now = timezone.now()
        for name, value in fields.items():
            setattr(self.run, name, value)
        self.run.status = status
        self.run.finished_at = now
        self.run.duration_ms = int((now - self.run.started_at).total_seconds() * 1000)
        self.run.save()
        notices.run_finished(self.run)

    def ask(self, provider, payload):
        """پاسخ معتبر مدل، با یک تلاش دوباره همراه فهرست خطاها؛ در غیر این صورت ProviderError با وضعیت ۴۲۲."""
        schema = output_schema(payload["allowed_categories"])
        system = prompt("system.md")
        user = prompt("user.md").replace("{{INPUT_JSON}}", json.dumps(payload, ensure_ascii=False, indent=2))
        errors = []
        for attempt in (1, 2):
            message = user
            if errors:
                listed = "\n".join(f"- {error}" for error in errors)
                message = f"{user}\n\n{prompt('retry.md').replace('{{VALIDATION_ERRORS}}', listed)}"
            self.run.attempts = attempt
            raw = provider.complete(system, message, schema)
            self.run.raw_output = raw
            try:
                output = validation.parse(raw)
            except (ValueError, TypeError):
                errors = ["خروجی JSON معتبر نیست."]
            else:
                errors = validation.validate(output, payload)
            self.run.validation_errors = errors
            self.run.save(update_fields=["attempts", "raw_output", "validation_errors", "updated_at"])
            if not errors:
                return output
        raise ProviderError("خروجی مدل بعد از تلاش دوباره هم معتبر نبود.", status=422)

    def execute(self):
        provider = get_provider()
        self.run.provider = provider.name
        self.run.model = provider.model
        self.run.prompt_version = PROMPT_VERSION
        self.run.started_at = self.run.started_at or timezone.now()
        fields = ["provider", "model", "prompt_version", "started_at", "updated_at"]
        if self.run.status == AiRun.Status.QUEUED:
            self.run.status = AiRun.Status.RUNNING
            fields.append("status")
        self.run.save(update_fields=fields)

        self.stage(1)
        payload, groups = build_input(self.response)
        self.run.input = payload
        self.run.input_hash = hashlib.sha256(
            json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()
        ).hexdigest()
        self.run.save(update_fields=["input", "input_hash", "updated_at"])

        self.stage(2)
        if not groups:
            with transaction.atomic():
                self.lock()
                self.archive_open_drafts()
                self.finish(AiRun.Status.EMPTY)
            return

        self.stage(3)
        output = self.ask(provider, payload)

        self.stage(4)
        by_impact = {risk["impact_id"]: risk for risk in output["risks"]}
        similar = {
            key: similar_risks(self.response, risk["title"], risk["target_event"]["text"], risk["impact"]["text"])
            for key, risk in by_impact.items()
        }

        self.stage(5)
        with transaction.atomic():
            self.lock()
            self.archive_open_drafts()
            self.save_drafts(groups, by_impact, similar)
            self.finish(AiRun.Status.SUCCEEDED, follow_up_questions=output["follow_up_questions"])

    def archive_open_drafts(self):
        """پیش‌نویس‌های بررسی‌نشده‌ی اجرای قبلی بایگانی می‌شوند؛ با save تا در تاریخچه‌ی هر پیش‌نویس بمانند."""
        for draft in PendingRisk.objects.filter(response=self.response, status=PendingRisk.Status.PENDING):
            draft.status = PendingRisk.Status.ARCHIVED
            draft.save(update_fields=["status", "updated_at"])

    def save_drafts(self, groups, by_impact, similar):
        categories = {category.name: category for category in RiskCategory.objects.filter(is_active=True)}
        unit = self.response.org_unit
        owner = unit_owner(unit, self.response.respondent)
        for instance, consequence, paths in groups:
            key = f"I{instance.number}"
            risk = by_impact[key]
            numbers = {f"P{path.number}": path.number for path in paths}
            PendingRisk.objects.create(
                response=self.response,
                ai_run=self.run,
                consequence=consequence,
                title=risk["title"],
                initiating_factor=risk["initiating_factor"],
                target_event=risk["target_event"]["text"],
                impact=risk["impact"]["text"],
                impact_type=risk["impact"]["type"],
                impact_scope=risk["impact"]["scope"],
                paths=[
                    {"path_id": item["path_id"], "number": numbers[item["path_id"]], "text": item["text"]}
                    for item in risk["realization_paths"]
                ],
                category=categories.get(risk["category"]),
                owner_unit=unit,
                owner=owner,
                confidence=risk["confidence"],
                confidence_reason=risk["confidence_reason"],
                gaps=risk["gaps"],
                ai_original=risk,
                similar_risks=similar[key],
            )


def run_identification(run):
    """یک AiRun در صف را تا پایان اجرا می‌کند. خطاها به وضعیت «انجام نشد» با کد پیگیری می‌روند و بالا نمی‌آیند."""
    runner = Runner(run)
    try:
        runner.execute()
    except Cancelled:
        return
    except ProviderError as error:
        runner.finish(AiRun.Status.FAILED, error_code=tracking_code(error.status), error_message=str(error))
    except Exception as error:  # noqa: BLE001 - هر خطای پیش‌بینی‌نشده اجرا را با کد پیگیری می‌بندد
        runner.finish(AiRun.Status.FAILED, error_code=tracking_code(500), error_message=repr(error)[:1000])


def request_identification(response, user):
    """اجرای تازه در صف؛ اگر اجرایی در صف یا در حال اجراست همان برمی‌گردد."""
    with transaction.atomic():
        locked = Response.objects.select_for_update().get(pk=response.pk)
        active = locked.ai_runs.filter(status__in=AiRun.ACTIVE_STATUSES).first()
        if active:
            return active
        return AiRun.objects.create(response=locked, requested_by=user)


def next_queued():
    """اجرای بعدی صف با قفل ردیف، تا چند کارگر یک اجرا را دو بار برندارند."""
    with transaction.atomic():
        run = (
            AiRun.objects.select_for_update(skip_locked=True)
            .filter(status=AiRun.Status.QUEUED)
            .order_by("created_at", "pk")
            .first()
        )
        if run is None:
            return None
        run.status = AiRun.Status.RUNNING
        run.started_at = timezone.now()
        run.save(update_fields=["status", "started_at", "updated_at"])
        return run
