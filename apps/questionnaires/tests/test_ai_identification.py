"""شناسایی هوشمند: گروه‌بندی با کد، اعتبارسنجی خروجی LLM، pipeline با mock و سرویس‌دهنده‌ی سازگار با OpenAI."""

import io
import json
import urllib.error
from datetime import timedelta
from unittest import mock

import pytest
from django.core.management import call_command
from django.utils import timezone

from apps.accounts.roles import Role
from apps.actions.models import MonitoringNotice
from apps.catalog.tests.factories import make_user
from apps.organization.models import OrgUnit
from apps.questionnaires import services
from apps.questionnaires.ai import grouping, pipeline, providers, validation
from apps.questionnaires.models import AiRun, PathConsequence, PendingRisk, Response, RiskInstance
from apps.questionnaires.tests.factories import payment_response
from apps.risks.models import Risk, RiskCategory

pytestmark = pytest.mark.django_db


@pytest.fixture
def unit():
    return OrgUnit.objects.create(name="پرداخت الکترونیک")


@pytest.fixture
def respondent(unit):
    user = make_user("maryam", Role.UNIT_MANAGER, first_name="مریم", last_name="صادقی")
    user.managed_units.add(unit)
    return user


@pytest.fixture
def sara():
    return make_user("sara", Role.GRC_MEMBER, first_name="سارا", last_name="محمدی")


def run_for(response, user):
    run = pipeline.request_identification(response, user)
    pipeline.run_identification(run)
    run.refresh_from_db()
    return run


class Scripted:
    """سرویس‌دهنده‌ای که پاسخ‌های از پیش تعیین‌شده می‌دهد و پیام‌های دریافتی را نگه می‌دارد."""

    name = "scripted"
    model = "scripted-1"

    def __init__(self, *answers):
        self.answers = list(answers)
        self.messages = []

    def complete(self, system, user, schema):
        self.messages.append(user)
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer if isinstance(answer, str) else json.dumps(answer, ensure_ascii=False)


def mock_output(payload):
    return json.loads(providers.MockProvider().complete("", pipeline.prompt("user.md").replace(
        "{{INPUT_JSON}}", json.dumps(payload, ensure_ascii=False)), {}))


# --- گروه‌بندی -------------------------------------------------------------------------------------------------------


def test_groups_by_distinct_impact_with_the_shared_event_paths_together(unit, respondent):
    response = payment_response(unit, respondent)
    payload, groups = grouping.build_input(response)

    assert [group["impact_id"] for group in payload["risk_groups"]] == ["I1", "I2"]
    first = payload["risk_groups"][0]
    assert [path["path_id"] for path in first["realization_paths"]] == ["P1", "P3"]
    assert first["target_event"] == {"event_id": "E1", "text": "توقف کامل پردازش تراکنش‌های پرداخت اینترنتی"}
    assert first["impact"]["scope"] == "همه‌ی بانک‌ها"
    assert "مالی" in first["impact"]["type"]
    assert payload["response_id"] == response.code
    assert payload["initiating_factor_answer"].startswith("وابستگی کامل")
    assert set(payload["allowed_categories"]) == set(
        RiskCategory.objects.filter(is_active=True).values_list("name", flat=True)
    )
    # نام پاسخ‌دهنده و واحد به LLM نمی‌رود.
    text = json.dumps(payload, ensure_ascii=False)
    assert "مریم" not in text and "صادقی" not in text and "پرداخت الکترونیک" not in text
    assert len(groups) == 2


def test_incomplete_and_already_approved_impacts_are_left_out(unit, respondent, sara):
    response = payment_response(unit, respondent)
    slow = RiskInstance.objects.get(service__response=response, number=2)
    slow.consequences.update(impact_types=[])
    payload, _ = grouping.build_input(response)
    assert [group["impact_id"] for group in payload["risk_groups"]] == ["I1"]

    risk = Risk.objects.create(title="توقف پرداخت", description="شرح", channel=Risk.Channel.QUESTIONNAIRE, org_unit=unit)
    stop = PathConsequence.objects.get(risk_instance__service__response=response, risk_instance__number=1)
    PendingRisk.objects.create(response=response, consequence=stop, status=PendingRisk.Status.CONVERTED, risk=risk)
    payload, groups = grouping.build_input(response)
    assert payload["risk_groups"] == [] and groups == []


