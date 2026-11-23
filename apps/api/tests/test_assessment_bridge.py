"""صفحه‌های ارزیابی در رابط React از راه پل جنگو: پرونده‌ی ارزیابی با نتیجه‌ی موتور محاسبه، کنترل کیفیت، فرم‌های
عامل آغازگر و مسیر و پروفایل پیامد (چند فرم با پیشوند)، و مقایسه. همه همان view و همان قاعده‌های جنگو."""

import pytest
from django.urls import reverse

from apps.accounts.roles import Role
from apps.api.routes import spa_route
from apps.assessments.models import Assessment, Path
from apps.assessments.services import create_assessment
from apps.assessments.tests import test_results
from apps.catalog.tests.factories import make_user

from .test_bridge import form, page, send, values_of

pytestmark = pytest.mark.django_db
S = Assessment.Status

# همان داده‌ی آزمون‌های ارزیابی: ارزیابی جاری کامل با A برابر ۲، یک مسیر با B0 برابر ۳ و پیامد ۳ برای بانک.
bank, checker, evidence, grc = test_results.bank, test_results.checker, test_results.evidence, test_results.grc
ready, risk, workgroup = test_results.ready, test_results.risk, test_results.workgroup


@pytest.fixture
def api(client):
    def login(user):
        client.force_login(user)
        return client

    return login


def test_assessment_pages_have_react_routes(ready):
    pk = ready.pk
    assert spa_route(f"/assessments/{pk}/") == f"/assessments/{pk}"
    assert spa_route(f"/assessments/{pk}/impacts/") == f"/assessments/{pk}/impacts"
    assert spa_route(f"/assessments/{pk}/#likelihood") == f"/assessments/{pk}#likelihood"
    assert spa_route("/assessments/compare/?id=1&id=2") == "/assessments/compare?id=1&id=2"


def test_the_dossier_shows_the_engine_result_and_what_the_user_may_do(api, grc, ready, bank):
    data = page(api(grc), ready.get_absolute_url()).json()

    assert data["view"] == "assessments:assessment_detail"
    assert data["title"] == f"ارزیابی جاری {ready.code}"
    assert data["assessment"]["risk"]["code"] == ready.risk.code
    assert data["assessment"]["meeting_date"]["jalali"] == "1405/07/28"
    outcome = data["outcome"]
    assert outcome["score"] == [6, 6] and outcome["decision_level"]["name"] == "متوسط"
    assert outcome["likelihood"] == [2, 2] and outcome["provisional"] is True
    likelihood = data["likelihood"]
    assert likelihood["a"] == "2" and likelihood["initiator"]["basis"]["value"] == "forward"
    path = likelihood["paths"][0]
    assert path["b"] == [3, 3] and path["b0"] == "3"
    assert path["edit_url"] == reverse("assessments:path_update", args=[ready.paths.get().pk])
    impacts = data["impacts"]
    assert impacts["stakeholders"] == ["داتین", bank.name]
    assert [row["code"] for row in impacts["rows"]] == ["S", "D", "F", "C", "R"]
    assert impacts["rows"][0]["cells"][1]["level"] == "3"
    review = data["review"]
    assert review["can_submit"] and review["submission_problems"] == []
    assert review["submit_url"] == reverse("assessments:submit", args=[ready.pk])
    assert not review["can_review"] and review["review_url"] is None
    assert data["actions"]["impact_profile"] == reverse("assessments:impact_profile", args=[ready.pk])

    # کسی که ارزیابی را نمی‌بیند، پرونده‌اش را از API هم نمی‌بیند.
    assert page(api(make_user("stranger")), ready.get_absolute_url()).status_code == 404


