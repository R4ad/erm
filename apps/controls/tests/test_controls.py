import pytest
from django.contrib.contenttypes.models import ContentType
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.urls import reverse

from apps.accounts.roles import Role
from apps.catalog.models import Responsibility
from apps.catalog.tests.factories import make_user
from apps.controls.models import Applicability, Control, IsoControl
from apps.controls.permissions import visible_controls
from apps.core.models import Attachment
from apps.organization.models import OrgUnit
from apps.risks.models import Risk, RiskCategory

pytestmark = pytest.mark.django_db

PDF = b"%PDF-1.4\n%test\n"


@pytest.fixture(autouse=True)
def media(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    settings.ATTACHMENT_X_ACCEL_PREFIX = ""


@pytest.fixture
def grc():
    return make_user("grc", Role.GRC_MEMBER)


@pytest.fixture
def owner():
    return make_user("owner", first_name="مینا", last_name="کنترلی")


@pytest.fixture
def auditor():
    return make_user("auditor", Role.VIEWER)


def iso(code):
    return IsoControl.objects.get(code=code)


def make_control(owner, title="احراز هویت چندعاملی برای حساب‌های ممتاز", *iso_codes, **fields):
    values = {
        "objective": "ورود به حساب ممتاز بدون عامل دوم ممکن نیست.",
        "kind": Control.Kind.PREVENTIVE,
        "operated_by": Responsibility.DATIN,
        **fields,
    }
    control = Control.objects.create(title=title, owner=owner, **values)
    control.iso_controls.add(*(iso(code) for code in iso_codes))
    return control


def make_risk(title="دسترسی غیرمجاز به سرور تولید", unit=None, owner=None):
    return Risk.objects.create(
        title=title,
        description="شرح",
        channel=Risk.Channel.INTERVIEW,
        category=RiskCategory.objects.get(code="T1"),
        org_unit=unit or OrgUnit.objects.create(name=f"واحد {title}"),
        owner=owner,
    )


def control_data(owner, **fields):
    return {
        "title": "پشتیبان‌گیری روزانه",
        "objective": "بازگرداندن داده پس از خرابی.",
        "kind": Control.Kind.RECOVERY,
        "owner": owner.pk,
        "operated_by": Responsibility.DATIN,
        "is_active": "on",
        **fields,
    }


def test_annex_a_has_the_93_controls_of_the_2022_edition_in_numeric_order():
    assert IsoControl.objects.count() == 93
    by_theme = {theme: IsoControl.objects.filter(theme=theme).count() for theme in IsoControl.Theme.values}
    assert by_theme == {5: 37, 6: 8, 7: 14, 8: 34}
    codes = list(IsoControl.objects.filter(theme=5).values_list("code", flat=True)[:11])
    assert codes[1:3] == ["5.2", "5.3"] and codes[9] == "5.10"  # ترتیب عددی، نه متنی
    control = iso("8.5")
    assert (control.title_en, control.title) == ("Secure authentication", "احراز هویت امن")


def test_control_codes_are_automatic_and_their_annex_a_mapping_is_kept_in_history(owner):
    first = make_control(owner, "کنترل یک", "8.5")
    second = make_control(owner, "کنترل دو")

    assert (first.code, second.code) == ("CT-0001", "CT-0002")
    first.iso_controls.add(iso("5.15"))
    first.iso_controls.remove(iso("8.5"))
    assert any(record.iso_controls.filter(isocontrol__code="8.5").exists() for record in first.history.all())


def test_grc_and_the_system_admin_register_controls_and_others_cannot(client, grc, owner):
    url = reverse("controls:control_create")
    client.force_login(owner)
    assert client.get(url).status_code == 403

    client.force_login(grc)
    response = client.post(url, control_data(owner, is_key="on", iso_controls=[iso("8.13").pk]))

    control = Control.objects.get()
    assert response.url == control.get_absolute_url()
    assert control.is_key and list(control.iso_controls.values_list("code", flat=True)) == ["8.13"]

    admin = make_user("admin", Role.SYSTEM_ADMIN)
    client.force_login(admin)
    assert client.get(reverse("controls:control_update", args=[control.pk])).status_code == 200


def test_an_active_control_needs_an_active_owner(client, grc, owner):
    control = make_control(owner)
    owner.is_active = False  # مسئول کنترل بعداً از سازمان رفته است
    owner.save()
    client.force_login(grc)

    response = client.post(reverse("controls:control_update", args=[control.pk]), control_data(owner))

    assert "این کاربر غیرفعال است" in response.context["form"].errors["owner"][0]


def test_who_sees_which_controls(client, grc, owner, auditor):
    manager = make_user("manager", Role.UNIT_MANAGER)
    unit = OrgUnit.objects.create(name="فناوری")
    manager.managed_units.add(unit)
    own = make_control(owner, "کنترل مسئول")
    linked = make_control(grc, "کنترل ریسک واحد")
    hidden = make_control(grc, "کنترل دیگر")
    make_risk(unit=unit).controls.add(linked)
    workgroup = make_user("workgroup", Role.SECURITY_WORKGROUP)

    for user in (grc, workgroup, auditor):
        assert set(visible_controls(user)) == {own, linked, hidden}
    assert set(visible_controls(owner)) == {own}
    assert set(visible_controls(manager)) == {linked}

    client.force_login(manager)
    assert client.get(reverse("controls:control_detail", args=[hidden.pk])).status_code == 404
    assert client.get(reverse("controls:control_detail", args=[linked.pk])).status_code == 200


def test_the_control_owner_attaches_test_evidence_to_their_own_control(client, owner):
    own, other = make_control(owner, "کنترل خودش"), make_control(make_user("someone"), "کنترل دیگری")
    content_type = ContentType.objects.get_for_model(Control)
    client.force_login(owner)

    def upload(control):
        return client.post(
            reverse("core:attachment_upload", args=[content_type.pk, control.pk]),
            {"file": SimpleUploadedFile("test.pdf", PDF), "description": "نتیجه‌ی آزمون"},
        )

    assert upload(own).status_code == 302
    assert Attachment.objects.filter(object_id=own.pk).count() == 1
    assert upload(other).status_code == 404  # کنترل دیگری را اصلاً نمی‌بیند


def test_the_soa_is_for_grc_the_security_roles_the_auditor_and_the_admin(client, grc, owner, auditor):
    url = reverse("controls:soa_list")
    for user, status in [
        (owner, 403),
        (grc, 200),
        (auditor, 200),
        (make_user("committee", Role.SECURITY_COMMITTEE), 200),
    ]:
        client.force_login(user)
        assert client.get(url).status_code == status
    client.force_login(auditor)
    assert client.get(reverse("controls:soa_update", args=[iso("5.1").pk])).status_code == 403


def test_grc_records_applicability_with_a_reason_and_the_persian_title(client, grc):
    control = iso("5.7")
    url = reverse("controls:soa_update", args=[control.pk])
    client.force_login(grc)

    response = client.post(url, {"iso_title": "هوش تهدید", "applicable": "on", "justification": "قرارداد بانک‌ها"})
    assert "وضعیت اجرا" in response.context["form"].errors["implementation"][0]

    client.post(
        url,
        {"iso_title": "هوش تهدید", "applicable": "on", "justification": "قرارداد بانک‌ها", "implementation": "planned"},
    )
    control.refresh_from_db()
    assert control.title == "هوش تهدید"
    assert (control.applicability.applicable, control.applicability.implementation) == (True, "planned")

    # کاربرد نداشتن وضعیت اجرا را پاک می‌کند و تغییر در تاریخچه می‌ماند.
    client.post(url, {"iso_title": "هوش تهدید", "justification": "در دامنه نیست", "implementation": "planned"})
    row = Applicability.objects.get()
    assert (row.applicable, row.implementation) == (False, "")
    assert row.history.count() == 2


def test_applicability_rules_are_also_checked_in_the_database():
    for values in [
        {"applicable": True, "implementation": "", "justification": "دلیل"},
        {"applicable": False, "implementation": "implemented", "justification": "دلیل"},
        {"applicable": True, "implementation": "implemented", "justification": ""},
    ]:
        with pytest.raises(IntegrityError), transaction.atomic():
            Applicability.objects.create(iso_control=iso("5.1"), **values)


def test_the_soa_traces_annex_a_controls_to_controls_and_visible_risks(client, grc, owner, auditor):
    mfa = make_control(owner, "احراز هویت چندعاملی", "8.5", "5.17")
    make_control(owner, "کنترل کنارگذاشته", "8.2", is_active=False)
    Applicability.objects.create(iso_control=iso("8.5"), justification="ریسک RK", implementation="implemented")
    Applicability.objects.create(iso_control=iso("8.2"), justification="ریسک RK", implementation="in_progress")
    Applicability.objects.create(iso_control=iso("7.9"), applicable=False, justification="دارایی بیرون نمی‌رود")
    scope = OrgUnit.objects.create(name="دامنه‌ی ممیز")
    auditor.scope_units.add(scope)
    in_scope, out_of_scope = make_risk("ریسک در دامنه", unit=scope), make_risk("ریسک بیرون از دامنه")
    in_scope.controls.add(mfa)
    out_of_scope.controls.add(mfa)

    client.force_login(grc)
    response = client.get(reverse("controls:soa_list"))
    summary = response.context["summary"]
    assert (summary["applicable"], summary["not_applicable"], summary["undetermined"]) == (2, 1, 90)
    assert (summary["implemented"], summary["gaps"]) == (1, 1)  # ۸.۲ فقط کنترل غیرفعال دارد
    rows = {row.code: row for row in response.context["iso_controls"]}
    assert (rows["8.5"].control_count, rows["8.5"].risk_count) == (1, 2)

    gaps = client.get(reverse("controls:soa_list"), {"state": "gap"}).context["iso_controls"]
    assert [row.code for row in gaps] == ["8.2"]

    client.force_login(auditor)
    detail = client.get(reverse("controls:soa_detail", args=[iso("8.5").pk]))
    assert list(detail.context["controls"]) == [mfa]
    assert list(detail.context["risks"]) == [in_scope]  # ممیز فقط ریسک‌های دامنه‌اش را می‌بیند
    rows = {row.code: row for row in client.get(reverse("controls:soa_list")).context["iso_controls"]}
    assert rows["8.5"].risk_count == 1


def test_risks_record_their_current_controls_and_the_risk_page_shows_them(client, grc, owner):
    risk = make_risk()
    active, retired = make_control(owner, "کنترل فعال", "8.5"), make_control(owner, "کنترل قدیمی", is_active=False)
    client.force_login(grc)
    url = reverse("risks:risk_update", args=[risk.pk])
    data = {
        "title": risk.title,
        "description": "شرح",
        "channel": "interview",
        "org_unit": risk.org_unit.pk,
        "category": risk.category.pk,
    }

    form = client.get(url).context["form"]
    assert list(form.fields["controls"].queryset) == [active]  # کنترل غیرفعال انتخاب تازه نمی‌شود
    client.post(url, {**data, "controls": [active.pk]})

    assert list(risk.controls.all()) == [active]
    assert risk.history.first().controls.filter(control=active).exists()
    page = client.get(risk.get_absolute_url())
    assert list(page.context["controls"]) == [active]
    assert "8.5" in page.content.decode()

    # کنترلی که ریسک به آن وصل بوده و بعداً غیرفعال شده، با ذخیره‌ی فرم برداشته نمی‌شود.
    risk.controls.add(retired)
    assert set(client.get(url).context["form"].fields["controls"].queryset) == {active, retired}


def test_the_risk_page_links_only_the_controls_the_user_sees(client, owner):
    risk_owner = make_user("risk-owner")
    risk = make_risk(owner=risk_owner)
    control = make_control(owner)
    risk.controls.add(control)
    client.force_login(risk_owner)

    page = client.get(risk.get_absolute_url())

    # مالک ریسک کنترل‌های ریسک خودش را می‌بیند، چون ریسکش به آن‌ها تکیه دارد.
    assert page.context["visible_control_ids"] == {control.pk}
    assert control.get_absolute_url() in page.content.decode()
