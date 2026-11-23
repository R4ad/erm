import datetime

import pytest
from django.db import IntegrityError, transaction
from django.urls import reverse
from django.utils import timezone

from apps.accounts.roles import Role
from apps.catalog.tests.factories import make_service, make_user
from apps.core.jalali import to_jalali
from apps.organization.models import OrgUnit
from apps.questionnaires.models import Answer, Option, PendingRisk, Question, Questionnaire, Response
from apps.questionnaires.services import submit_response
from apps.risks.models import Coverage, Risk, RiskCategory, RiskScenario
from apps.workcalendar.workdays import add_working_days

pytestmark = pytest.mark.django_db


@pytest.fixture
def grc():
    return make_user("grc", Role.GRC_MEMBER)


@pytest.fixture
def unit():
    return OrgUnit.objects.create(name="عملیات")


@pytest.fixture
def manager(unit):
    user = make_user("manager", Role.UNIT_MANAGER, first_name="مریم", last_name="کاظمی")
    user.managed_units.add(unit)
    return user


@pytest.fixture
def questionnaire():
    return Questionnaire.objects.create(title="شناسایی ریسک عملیات", is_active=True)


def add_question(questionnaire, text, kind, options=(), **fields):
    """سؤال آزمایشی؛ options فهرست (متن، نشانه‌ی ریسک) است."""
    question = Question.objects.create(questionnaire=questionnaire, text=text, kind=kind, **fields)
    for order, (option_text, risky) in enumerate(options, start=1):
        Option.objects.create(question=question, order=order, text=option_text, indicates_risk=risky)
    return question


def start(questionnaire, unit, respondent, recorded_by=None, **fields):
    return Response.objects.create(
        questionnaire=questionnaire,
        org_unit=unit,
        respondent=respondent,
        recorded_by=recorded_by or respondent,
        channel=Response.Channel.QUESTIONNAIRE,
        **fields,
    )


def option_formset(*rows, prefix="options", initial=0):
    """داده‌ی formset گزینه‌ها؛ هر ردیف (متن، نشانه‌ی ریسک، فعال)."""
    data = {
        f"{prefix}-TOTAL_FORMS": str(len(rows)),
        f"{prefix}-INITIAL_FORMS": str(initial),
        f"{prefix}-MIN_NUM_FORMS": "0",
        f"{prefix}-MAX_NUM_FORMS": "1000",
    }
    for index, (text, risky, active) in enumerate(rows):
        data[f"{prefix}-{index}-order"] = str(index + 1)
        data[f"{prefix}-{index}-text"] = text
        if risky:
            data[f"{prefix}-{index}-indicates_risk"] = "on"
        if active:
            data[f"{prefix}-{index}-is_active"] = "on"
    return data


def test_only_grc_and_system_admin_define_questionnaires(client, grc, manager, system_admin):
    client.force_login(manager)
    assert client.get(reverse("questionnaires:questionnaire_list")).status_code == 200
    assert client.get(reverse("questionnaires:questionnaire_create")).status_code == 403

    for user in (grc, system_admin):
        client.force_login(user)
        assert client.get(reverse("questionnaires:questionnaire_create")).status_code == 200

    response = client.post(reverse("questionnaires:questionnaire_create"), {"title": "پرسشنامه‌ی تازه"})
    questionnaire = Questionnaire.objects.get(title="پرسشنامه‌ی تازه")
    assert response.url == questionnaire.get_absolute_url()
    assert questionnaire.is_active is False  # تا سؤال‌ها آماده شوند غیرفعال می‌ماند


def test_a_choice_question_is_saved_with_its_options(client, grc, questionnaire):
    client.force_login(grc)
    url = reverse("questionnaires:question_create", args=[questionnaire.pk])
    data = {"order": "1", "text": "تغییرات تولید چطور تأیید می‌شود؟", "kind": "single", "is_active": "on"}

    response = client.post(
        url, {**data, **option_formset(("با فرم CAB", False, True), ("بدون تأیید", True, True), ("", False, False))}
    )

    assert response.status_code == 302
    question = questionnaire.questions.get()
    assert list(question.options.values_list("text", "indicates_risk")) == [("با فرم CAB", False), ("بدون تأیید", True)]