def test_quality_control_runs_through_the_same_views(api, grc, checker, ready):
    client = api(grc)
    response = send(client, reverse("assessments:submit", args=[ready.pk]), {"notes": "آماده است"})
    assert response.status_code == 200
    assert response.json()["redirect"]["route"] == f"/assessments/{ready.pk}#review"
    ready.refresh_from_db()
    assert ready.status == S.IN_QC
    # ارزیاب ارزیابی خودش را کنترل نمی‌کند؛ همان ۴۰۳ جنگو.
    assert send(client, reverse("assessments:review", args=[ready.pk]), {"action": "approve"}).status_code == 403

    client = api(checker)
    data = page(client, ready.get_absolute_url()).json()["review"]
    assert data["can_review"] and data["review_notes"]["name"] == "notes"
    returned = send(client, data["review_url"], {"action": "return", "notes": " "})
    assert returned.status_code == 400 and "اختلاف" in returned.json()["message"]
    approved = send(client, data["review_url"], {"action": "approve", "notes": ""})
    assert approved.status_code == 200
    ready.refresh_from_db()
    assert ready.status == S.APPROVED
    data = page(client, ready.get_absolute_url()).json()
    assert data["outcome"]["provisional"] is False and data["actions"]["edit"] is None
    assert [item["action"]["value"] for item in data["review"]["history"]] == ["approve", "submit"]


def test_the_initiator_form_brings_the_risk_boundary_and_the_a_table(api, grc, ready):
    url = reverse("assessments:initiator", args=[ready.pk])
    data = form(api(grc), url).json()

    assert data["title"] == f"عامل آغازگر (A) در ارزیابی جاری {ready.code}"
    assert data["cancel"]["route"] == f"/assessments/{ready.pk}#likelihood"
    assert data["facts"]["rows"][0] == {"label": "عامل آغازگر", "value": ready.risk.initiator}
    levels = ready.method_version.scales.get(code="A").levels.count()
    assert len(data["guides"][0]["items"]) == levels
    names = [field["name"] for field in data["form"]["fields"]]
    # مرز شمارش ریسک (دامنه، واحد شمارش و استثناها) پیش از مسیر A در همین فرم ثبت می‌شود.
    assert names[:5] == ["risk_scope", "risk_count_unit", "risk_count_exclusions", "a_basis", "a_count"]
    assert "a_evidence" in names

    values = {**values_of(data["form"]), "a_basis": "rate", "a_count": ""}
    response = send(api(grc), url, values)
    assert response.status_code == 400
    assert "تعداد آغازگر" in response.json()["errors"]["a_count"][0]


def test_a_path_is_added_with_the_b0_table_beside_the_form(api, grc, ready, evidence):
    url = reverse("assessments:path_create", args=[ready.pk])
    data = form(api(grc), url).json()
    assert [guide["title"] for guide in data["guides"]] == ["B0: قابلیت پایه‌ی مسیر (بخش ۱۵)", "Bc از E کنترل‌های مسیر"]
    assert data["cancel"]["href"] == f"{ready.get_absolute_url()}#likelihood"

    values = {
        **values_of(data["form"]),
        "name": "دسترسی مستقیم به سرور",
        "description": "ورود با حساب مدیریتی و تغییر دستی تنظیمات",
        "b0_level": "2",
        "b0_confidence": "medium",
        "b0_rationale": "دسترسی مدیریتی محدود",
        "evidence": [str(evidence.pk)],
    }
    response = send(api(grc), url, values)
    assert response.status_code == 200, response.json()
    path = Path.objects.get(name="دسترسی مستقیم به سرور")
    assert response.json()["redirect"]["route"] == f"/assessments/{ready.pk}#path-{path.pk}"

    deleted = send(api(grc), reverse("assessments:path_delete", args=[path.pk]), {})
    assert deleted.status_code == 200 and "حذف شد" in deleted.json()["message"]
    assert not Path.objects.filter(pk=path.pk).exists()