# --- اعتبارسنجی ------------------------------------------------------------------------------------------------------


@pytest.fixture
def payload(unit, respondent):
    return grouping.build_input(payment_response(unit, respondent))[0]


def test_the_mock_output_is_valid(payload):
    assert validation.validate(mock_output(payload), payload) == []


@pytest.mark.parametrize(
    "break_it, message",
    [
        (lambda o: o["risks"].pop(), "تعداد ریسک‌ها باید 2"),
        (lambda o: o["risks"][1].update(impact_id="I1"), "دقیقاً یک ریسک"),
        (lambda o: o["risks"][0]["realization_paths"].pop(), "مسیرهای ریسک باید دقیقاً P1, P3"),
        (lambda o: o["risks"][0]["target_event"].update(event_id="E2"), "event_id باید E1"),
        (lambda o: o["risks"][0].update(category="آب‌وهوا"), "دسته‌های مجاز"),
        (lambda o: o["risks"][0].update(title=" "), "title خالی است"),
        (lambda o: o["risks"][0].update(title="ت" * 121), "بیش از 120 نویسه"),
        (lambda o: o["risks"][0].update(confidence="certain"), "confidence باید"),
        (lambda o: o["risks"][0]["impact"].update(scope=""), "impact.scope خالی است"),
        (lambda o: o["risks"][0]["impact"].update(type="ت" * 201), "impact.type بیش از 200 نویسه"),
        (lambda o: o["risks"][0].update(note="x"), "فیلدهای اضافه"),
        (lambda o: o["risks"][0].pop("gaps"), "فیلدهای الزامی"),
        (lambda o: o.update(follow_up_questions=[{"question": "چرا؟", "about": "P1", "reason": "ر"}] * 6), "حداکثر 5"),
        (lambda o: o.update(follow_up_questions=[{"question": "چرا؟", "about": "P9", "reason": "ر"}]), "about باید"),
    ],
)
def test_each_backend_rule_is_checked(payload, break_it, message):
    output = mock_output(payload)
    break_it(output)
    errors = validation.validate(output, payload)
    assert any(message in error for error in errors), errors


def test_about_may_point_to_a_basic_question_and_fenced_json_is_read(payload):
    output = mock_output(payload)
    output["follow_up_questions"] = [{"question": "مدت سوئیچ چقدر است؟", "about": "Q3", "reason": "برای احتمال"}]
    assert validation.validate(validation.parse(f"```json\n{json.dumps(output)}\n```"), payload) == []


# --- pipeline --------------------------------------------------------------------------------------------------------


def test_mock_run_saves_one_draft_per_impact_with_its_source(unit, respondent, sara):
    response = payment_response(unit, respondent)
    run = run_for(response, sara)

    assert (run.status, run.stage, run.attempts) == (AiRun.Status.SUCCEEDED, 5, 1), run.error_message
    assert (run.provider, run.prompt_version) == ("mock", "v3")
    assert len(run.input_hash) == 64 and run.raw_output and run.duration_ms is not None
    drafts = list(response.pending_risks.order_by("pk"))
    assert len(drafts) == 2
    first = drafts[0]
    assert first.status == PendingRisk.Status.PENDING
    assert [(path["path_id"], path["number"]) for path in first.paths] == [("P1", 1), ("P3", 3)]
    assert first.consequence.risk_instance.number == 1
    assert (first.owner_unit, first.owner) == (unit, respondent)
    assert first.ai_run == run
    assert first.ai_original["title"] == first.title
    assert first.category is not None
    assert first.impact_scope == "همه‌ی بانک‌ها"


def test_similar_registry_risks_are_found_by_trigram(unit, respondent, sara):
    existing = Risk.objects.create(
        title="توقف کامل پردازش تراکنش‌های پرداخت اینترنتی بر اثر قطعی لینک ارتباطی اصلی با شاپرک",
        description="توقف پرداخت",
        channel=Risk.Channel.IDENTIFICATION,
        org_unit=unit,
    )
    Risk.objects.create(title="نشت داده‌ی کارکنان", description="—", channel=Risk.Channel.IDENTIFICATION, org_unit=unit)
    response = payment_response(unit, respondent)
    run_for(response, sara)
    first = response.pending_risks.order_by("pk").first()
    assert [item["code"] for item in first.similar_risks] == [existing.code]
    assert 0 < first.similar_risks[0]["similarity"] <= 1