def test_a_choice_question_needs_two_active_options(client, grc, questionnaire):
    client.force_login(grc)
    data = {"order": "1", "text": "سؤال", "kind": "multiple", "is_active": "on"}

    response = client.post(
        reverse("questionnaires:question_create", args=[questionnaire.pk]),
        {**data, **option_formset(("تنها گزینه", False, True), ("غیرفعال", False, False))},
    )

    assert "دست‌کم دو گزینه‌ی فعال" in response.context["form"].non_field_errors()[0]
    assert not Question.objects.filter(questionnaire=questionnaire).exists()


def test_a_yes_no_question_gets_yes_and_no(client, grc, questionnaire):
    client.force_login(grc)
    data = {"order": "1", "text": "پشتیبان‌گیری آزموده شده است؟", "kind": "yes_no", "is_active": "on"}

    client.post(reverse("questionnaires:question_create", args=[questionnaire.pk]), {**data, **option_formset()})

    assert list(Question.objects.get(questionnaire=questionnaire).options.values_list("text", flat=True)) == ["بله", "خیر"]


def test_scenario_and_category_are_only_for_risk_options(client, grc, questionnaire):
    scenario = RiskScenario.objects.create(
        title="قطع پشتیبان", event="ر", conditions="ش", consequence="پ", category=RiskCategory.objects.get(code="T7")
    )
    client.force_login(grc)
    data = {"order": "1", "text": "سؤال", "kind": "single", "is_active": "on"}
    options = option_formset(("الف", False, True), ("ب", False, True))
    options["options-0-scenario"] = str(scenario.pk)

    response = client.post(reverse("questionnaires:question_create", args=[questionnaire.pk]), {**data, **options})

    assert "فقط برای گزینه‌ی «نشانه‌ی ریسک»" in response.context["formset"].forms[0].errors["indicates_risk"][0]
    with pytest.raises(IntegrityError), transaction.atomic():
        Option.objects.create(question=add_question(questionnaire, "س", "text"), text="ج", scenario=scenario)


def test_an_answered_question_keeps_its_kind(client, grc, questionnaire, unit, manager):
    question = add_question(questionnaire, "شرح ابزارها", Question.Kind.TEXT)
    Answer.objects.create(response=start(questionnaire, unit, manager), question=question, text="اکسل")
    client.force_login(grc)

    response = client.post(
        reverse("questionnaires:question_update", args=[question.pk]),
        {
            "order": "1",
            "text": "شرح ابزارها",
            "kind": "single",
            "is_active": "on",
            **option_formset(("الف", False, True), ("ب", False, True)),
        },
    )

    assert "نوعش عوض نمی‌شود" in response.context["form"].errors["kind"][0]


def test_unit_managers_answer_for_their_units_only(client, questionnaire, unit, manager):
    other = OrgUnit.objects.create(name="مالی")
    Questionnaire.objects.create(title="پیش‌نویس GRC")  # غیرفعال
    client.force_login(manager)

    home = client.get(reverse("questionnaires:answer_home"))
    # پرسشنامه‌ی کلاسیک (فیگما ۱۰) و شاخه‌ای هر دو فهرست می‌شوند؛ پیش‌نویس غیرفعال نه.
    assert set(home.context["questionnaires"]) == {questionnaire, Questionnaire.objects.get(is_structured=True)}
    assert home.context["can_answer"] is True

    url = reverse("questionnaires:response_start", args=[questionnaire.pk])
    assert "org_unit" in client.post(url, {"org_unit": other.pk}).context["form"].errors

    response = client.post(url, {"org_unit": unit.pk})
    created = Response.objects.get()
    assert response.url == reverse("questionnaires:response_answer", args=[created.pk])
    assert (created.respondent, created.recorded_by, created.channel) == (manager, manager, "questionnaire")
    assert created.status == Response.Status.DRAFT


def test_people_without_units_cannot_start_a_response(client, questionnaire):
    client.force_login(make_user("viewer", Role.VIEWER))

    assert client.get(reverse("questionnaires:answer_home")).context["can_answer"] is False
    assert client.get(reverse("questionnaires:response_start", args=[questionnaire.pk])).status_code == 403


