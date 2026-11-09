"""پل صفحه‌های جنگو برای رابط React: همان view، همان دسترسی، همان اعتبارسنجی و همان پیام‌ها، به شکل JSON."""

import datetime

import pytest
from django.contrib.contenttypes.models import ContentType
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client
from django.urls import reverse, reverse_lazy
from django.utils import timezone

from apps.accounts.roles import Role
from apps.api import formatting as fmt
from apps.api.routes import route_table, spa_route
from apps.audit.models import AuditEvent
from apps.catalog.models import Customer
from apps.catalog.tests.factories import make_service, make_user
from apps.core.models import Attachment, Comment
from apps.organization.models import OrgUnit
from apps.risks.models import Coverage, Evidence, Risk, RiskCategory, RiskScenario
from apps.workflow.models import ChangeRequest

pytestmark = pytest.mark.django_db
S = Risk.Status


@pytest.fixture(autouse=True)
def media(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    settings.ATTACHMENT_X_ACCEL_PREFIX = ""


@pytest.fixture
def grc():
    return make_user("grc", Role.GRC_MEMBER, first_name="سارا", last_name="احمدی")


@pytest.fixture
def owner():
    return make_user("owner", first_name="رضا", last_name="مالکی")


@pytest.fixture
def api(client):
    def login(user):
        client.force_login(user)
        return client

    return login


def make_risk(title="قطع درگاه پرداخت", owner=None, ready=False, **fields):
    service = make_service(f"SRV-{Risk.objects.count() + 1}") if ready else None
    risk = Risk.objects.create(
        title=title,
        description="شرح",
        channel=Risk.Channel.INTERVIEW,
        category=RiskCategory.objects.get(code="T1"),
        org_unit=service.org_unit if service else OrgUnit.objects.create(name=f"واحد {title}"),
        service=service,
        owner=owner,
        **fields,
    )
    if ready:
        risk.customers.add(Customer.objects.create(name=f"بانک {risk.pk}"))
    return risk


def make_evidence(owner, *risks, **fields):
    values = {
        "kind": Evidence.Kind.INCIDENT,
        "title": "گزارش رخداد",
        "summary": "خلاصه",
        "source": "سامانه‌ی تیکت",
        "observed_on": datetime.date(2026, 10, 1),
        "reliability": Evidence.Reliability.HIGH,
        **fields,
    }
    evidence = Evidence.objects.create(owner=owner, **values)
    evidence.risks.add(*risks)
    return evidence


def form(client, path):
    return client.get(reverse("api:form_bridge"), {"path": path})


def send(client, path, values, **extra):
    return client.post(
        f"{reverse('api:form_bridge')}?path={path}", {"values": values}, content_type="application/json", **extra
    )


def page(client, path):
    return client.get(reverse("api:page_bridge"), {"path": path})


def values_of(described):
    """مقدار فعلی هر فیلد همان‌طور که رابط React از توصیف فرم برمی‌دارد و دوباره می‌فرستد."""
    return {field["name"]: field["value"] for field in described["fields"] if field["kind"] != "file"}


# جدول پیوندها


def test_django_addresses_map_to_their_react_routes():
    assert spa_route(reverse_lazy("risks:risk_list")) == "/risks"
    assert spa_route("/risks/12/edit/?next=/risks/") == "/risks/12/edit?next=/risks/"
    assert spa_route("/questionnaires/responses/5/answer/") == "/responses/5"
    assert spa_route("/risks/7/#comments") == "/risks/7#comments"
    assert spa_route("/actions/mine/") == "/"
    assert spa_route("/risks/coverage/3/1/") == "/risks/coverage/3/1"
    # صفحه‌ای که هنوز فقط در جنگو است، یا نشانی‌ای که اصلاً نیست، پیوند معمولی جنگو می‌ماند.
    assert spa_route("/accounts/users/") is None
    assert spa_route("/no-such-page/") is None
    assert spa_route("") is None

    table = {row["name"]: row for row in route_table()}
    assert table["risks:risk_update"]["pattern"] == "^/risks/(?<pk>[0-9]+)/edit/$"
    assert table["risks:risk_update"]["route"] == "/risks/:pk/edit"
    assert table["risks:risk_update"]["form"] is True
    assert table["risks:evidence_list"]["form"] is False
    assert table["questionnaires:response_answer"]["route"] == "/responses/:pk"


@pytest.mark.parametrize(
    ("path", "cancel", "route"),
    [
        ("/risks/scenarios/new/", "/risks/scenarios/", "/risks/scenarios"),
    ],
)
def test_create_forms_resolve_lazy_cancel_urls(api, grc, path, cancel, route):
    response = form(api(grc), path)
    assert response.status_code == 200
    assert response.json()["cancel"] == {"href": cancel, "route": route}


def test_risk_creation_without_scenario_redirects_to_library(api, grc):
    response = form(api(grc), "/risks/new/")
    assert response.status_code == 409
    assert response.json()["redirect"]["route"] == "/risks/scenarios"


# فرم‌ها


def test_the_edit_form_comes_with_the_django_fields_values_and_cancel_address(api, grc, owner):
    risk = make_risk(owner=owner, ready=True)

    response = form(api(grc), f"/risks/{risk.pk}/edit/")

    assert response.status_code == 200
    data = response.json()
    assert data["view"] == "risks:risk_update"
    assert data["title"] == "ویرایش ریسک"
    assert data["cancel"] == {"href": risk.get_absolute_url(), "route": f"/risks/{risk.pk}"}
    fields = {field["name"]: field for field in data["form"]["fields"]}
    assert fields["title"]["value"] == risk.title
    assert fields["title"]["required"] is True
    assert fields["description"]["kind"] == "textarea"
    assert fields["category"]["kind"] == "select"
    assert {"value": str(risk.category.pk), "label": str(risk.category)} in [
        {"value": choice["value"], "label": choice["label"]} for choice in fields["category"]["choices"]
    ]
    assert fields["customers"]["kind"] == "multiselect"
    assert fields["customers"]["value"] == [str(customer.pk) for customer in risk.customers.all()]


def test_the_values_of_a_form_save_back_unchanged(api, grc, owner):
    """هر نوع فیلد (متن، انتخاب، چندتایی، تیک و تاریخ شمسی) همان‌طور که توصیف شده دوباره پذیرفته می‌شود."""
    risk = make_risk(owner=owner, ready=True)
    evidence = make_evidence(grc, risk, valid_until=datetime.date(2027, 1, 1))
    client = api(grc)

    for path in (f"/risks/{risk.pk}/edit/", f"/risks/evidence/{evidence.pk}/edit/"):
        values = values_of(form(client, path).json()["form"])
        response = send(client, path, values)
        assert response.status_code == 200, response.json()

    evidence.refresh_from_db()
    assert evidence.observed_on == datetime.date(2026, 10, 1)
    assert evidence.valid_until == datetime.date(2027, 1, 1)
    assert list(evidence.risks.all()) == [risk]
    risk.refresh_from_db()
    assert risk.customers.count() == 1


def test_a_saved_form_returns_the_django_message_and_where_to_go(api, grc):
    response = send(api(grc), "/risks/categories/new/", {"code": "T9", "name": "ریسک آزمون", "is_active": True})

    assert response.status_code == 200
    assert response.json() == {
        "message": "دسته‌ی «T9 ریسک آزمون» ثبت شد.",
        "redirect": {"href": "/risks/categories/", "route": "/risks/categories"},
    }
    assert RiskCategory.objects.get(code="T9").is_active is True
    # پیام در جواب آمد و در صفحه‌ی بعدی جنگو دوباره نشان داده نمی‌شود.
    assert "ثبت شد" not in api(grc).get(reverse("risks:category_list")).content.decode()


def test_an_invalid_form_returns_the_django_errors_and_saves_nothing(api, grc):
    response = send(api(grc), "/risks/categories/new/", {"code": "T1", "name": ""})

    assert response.status_code == 400
    data = response.json()
    assert data["errors"]["code"] == ["دسته‌ای با همین کد ثبت شده است."]
    assert data["errors"]["name"]
    assert {field["name"] for field in data["form"]["fields"] if field["errors"]} == {"code", "name"}
    assert RiskCategory.objects.filter(name="").count() == 0


def test_a_form_the_page_refuses_comes_back_with_its_reason(api, grc, owner):
    risk = make_risk(owner=owner, status=S.CLOSED)

    response = form(api(grc), f"/risks/{risk.pk}/edit/")

    assert response.status_code == 409
    assert response.json()["message"] == f"ریسک {risk.code} «بسته‌شده» است و ویرایش نمی‌شود."
    assert response.json()["redirect"]["route"] == f"/risks/{risk.pk}"


def test_the_form_checks_the_same_roles_and_logs_a_denial(api, owner):
    viewer = make_user("viewer", Role.VIEWER)

    assert form(api(viewer), "/risks/new/").status_code == 403
    assert send(api(viewer), "/risks/categories/new/", {"code": "T9", "name": "x"}).status_code == 403
    assert not RiskCategory.objects.filter(code="T9").exists()
    assert AuditEvent.objects.filter(event=AuditEvent.Event.PERMISSION_DENIED, user=viewer).count() == 2


def test_only_listed_pages_open_through_the_bridge(api, grc, system_admin):
    client = api(system_admin)

    # صفحه‌ای که در فهرست فرم‌ها نیست (حتی برای مدیر سامانه) انگار وجود ندارد.
    assert form(client, "/accounts/users/new/").status_code == 404
    assert form(client, "/risks/").status_code == 404
    assert page(client, "/risks/new/").status_code == 404
    assert form(client, "/no-such-page/").status_code == 404
    for target in ("https://evil.example/risks/new/", "//evil.example/risks/new/", "risks/new/", ""):
        assert form(client, target).status_code == 404
    # تصمیم ادغام فقط فرستاده می‌شود و صفحه‌اش از راه /api/pages/ خوانده می‌شود.
    risk = make_risk(owner=grc)
    change = ChangeRequest.objects.create(kind="split", risk=risk, parts="بخش", reason="دلیل", proposed_by=grc)
    assert form(client, change.get_absolute_url()).status_code == 404


def test_the_bridge_needs_login_and_the_csrf_token(grc):
    assert Client().get(reverse("api:form_bridge"), {"path": "/risks/new/"}).status_code == 403

    client = Client(enforce_csrf_checks=True)
    client.force_login(grc)
    values = {"code": "T9", "name": "ریسک آزمون", "is_active": True}
    assert send(client, "/risks/categories/new/", values).status_code == 403
    token = client.get(reverse("api:session")).json()["csrf_token"]
    assert send(client, "/risks/categories/new/", values, HTTP_X_CSRFTOKEN=token).status_code == 200


def test_a_transition_shows_its_conditions_and_moves_the_risk(api, grc, owner):
    client = api(grc)
    incomplete = make_risk(owner=None)

    data = form(client, f"/workflow/risks/{incomplete.pk}/transition/send_to_assessment/").json()
    assert data["transition"]["target"]
    assert data["submit"] == data["transition"]["label"]
    assert "مالک ریسک تعیین نشده است." in data["problems"]
    assert data["risk"]["code"] == incomplete.code

    ready = make_risk("ریسک کامل", owner=owner, ready=True)
    path = f"/workflow/risks/{ready.pk}/transition/send_to_assessment/"
    refused = send(client, path, {"reason": ""})
    assert refused.status_code == 400
    assert "فرض قابل آزمون" in refused.json()["message"]
    assert refused.json()["errors"]["__all__"]

    done = send(client, path, {"reason": "فرض: درگاه پشتیبان در ۱۵ دقیقه جایگزین نمی‌شود."})
    assert done.status_code == 200
    assert done.json()["redirect"]["route"] == f"/risks/{ready.pk}"
    ready.refresh_from_db()
    assert ready.status == S.ASSESSMENT


def test_a_coverage_cell_saves_and_goes_back_to_the_same_filters(api, grc):
    service = make_service("SRV-1")
    category = RiskCategory.objects.get(code="T2")
    client = api(grc)
    path = f"/risks/coverage/{service.pk}/{category.pk}/?next=/risks/coverage/%3Fq%3DSRV"

    data = form(client, path).json()
    assert data["cell"]["service"]["code"] == "SRV-1"
    assert data["next"] == "/risks/coverage/?q=SRV"

    response = send(client, path, {"status": "not_relevant", "reason": "این خدمت داده‌ی کارت ندارد.", "next": ""})
    assert response.status_code == 200
    assert response.json()["redirect"] == {"href": "/risks/coverage/?q=SRV", "route": "/risks/coverage?q=SRV"}
    assert Coverage.objects.get(service=service, category=category).reviewed_by == grc


def test_an_attachment_uploads_as_multipart(api, grc, owner):
    risk = make_risk(owner=owner)
    content_type = ContentType.objects.get_for_model(risk).pk
    path = f"/attachments/{content_type}/{risk.pk}/new/"
    client = api(grc)

    data = form(client, path).json()
    assert data["submit"] == "بارگذاری پیوست"
    described = data["form"]
    assert described["multipart"] is True
    file_field = next(field for field in described["fields"] if field["name"] == "file")
    assert file_field["max_size"] == 20 * 1024 * 1024
    assert ".pdf" in file_field["accept"]
    assert {"file": "file", "description": "text"}.items() <= {
        field["name"]: field["kind"] for field in described["fields"]
    }.items()

    upload = SimpleUploadedFile("report.pdf", b"%PDF-1.4\n%test\n", content_type="application/pdf")
    response = client.post(f"{reverse('api:form_bridge')}?path={path}", {"file": upload, "description": "گزارش"})
    assert response.status_code == 200, response.json()
    assert response.json()["message"] == "فایل «report.pdf» پیوست شد."
    assert response.json()["redirect"]["route"] == f"/risks/{risk.pk}#attachments"
    assert Attachment.objects.get().description == "گزارش"


def test_comments_are_written_and_edited_through_the_record_pages(api, grc, owner):
    risk = make_risk(owner=owner)
    content_type = ContentType.objects.get_for_model(risk).pk
    client = api(grc)

    empty = send(client, f"/comments/{content_type}/{risk.pk}/new/", {"text": "  "})
    assert empty.status_code == 400
    assert empty.json()["message"] == "نظر خالی ثبت نمی‌شود."

    saved = send(client, f"/comments/{content_type}/{risk.pk}/new/", {"text": "نظر اول"})
    assert saved.status_code == 200
    comment = Comment.objects.get()

    dossier = client.get(reverse("api:risk_detail", args=[risk.pk])).json()
    assert dossier["comment_url"] == f"/comments/{content_type}/{risk.pk}/new/"
    assert dossier["comments"][0]["edit_url"] == f"/comments/{comment.pk}/edit/"
    assert api(owner).get(reverse("api:risk_detail", args=[risk.pk])).json()["comments"][0]["edit_url"] is None

    edit = form(api(grc), f"/comments/{comment.pk}/edit/").json()
    assert values_of(edit["form"]) == {"text": "نظر اول"}
    assert form(api(owner), f"/comments/{comment.pk}/edit/").status_code == 403


def test_the_risk_owner_decides_a_change_request(api, grc, owner):
    risk = make_risk(owner=owner)
    target = make_risk("مقصد", owner=owner)
    change = ChangeRequest.objects.create(kind="merge", risk=risk, merge_into=target, reason="دلیل", proposed_by=grc)
    path = change.get_absolute_url()

    shown = page(api(grc), path).json()
    assert shown["decision"] is None
    assert shown["change"]["merge_into"]["code"] == target.code

    shown = page(api(owner), path).json()
    assert shown["decision"]["url"] == path
    assert shown["decision"]["note"]["kind"] == "textarea"
    assert target.code in shown["decision"]["effect"]

    assert send(api(grc), path, {"decision": "approve"}).status_code == 403
    refused = send(api(owner), path, {"decision": "reject", "note": ""})
    assert refused.status_code == 400
    assert refused.json()["errors"]["note"] == ["دلیل رد را بنویسید."]

    approved = send(api(owner), path, {"decision": "approve", "note": ""})
    assert approved.status_code == 200
    assert approved.json()["message"] == f"ریسک {risk.code} در {target.code} ادغام و بسته شد."
    risk.refresh_from_db()
    assert risk.status == S.CLOSED


# صفحه‌های خواندنی


def test_the_evidence_list_uses_the_django_filters_and_visibility(api, grc, owner):
    mine = make_risk(owner=owner)
    other = make_risk("ریسک دیگر")
    shown = make_evidence(grc, mine, title="گزارش قطع")
    make_evidence(grc, other, title="گزارش دیگر")
    make_evidence(grc, mine, title="آزمون بازیابی", kind=Evidence.Kind.TEST)

    data = page(api(owner), "/risks/evidence/?kind=incident").json()

    assert data["view"] == "risks:evidence_list"
    assert [row["code"] for row in data["results"]] == [shown.code]
    assert data["count"] == 1 and data["pages"] == 1
    filters = {field["name"]: field for field in data["filters"]["fields"]}
    assert filters["kind"]["value"] == "incident"
    assert filters["kind"]["empty_label"] == "همه"
    assert data["create_url"] == reverse("risks:evidence_create")
    assert page(api(grc), "/risks/evidence/").json()["count"] == 3


def test_the_evidence_page_has_its_risks_files_comments_and_actions(api, grc, owner):
    risk = make_risk(owner=owner)
    evidence = make_evidence(grc, risk, url="https://tickets.example.test/INC-1")
    hidden = make_evidence(grc, make_risk("ریسک دیگر"))

    data = page(api(owner), evidence.get_absolute_url()).json()

    assert data["evidence"]["url"] == "https://tickets.example.test/INC-1"
    assert data["evidence"]["observed_on"]["jalali"] == "1405/07/09"
    assert [row["code"] for row in data["risks"]] == [risk.code]
    assert data["edit_url"] is None
    assert data["comment_url"]
    assert page(api(grc), evidence.get_absolute_url()).json()["edit_url"] == f"/risks/evidence/{evidence.pk}/edit/"
    assert page(api(owner), hidden.get_absolute_url()).status_code == 404


def test_the_scenario_pages_show_the_library_and_the_risks_the_user_sees(api, grc, owner):
    scenario = RiskScenario.objects.create(
        title="دسترسی غیرمجاز",
        event="رویداد",
        conditions="شرط",
        consequence="پیامد",
        category=RiskCategory.objects.first(),
    )
    make_risk(owner=owner, scenario=scenario)
    make_risk("ریسک دیگر", scenario=scenario)

    listing = page(api(owner), "/risks/scenarios/").json()
    assert [row["code"] for row in listing["results"]] == [scenario.code]
    assert listing["create_url"] is None

    data = page(api(owner), scenario.get_absolute_url()).json()
    assert len(data["risks"]) == 1
    assert data["create_risk_url"] is None
    data = page(api(grc), scenario.get_absolute_url()).json()
    assert len(data["risks"]) == 2
    assert data["create_risk_url"] == f"/risks/new/?scenario={scenario.pk}"


def test_the_coverage_grid_links_each_cell_back_to_the_same_view(api, grc):
    service = make_service("SRV-1", is_critical=True)
    risk = make_risk(owner=grc)
    Risk.objects.filter(pk=risk.pk).update(service=service, org_unit=service.org_unit)

    data = page(api(grc), "/risks/coverage/?q=SRV").json()

    assert [row["service"]["code"] for row in data["results"]] == ["SRV-1"]
    assert data["critical"] == {"total": 1, "complete": 0, "percent": 0}
    assert len(data["categories"]) == len(data["results"][0]["cells"])
    cell = data["results"][0]["cells"][0]
    assert cell["status"]["value"] == "pending"
    assert cell["risk_count"] == 1
    assert cell["risks_url"] == f"/risks/?service={service.pk}&category={RiskCategory.objects.get(code='T1').pk}"
    assert cell["edit_url"].endswith("?next=%2Frisks%2Fcoverage%2F%3Fq%3DSRV")

    viewer = make_user("viewer", Role.VIEWER)
    assert page(api(viewer), "/risks/coverage/").json()["can_edit"] is False


def test_categories_and_change_requests_list_like_their_pages(api, grc, owner):
    data = page(api(grc), "/risks/categories/").json()
    assert data["count"] == RiskCategory.objects.count()
    assert data["results"][0]["edit_url"]
    assert page(api(owner), "/risks/categories/").json()["create_url"] is None

    risk = make_risk(owner=owner)
    ChangeRequest.objects.create(kind="split", risk=risk, parts="بخش یک\nبخش دو", reason="دلیل", proposed_by=grc)
    data = page(api(owner), "/workflow/requests/?status=pending").json()
    assert [row["risk"]["code"] for row in data["results"]] == [risk.code]
    assert data["results"][0]["kind"]["label"] == "تفکیک"
    detail = page(api(owner), data["results"][0]["href"]).json()
    assert detail["change"]["part_titles"] == ["بخش یک", "بخش دو"]
    assert page(api(make_user("staff")), "/workflow/requests/").json()["count"] == 0


def test_the_dossier_links_its_workflow_actions(api, grc, owner):
    risk = make_risk(owner=owner)
    risk.links.create(kind="ticket", ref="TEST-1", url="https://tickets.example.test/TEST-1")

    data = api(grc).get(reverse("api:risk_detail", args=[risk.pk])).json()

    assert data["actions"]["add_link"] == f"/risks/{risk.pk}/links/new/"
    assert data["actions"]["propose_merge"] == f"/workflow/risks/{risk.pk}/requests/merge/"
    assert data["links"][0]["edit_url"] == f"/risks/links/{risk.links.get().pk}/edit/"
    owner_view = api(owner).get(reverse("api:risk_detail", args=[risk.pk])).json()
    assert owner_view["actions"]["add_link"] is None
    assert owner_view["links"][0]["edit_url"] is None


def test_a_moment_shows_the_tehran_day_not_the_utc_day():
    # ساعت ۱ بامداد ۱۴۰۵/۰۸/۱۳ تهران هنوز ۱۲ آبان به وقت UTC است.
    moment = datetime.datetime(2026, 11, 3, 21, 30, tzinfo=datetime.UTC)
    assert timezone.localtime(moment).hour == 1
    assert fmt.day(moment) == {"iso": "2026-11-04", "jalali": "1405/08/13"}