def test_the_impact_profile_is_one_page_of_prefixed_forms(api, grc, ready, bank):
    url = reverse("assessments:impact_profile", args=[ready.pk])
    data = form(api(grc), url).json()

    assert data["form"] is None and data["title"] == f"پروفایل پیامد ارزیابی جاری {ready.code}"
    assert [group["name"] for group in data["groups"]] == ["داتین", bank.name]
    datin_s = data["groups"][0]["rows"][0]
    assert datin_s["prefix"] == "datin-S" and datin_s["scale"]["code"] == "S"
    names = {field["name"] for field in datin_s["fields"]}
    assert {"datin-S-level", "datin-S-rationale", "datin-S-evidence"} <= names
    bank_s = data["groups"][1]["rows"][0]
    assert next(field for field in bank_s["fields"] if field["name"] == f"{bank.pk}-S-level")["value"] == "3"

    values = {}
    for group in data["groups"]:
        for row in group["rows"]:
            values.update(values_of(row))
    # صفر بی‌دلیل پذیرفته نیست و خطا کنار همان خانه می‌آید.
    response = send(api(grc), url, {**values, "datin-D-rationale": ""})
    assert response.status_code == 400
    body = response.json()
    assert body["errors"]["datin-D-rationale"] == ["صفر یعنی «اثر ندارد» و دلیل می‌خواهد."]
    assert "بعضی خانه‌ها ایراد دارند" in body["message"]

    # «ذخیره‌ی پیش‌نویس» در همین صفحه می‌ماند و «ادامه» به عامل آغازگر می‌رود (فیگما ۰۶).
    saved = send(api(grc), url, {**values, f"{bank.pk}-S-level": "4"})
    assert saved.status_code == 200
    assert saved.json()["redirect"]["route"] == f"/assessments/{ready.pk}/impacts"
    assert ready.impacts.get(customer=bank, scale__code="S").level == 4
    continued = send(api(grc), url, {**values, "next": "initiator"})
    assert continued.json()["redirect"]["route"] == f"/assessments/{ready.pk}/initiator"


def test_the_impact_profile_carries_the_figma_header_and_overview(api, grc, ready, bank):
    url = reverse("assessments:impact_profile", args=[ready.pk])
    data = form(api(grc), url).json()

    header = data["assessment"]
    assert header["code"] == ready.code and header["stakeholders"] == ["داتین", bank.name]
    assert header["saved_at"]["jalali"]
    overview = data["overview"]
    assert overview["impact"] == [3, 3]
    assert overview["top"] == {"code": "S", "name": ready.method_version.scales.get(code="S").name, "stakeholder": bank.name}
    assert [check["ok"] for check in overview["checks"]] == [True, True, True]
    assert data["note"].startswith("سطح S از مدت اختلال")

    # یک خانه نامعلوم شود: I بازه یا نامعلوم است و توضیح کارت همان را می‌گوید.
    detail = ready.impacts.get(customer=bank, scale__code="S")
    detail.level, detail.confidence = None, ""
    detail.save()
    overview = form(api(grc), url).json()["overview"]
    assert overview["top"] is None
    assert "نامعلوم" in overview["text"]


def test_two_assessments_are_compared_column_by_column(api, grc, ready):
    other = create_assessment(ready.risk, grc, "target", horizon_months=12)
    client = api(grc)
    data = page(client, f"{reverse('assessments:compare')}?id={ready.pk}&id={other.pk}").json()

    assert data["error"] is None and [item["code"] for item in data["profiles"]] == [ready.code, other.code]
    labels = [row["label"] for row in data["rows"]]
    assert labels[:3] == ["A", "B", "L"] and "سطح تصمیم" in labels
    decision = next(row for row in data["rows"] if row["label"] == "سطح تصمیم")
    assert decision["cells"][0]["level"]["name"] == "متوسط"

    single = page(client, f"{reverse('assessments:compare')}?ids={ready.pk}").json()
    assert single["error"] == "دو تا چهار ارزیابی را برای مقایسه انتخاب کنید."