def test_the_service_must_belong_to_the_unit_and_open_responses_are_not_doubled(client, questionnaire, unit, manager):
    mine = make_service("SRV-1", org_unit=unit)
    elsewhere = make_service("SRV-2")
    client.force_login(make_user("grc", Role.GRC_MEMBER))  # GRC همه‌ی خدمت‌ها را در فهرست می‌بیند
    url = reverse("questionnaires:response_start", args=[questionnaire.pk])

    response = client.post(url, {"org_unit": unit.pk, "service": elsewhere.pk, "respondent": manager.pk})
    assert "مال واحد" in response.context["form"].errors["service"][0]

    client.post(url, {"org_unit": unit.pk, "service": mine.pk, "respondent": manager.pk})
    response = client.post(url, {"org_unit": unit.pk, "service": mine.pk, "respondent": manager.pk})
    assert "پاسخ بازی" in response.context["form"].non_field_errors()[0]
    assert Response.objects.count() == 1


def test_grc_records_an_interview_in_the_name_of_a_unit_manager(client, grc, questionnaire, unit, manager):
    stranger = make_user("stranger", Role.UNIT_MANAGER)
    stranger.managed_units.add(OrgUnit.objects.create(name="فروش"))
    client.force_login(grc)
    url = reverse("questionnaires:response_start", args=[questionnaire.pk])

    response = client.post(url, {"org_unit": unit.pk, "respondent": stranger.pk})
    assert "مدیر واحد" in response.context["form"].errors["respondent"][0]

    client.post(url, {"org_unit": unit.pk, "respondent": manager.pk})
    created = Response.objects.get()
    assert (created.respondent, created.recorded_by, created.channel) == (manager, grc, "interview")


def test_every_response_starts_with_the_unit_functions_and_the_eight_session_questions(
    client, questionnaire, unit, manager
):
    response = start(questionnaire, unit, manager)
    client.force_login(manager)
    url = reverse("questionnaires:response_answer", args=[response.pk])

    form = client.get(url).context["form"]
    labels = [field.label for field in form.fixed_fields()]
    assert labels[0] == "کارکردهای اصلی و تعهدهای واحد"
    assert labels[1:] == [
        "چه نتیجه‌ای لازم است برای شرکت یا مشتری ایجاد شود؟",
        "چه تعهد زمانی یا کیفی داریم؟",
        "چه اتفاقی می‌تواند مانع انجام آن شود؟",
        "در چه شرایطی این اتفاق ممکن می‌شود؟",
        "اگر رخ دهد چه کسی و چگونه آسیب می‌بیند؟",
        "به چه افراد یا خدماتی وابسته‌ایم؟",
        "چه شاهد، تجربه یا تغییر تازه‌ای داریم؟",
        "امروز چه چیزی جلوی وقوع یا خسارت را می‌گیرد؟",
    ]

    client.post(
        url, {"conditions": "وقتی تنظیمات مقصد دستی وارد می‌شود", "current_controls": "بازبینی دونفره", "save": ""}
    )
    page = client.get(response.get_absolute_url()).content.decode()
    assert "وقتی تنظیمات مقصد دستی وارد می‌شود" in page and "بازبینی دونفره" in page


def test_a_draft_is_saved_and_submit_checks_required_questions(client, questionnaire, unit, manager):
    tools = add_question(questionnaire, "چه ابزارهایی به کار می‌برید؟", Question.Kind.TEXT, is_required=True)
    backup = add_question(questionnaire, "پشتیبان آزموده شده؟", Question.Kind.YES_NO, [("بله", False), ("خیر", True)])
    response = start(questionnaire, unit, manager)
    client.force_login(manager)
    url = reverse("questionnaires:response_answer", args=[response.pk])
    no = backup.options.get(text="خیر")

    client.post(url, {"mission": "تسویه‌ی روزانه", f"question_{backup.pk}": no.pk, "save": ""})
    response.refresh_from_db()
    assert response.mission == "تسویه‌ی روزانه"
    assert list(response.answers.get(question=backup).options.all()) == [no]

    page = client.post(url, {"mission": "تسویه‌ی روزانه", f"question_{backup.pk}": no.pk, "submit": ""})
    assert "اجباری" in page.context["form"].errors[f"question_{tools.pk}"][0]
    response.refresh_from_db()
    assert response.status == Response.Status.DRAFT

    page = client.post(
        url, {f"question_{tools.pk}": "اکسل و سامانه‌ی تسویه", f"question_{backup.pk}": no.pk, "submit": ""}
    )
    response.refresh_from_db()
    assert page.url == response.get_absolute_url()
    assert response.status == Response.Status.SUBMITTED
    assert response.submitted_at is not None