def test_no_complete_group_ends_empty_without_calling_the_model(unit, respondent, sara):
    response = payment_response(unit, respondent)
    PathConsequence.objects.filter(risk_instance__service__response=response).update(description="")
    scripted = Scripted()
    with mock.patch.object(pipeline, "get_provider", return_value=scripted):
        run = run_for(response, sara)
    assert run.status == AiRun.Status.EMPTY
    assert scripted.messages == []
    assert not response.pending_risks.exists()
    response.refresh_from_db()
    assert response.status == Response.Status.SUBMITTED  # بی‌تصمیم؛ کارشناس آن را بازمی‌گرداند


def test_an_empty_rerun_settles_the_response_when_every_suggestion_left_is_decided(unit, respondent, sara):
    response = payment_response(unit, respondent)
    run_for(response, sara)
    first, second = response.pending_risks.order_by("pk")
    services.approve(first, sara)
    PathConsequence.objects.filter(pk=second.consequence_id).update(description="")

    run = run_for(response, sara)
    assert run.status == AiRun.Status.EMPTY
    second.refresh_from_db()
    response.refresh_from_db()
    assert second.status == PendingRisk.Status.ARCHIVED
    assert (response.status, response.reviewed_by) == (Response.Status.IDENTIFIED, sara)
    assert MonitoringNotice.objects.filter(recipient=respondent, response=response).count() == 1


def test_invalid_output_is_retried_once_with_the_errors(unit, respondent, sara):
    response = payment_response(unit, respondent)
    payload = grouping.build_input(response)[0]
    bad = mock_output(payload)
    bad["risks"].pop()
    scripted = Scripted(bad, mock_output(payload))
    with mock.patch.object(pipeline, "get_provider", return_value=scripted):
        run = run_for(response, sara)
    assert (run.status, run.attempts, run.validation_errors) == (AiRun.Status.SUCCEEDED, 2, [])
    assert "خروجی قبلی این خطاها را داشت" in scripted.messages[1]
    assert "تعداد ریسک‌ها باید 2 باشد" in scripted.messages[1]
    assert response.pending_risks.count() == 2


def test_second_invalid_output_fails_with_a_tracking_code_and_saves_nothing(unit, respondent, sara):
    response = payment_response(unit, respondent)
    with mock.patch.object(pipeline, "get_provider", return_value=Scripted("نه JSON", "{}")):
        run = run_for(response, sara)
    assert run.status == AiRun.Status.FAILED
    assert run.error_code.startswith("AI-422-") and len(run.error_code) == 11
    assert run.validation_errors
    assert not response.pending_risks.exists()


def test_provider_timeout_fails_with_504(unit, respondent, sara):
    response = payment_response(unit, respondent)
    timeout = providers.ProviderError("مهلت", status=504)
    with mock.patch.object(pipeline, "get_provider", return_value=Scripted(timeout)):
        run = run_for(response, sara)
    assert run.status == AiRun.Status.FAILED and run.error_code.startswith("AI-504-")


def test_a_cancelled_run_is_dropped_between_stages(unit, respondent, sara):
    response = payment_response(unit, respondent)
    run = pipeline.request_identification(response, sara)

    class CancelWhileThinking(Scripted):
        def complete(self, system, user, schema):
            AiRun.objects.filter(pk=run.pk).update(status=AiRun.Status.CANCELLED)
            return super().complete(system, user, schema)

    payload = grouping.build_input(response)[0]
    with mock.patch.object(pipeline, "get_provider", return_value=CancelWhileThinking(mock_output(payload))):
        pipeline.run_identification(run)
    run.refresh_from_db()
    assert run.status == AiRun.Status.CANCELLED
    assert not response.pending_risks.exists()


