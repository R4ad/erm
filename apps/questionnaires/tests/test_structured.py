import copy

import pytest
from django.core.exceptions import ValidationError
from django.urls import reverse

from apps.accounts.roles import Role
from apps.catalog.tests.factories import make_user
from apps.organization.models import OrgUnit
from apps.questionnaires.models import Questionnaire, Response
from apps.questionnaires.structured import save_structured

pytestmark = pytest.mark.django_db


@pytest.fixture
def setup_response():
    questionnaire = Questionnaire.objects.get(is_structured=True)
    unit = OrgUnit.objects.create(name="شبکه")
    user = make_user("branch_manager", Role.UNIT_MANAGER)
    user.managed_units.add(unit)
    response = Response.objects.create(
        questionnaire=questionnaire,
        org_unit=unit,
        respondent=user,
        recorded_by=user,
        channel=Response.Channel.QUESTIONNAIRE,
    )
    questions = {q.order: str(q.pk) for q in questionnaire.questions.all()}

    def node(key, answers):
        return {
            "key": key,
            "answers": {questions[number]: text for number, text in answers.items()},
        }

    path1 = node("p1", {5: "قطع سوئیچ", 7: "تعویض"})
    path2 = node("p2", {5: "قطع کابل"})
    control = {**node("c", {6: "مسیر پشتیبان"}), "paths": ["p1", "p2"]}
    consequence = {**node("k", {8: "وقفه مشتری"}), "path": "p1"}
    evidence = {**node("e", {9: "تیکت ۱"}), "target": "control:c"}
    event = {
        **node("event", {4: "تنظیم اشتباه"}),
        "paths": [path1, path2],
        "controls": [control],
        "consequences": [consequence],
        "evidence": [evidence],
    }
    service = {
        **node("s", {1: "شبکه شعب", 2: "اتصال"}),
        "objectives": [node("o", {3: "دسترس‌پذیری"})],
        "events": [event],
    }
    return response, [service], user


def test_saves_branch_relations_and_source_snapshots(setup_response):
    response, data, _ = setup_response
    save_structured(response, data, submit=True)
    record = response.service_records.get()
    assert record.name_and_scope == "شبکه شعب"
    assert record.purpose == "اتصال"
    risk = record.risk_instances.get()
    assert risk.scope == "شبکه شعب"
    assert risk.trigger == "تنظیم اشتباه"
    original_path_id = risk.paths.get(source_key="p1").pk
    assert risk.paths.count() == 2
    assert risk.controls.get().paths.count() == 2
    assert risk.consequences.get().path.source_key == "p1"
    assert risk.evidence.get().control.source_key == "c"
    saved = response.structured_data[0]["events"][0]["paths"][0]
    assert any(source["answer"] == "قطع سوئیچ" for source in saved["_sources"].values())
    question = response.questionnaire.questions.get(order=5)
    question.text = "عنوان تغییر کرد"
    question.save()
    save_structured(response, response.structured_data)
    assert (
        response.service_records.get()
        .risk_instances.get()
        .paths.get(source_key="p1")
        .pk
        == original_path_id
    )
    saved = response.structured_data[0]["events"][0]["paths"][0]
    assert any("چگونه" in source["question"] for source in saved["_sources"].values())


def test_rejects_cross_branch_references_without_destroying_saved_data(setup_response):
    response, data, _ = setup_response
    save_structured(response, data)
    invalid = copy.deepcopy(data)
    invalid[0]["events"][0]["controls"][0]["paths"] = ["another-event-path"]
    with pytest.raises(ValidationError):
        save_structured(response, invalid)
    assert response.service_records.get().risk_instances.get().paths.count() == 2


def test_api_start_and_submit(client, setup_response):
    response, data, user = setup_response
    client.force_login(user)
    start = client.get(
        reverse("api:response_start", args=[response.questionnaire_id])
    ).json()
    assert list(start["fields"]) == ["org_unit"]
    result = client.put(
        reverse("api:response_detail", args=[response.pk]),
        {"structured_data": data, "submit": True},
        content_type="application/json",
    )
    assert result.status_code == 200, result.content
    response.refresh_from_db()
    assert response.status == Response.Status.SUBMITTED
    assert (
        client.put(
            reverse("api:response_detail", args=[response.pk]),
            {"structured_data": [], "submit": False},
            content_type="application/json",
        ).status_code
        == 403
    )


def test_reviewer_sees_saved_questions_and_evidence_target(client, setup_response):
    response, data, _ = setup_response
    reviewer = make_user("branch_reviewer", Role.GRC_MEMBER)
    save_structured(response, data, submit=True)
    client.force_login(reviewer)
    result = client.get(response.get_absolute_url())
    assert result.status_code == 200
    html = result.content.decode()
    assert "تنظیم اشتباه" in html
    assert "تیکت ۱" in html
    assert "تمهید: مسیر پشتیبان" in html


def test_grc_can_add_and_deactivate_a_structured_question(client, setup_response):
    response, _, manager = setup_response
    reviewer = make_user("question_editor", Role.GRC_MEMBER)
    url = reverse("questionnaires:question_create", args=[response.questionnaire_id])
    data = {
        "order": 10,
        "text": "سؤال تکمیلی مسیر",
        "kind": "text",
        "stage": "path",
        "is_active": "on",
        "options-TOTAL_FORMS": 0,
        "options-INITIAL_FORMS": 0,
        "options-MIN_NUM_FORMS": 0,
        "options-MAX_NUM_FORMS": 1000,
    }
    client.force_login(manager)
    assert client.post(url, data).status_code == 403
    client.force_login(reviewer)
    assert client.post(url, data).status_code == 302
    question = response.questionnaire.questions.get(text="سؤال تکمیلی مسیر")
    edit = reverse("questionnaires:question_update", args=[question.pk])
    data.pop("is_active")
    assert client.post(edit, data).status_code == 302
    question.refresh_from_db()
    assert not question.is_active


def test_control_can_cover_paths_of_different_events(setup_response):
    response, data, _ = setup_response
    event = data[0]["events"][0]
    second = copy.deepcopy(event)
    second["key"] = "event2"
    second["paths"] = [{"key": "p3", "answers": {}}]
    second["controls"] = []
    second["consequences"] = []
    second["evidence"] = []
    event["controls"][0]["paths"].append("p3")
    data[0]["events"].append(second)
    save_structured(response, data)
    control = (
        response.service_records.get()
        .risk_instances.get(source_key="event")
        .controls.get()
    )
    assert set(control.paths.values_list("source_key", flat=True)) == {"p1", "p2", "p3"}


def test_grc_can_start_structured_response_without_respondent_field(
    client, setup_response
):
    response, _, _ = setup_response
    response.delete()
    reviewer = make_user("branch_starter", Role.GRC_MEMBER)
    client.force_login(reviewer)
    result = client.post(
        reverse("api:response_start", args=[response.questionnaire_id]),
        {"org_unit": response.org_unit_id},
        content_type="application/json",
    )
    assert result.status_code == 201, result.content