def test_a_workgroup_member_sees_the_referral_form(api, grc, checker, workgroup, ready):
    send(api(grc), reverse("assessments:submit", args=[ready.pk]), {"notes": ""})
    send(api(checker), reverse("assessments:review", args=[ready.pk]), {"action": "refer", "notes": "هم‌نظر نیستیم"})
    data = page(api(workgroup), ready.get_absolute_url()).json()["review"]
    assert data["can_decide_referral"]
    assert [field["name"] for field in data["referral_form"]["fields"]] == ["meeting_date", "notes"]
    missing = send(
        api(workgroup), data["referral_url"], {"action": "workgroup_approve", "notes": "", "meeting_date": ""}
    )
    assert missing.status_code == 400 and "تاریخ جلسه" in missing.json()["message"]
    decided = send(
        api(workgroup),
        data["referral_url"],
        {"action": "workgroup_approve", "notes": "B0 همان ۳ است", "meeting_date": "1405/08/10"},
    )
    assert decided.status_code == 200
    ready.refresh_from_db()
    assert ready.status == S.APPROVED
    assert Role.SECURITY_WORKGROUP in [group.name for group in workgroup.groups.all()]


def test_the_dossier_carries_the_figma_steps_chain_checks_and_flags(api, grc, checker, ready, bank):
    data = page(api(grc), ready.get_absolute_url()).json()

    steps = {step["key"]: step for step in data["steps"]}
    assert list(steps) == ["scope", "impacts", "initiator", "paths", "result", "review"]
    assert steps["paths"]["state"] == "done" and steps["paths"]["sub"] == "۱ مسیر · B = ۳"
    assert steps["result"] == {
        "key": "result", "label": "نتیجه و تصمیم", "sub": "موقت تا تأیید", "state": "current", "warning": False,
    }
    assert steps["review"]["state"] == "todo" and steps["review"]["sub"] == "بدون هشدار"

    chain = data["chain"]
    assert chain["a"] == "2" and chain["b"] == [3, 3] and chain["likelihood"] == [2, 2]
    assert chain["impact"] == [3, 3] and chain["score"] == [6, 6]
    assert chain["impact_source"].endswith(bank.name)
    assert chain["decision_level"]["name"] == "متوسط"
    grid = chain["grid"]
    assert (grid["a"], grid["b"]) == (2, 3)
    assert len(grid["rows"]) == ready.method_version.scales.get(code="A").levels.count()
    assert grid["rows"][1]["a"] == 2 and grid["rows"][1]["cells"][2] == 2
    path = ready.paths.get()
    assert any(f"«{path.name}»" in note["text"] and "تعیین‌کننده" in note["text"] for note in chain["notes"])
    row = data["likelihood"]["paths"][0]
    assert row["determining"] is True
    assert [item["code"] for item in row["evidence"]] == [item.code for item in path.evidence.all()]

    assert all(check["ok"] for check in data["checks"])
    assert "escalation" not in [check["key"] for check in data["checks"]]
    assert [flag["on"] for flag in data["flags"]["items"]] == [False, False, False]
    assert data["assessment"]["submitted_at"] is None and data["assessment"]["reviewer"] is None

    # شاهد پیامد مثبت برداشته شود: همان قاعده‌ی ارسال در فهرست بررسی‌ها و گام کنترل کیفیت دیده می‌شود.
    ready.impacts.get(customer=bank, scale__code="S").evidence.clear()
    data = page(api(grc), ready.get_absolute_url()).json()
    failing = [check for check in data["checks"] if not check["ok"]]
    assert [check["key"] for check in failing] == ["impact_evidence"]
    assert "شاهد ندارد" in failing[0]["problems"][0]
    assert data["review"]["submission_problems"] == failing[0]["problems"]
    review = next(step for step in data["steps"] if step["key"] == "review")
    assert review["warning"] is True and review["sub"] == "۱ هشدار"


def test_the_dossier_header_names_the_submission_and_the_checker(api, grc, checker, ready):
    send(api(grc), reverse("assessments:submit", args=[ready.pk]), {"notes": "آماده است"})
    send(api(checker), reverse("assessments:review", args=[ready.pk]), {"action": "return", "notes": "شاهد کم است"})

    header = page(api(grc), ready.get_absolute_url()).json()["assessment"]
    assert header["submitted_at"]["jalali"]
    assert header["reviewer"]["name"] == checker.get_full_name()