def test_a_run_cancelled_before_the_model_fails_stays_cancelled(unit, respondent, sara):
    response = payment_response(unit, respondent)
    run = pipeline.request_identification(response, sara)

    class CancelThenTimeout(Scripted):
        def complete(self, system, user, schema):
            AiRun.objects.filter(pk=run.pk).update(status=AiRun.Status.CANCELLED)
            raise providers.ProviderError("مهلت", status=504)

    with mock.patch.object(pipeline, "get_provider", return_value=CancelThenTimeout()):
        pipeline.run_identification(run)
    run.refresh_from_db()
    assert (run.status, run.error_code) == (AiRun.Status.CANCELLED, "")
    assert not MonitoringNotice.objects.exists()


def test_a_run_left_running_by_a_stopped_worker_fails_with_504(unit, respondent, sara, settings):
    settings.LLM_TIMEOUT_MS = 1000
    response = payment_response(unit, respondent)
    stuck = pipeline.request_identification(response, sara)
    assert pipeline.next_queued() == stuck
    AiRun.objects.filter(pk=stuck.pk).update(started_at=timezone.now() - timedelta(minutes=3))

    fresh = pipeline.request_identification(response, sara)
    stuck.refresh_from_db()
    assert fresh != stuck and fresh.status == AiRun.Status.QUEUED
    assert stuck.status == AiRun.Status.FAILED and stuck.error_code.startswith("AI-504-")
    assert MonitoringNotice.objects.get(recipient=sara).event_key == f"ai-run:{stuck.pk}:failed"
    assert pipeline.next_queued() == fresh
    assert pipeline.request_identification(response, sara) == fresh  # هنوز در مهلت است


def test_rerun_archives_unreviewed_drafts_and_keeps_decided_ones(unit, respondent, sara):
    response = payment_response(unit, respondent)
    run_for(response, sara)
    first, second = response.pending_risks.order_by("pk")
    first.status = PendingRisk.Status.DISMISSED
    first.dismiss_reason = "تکراری"
    first.save()

    run_for(response, sara)
    statuses = list(response.pending_risks.order_by("pk").values_list("status", flat=True))
    assert statuses == ["dismissed", "archived", "pending", "pending"]
    assert second.history.count() == 2  # بایگانی در تاریخچه‌ی پیش‌نویس ثبت شده است


def test_a_second_request_returns_the_active_run(unit, respondent, sara):
    response = payment_response(unit, respondent)
    first = pipeline.request_identification(response, sara)
    assert pipeline.request_identification(response, sara) == first
    assert pipeline.next_queued() == first
    assert pipeline.next_queued() is None


def test_the_worker_command_runs_the_queue_once(unit, respondent, sara):
    response = payment_response(unit, respondent)
    pipeline.request_identification(response, sara)
    out = io.StringIO()
    call_command("run_ai_identification", stdout=out)
    assert AiRun.objects.get().status == AiRun.Status.SUCCEEDED
    assert "1 اجرای شناسایی هوشمند انجام شد" in out.getvalue()


# --- سرویس‌دهنده‌ی سازگار با OpenAI --------------------------------------------------------------------------------


class Answer(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@pytest.fixture
def compatible(settings):
    settings.LLM_PROVIDER = "openai_compatible"
    settings.LLM_BASE_URL = "http://llm.local/v1/"
    settings.LLM_MODEL = "qwen"
    settings.LLM_API_KEY = "k"
    return providers.get_provider()


def test_compatible_provider_asks_for_the_schema_then_falls_back_to_json_object(compatible):
    sent = []

    def urlopen(request, timeout):
        body = json.loads(request.data)
        sent.append((request.full_url, request.headers.get("Authorization"), body["response_format"]["type"]))
        if body["response_format"]["type"] == "json_schema":
            raise urllib.error.HTTPError(request.full_url, 400, "bad", {}, None)
        return Answer(json.dumps({"choices": [{"message": {"content": '{"risks": []}'}}]}).encode())

    with mock.patch.object(providers.urllib.request, "urlopen", urlopen):
        assert compatible.complete("s", "u", {"type": "object"}) == '{"risks": []}'
    assert sent == [
        ("http://llm.local/v1/chat/completions", "Bearer k", "json_schema"),
        ("http://llm.local/v1/chat/completions", "Bearer k", "json_object"),
    ]


def test_compatible_provider_timeout_is_504(compatible):
    with (
        mock.patch.object(providers.urllib.request, "urlopen", side_effect=TimeoutError()),
        pytest.raises(providers.ProviderError) as error,
    ):
        compatible.complete("s", "u", {})
    assert error.value.status == 504