def test_submitting_turns_risk_options_and_the_new_item_into_pending_risks(questionnaire, unit, manager):
    scenario = RiskScenario.objects.create(
        title="شکست بازیابی", event="ر", conditions="ش", consequence="پ", category=RiskCategory.objects.get(code="T7")
    )
    question = add_question(questionnaire, "پشتیبان آزموده شده؟", Question.Kind.YES_NO, [("بله", False), ("خیر", True)])
    risky = question.options.get(text="خیر")
    risky.scenario = scenario
    risky.save()
    response = start(questionnaire, unit, manager, new_item="کلید رمز دست یک نفر است.")
    Answer.objects.create(response=response, question=question).options.add(risky)

    submit_response(response)

    from_option, from_new_item = response.pending_risks.order_by("pk")
    assert (from_option.source, from_option.option, from_option.scenario) == ("option", risky, scenario)
    assert "جواب: خیر" in from_option.description
    assert (from_new_item.source, from_new_item.description) == ("new_item", "کلید رمز دست یک نفر است.")

    # بعد از برگشت و ارسال دوباره، ریسک در انتظار تکراری ساخته نمی‌شود و شرح مورد جدید تازه می‌شود.
    response.new_item = "کلید رمز و رمز مدیر دست یک نفر است."
    submit_response(response)
    assert response.pending_risks.count() == 2
    assert response.pending_risks.get(source="new_item").description == "کلید رمز و رمز مدیر دست یک نفر است."


def test_a_submitted_response_is_locked_until_grc_returns_it(client, grc, questionnaire, unit, manager):
    response = start(questionnaire, unit, manager)
    submit_response(response)
    client.force_login(manager)
    answer_url = reverse("questionnaires:response_answer", args=[response.pk])
    assert client.get(answer_url).status_code == 403
    assert client.get(reverse("questionnaires:response_return", args=[response.pk])).status_code == 403

    client.force_login(grc)
    page = client.post(
        reverse("questionnaires:response_return", args=[response.pk]), {"question": "کدام سامانه؟"}, follow=True
    )
    response.refresh_from_db()
    # مهلت در پیام هم مثل همه‌جای سامانه شمسی است.
    assert f"مهلت جواب تا {to_jalali(response.return_due)}" in page.content.decode()
    assert response.status == Response.Status.RETURNED
    assert response.return_question == "کدام سامانه؟"
    assert response.return_due == add_working_days(timezone.localdate(), 5)
    assert not response.is_overdue

    client.force_login(manager)
    assert client.get(answer_url).status_code == 200
    response.return_due = timezone.localdate() - datetime.timedelta(days=1)
    assert response.is_overdue


def test_a_response_is_reviewed_only_after_every_pending_risk_is_decided(client, grc, questionnaire, unit, manager):
    response = start(questionnaire, unit, manager, new_item="مورد تازه")
    submit_response(response)
    pending = response.pending_risks.get()
    client.force_login(grc)
    reviewed_url = reverse("questionnaires:response_reviewed", args=[response.pk])

    client.post(reviewed_url)
    response.refresh_from_db()
    assert response.status == Response.Status.SUBMITTED

    page = client.post(reverse("questionnaires:pending_dismiss", args=[pending.pk]), {"dismiss_reason": ""})
    assert "dismiss_reason" in page.context["form"].errors

    duplicate = Risk.objects.create(
        title="ریسک موجود",
        description="ش",
        channel="interview",
        category=RiskCategory.objects.get(code="T1"),
        org_unit=unit,
    )
    client.post(
        reverse("questionnaires:pending_dismiss", args=[pending.pk]),
        {"dismiss_reason": "تکراری", "duplicate_of": duplicate.pk},
    )
    pending.refresh_from_db()
    assert (pending.status, pending.duplicate_of, pending.decided_by) == ("dismissed", duplicate, grc)

    client.post(reviewed_url)
    response.refresh_from_db()
    assert (response.status, response.reviewed_by) == ("reviewed", grc)


def test_converting_a_pending_risk_prefills_and_registers_the_risk(client, grc, questionnaire, unit, manager):
    service = make_service("SRV-1", org_unit=unit)
    category = RiskCategory.objects.get(code="T4")
    response = start(questionnaire, unit, manager, service=service, new_item="خطای ورود دستی در تسویه")
    submit_response(response)
    pending = response.pending_risks.get()
    pending.category = category
    pending.save()
    scenario = RiskScenario.objects.create(
        title="سناریوی تسویه", service=service, category=category,
        conditions="خرابی", event="قطع تسویه", consequence="وقفه",
    )
    client.force_login(grc)
    url = reverse("questionnaires:pending_convert", args=[pending.pk])

    assert scenario.title in client.get(url).content.decode()
    url = f"{url}?scenario={scenario.pk}"
    initial = client.get(url).context["form"].initial
    assert (initial["scenario"], initial["service"], initial["org_unit"]) == (scenario, service, unit)
    assert (initial["category"], initial["channel"]) == (category, "questionnaire")

    page = client.post(
        url,
        {
            "initiator": "خرابی",
            "realization_path": "وقفه در اتصال",
            "channel": "questionnaire",
            "service": service.pk,
            "category": category.pk,
        },
    )

    risk = Risk.objects.get()
    pending.refresh_from_db()
    assert page.url == risk.get_absolute_url()
    assert (pending.status, pending.risk, pending.decided_by) == ("converted", risk, grc)
    assert (risk.org_unit, risk.channel, risk.status) == (unit, "questionnaire", Risk.Status.SUBMITTED)
    assert not Coverage.objects.filter(service=service, category=category).exists()
    assert client.get(url).status_code == 302  # تکلیفش تعیین شده و دوباره ثبت نمی‌شود


def test_grc_adds_a_pending_risk_by_hand_from_a_text_answer(client, grc, questionnaire, unit, manager):
    response = start(questionnaire, unit, manager)
    submit_response(response)
    client.force_login(grc)

    client.post(reverse("questionnaires:pending_create", args=[response.pk]), {"description": "وابستگی به یک نفر"})

    assert response.pending_risks.get().source == PendingRisk.Source.MANUAL


def test_responses_are_visible_to_their_unit_managers_and_grc_only(client, grc, questionnaire, unit, manager):
    response = start(questionnaire, unit, manager)
    other_manager = make_user("other", Role.UNIT_MANAGER)
    other_manager.managed_units.add(OrgUnit.objects.create(name="مالی"))

    client.force_login(other_manager)
    assert client.get(response.get_absolute_url()).status_code == 404
    assert list(client.get(reverse("questionnaires:response_list")).context["responses"]) == []

    client.force_login(grc)
    assert client.get(response.get_absolute_url()).status_code == 200
    assert list(client.get(reverse("questionnaires:response_list"), {"status": "draft"}).context["responses"]) == [
        response
    ]


def test_the_pending_count_stays_right_when_the_list_is_filtered_by_pending(client, grc, questionnaire, unit, manager):
    response = start(questionnaire, unit, manager, new_item="وابستگی به یک نفر")
    submit_response(response)
    for text in ["قطع برق", "خطای انسانی"]:
        PendingRisk.objects.create(response=response, source=PendingRisk.Source.MANUAL, description=text)
    client.force_login(grc)

    for params in [{}, {"pending": "yes"}]:
        responses = list(client.get(reverse("questionnaires:response_list"), params).context["responses"])
        assert [(item, item.pending_count) for item in responses] == [(response, 3)], params


def test_the_database_guards_pending_risk_decisions(questionnaire, unit, manager):
    response = start(questionnaire, unit, manager)

    with pytest.raises(IntegrityError), transaction.atomic():
        PendingRisk.objects.create(response=response, source="manual", description="ش", status="dismissed")
    with pytest.raises(IntegrityError), transaction.atomic():
        PendingRisk.objects.create(response=response, source="manual", description="ش", status="converted")
