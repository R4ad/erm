import datetime

import pytest
from django.contrib.contenttypes.models import ContentType
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.urls import reverse
from django.utils import timezone

from apps.accounts.roles import Role
from apps.catalog.tests.factories import make_user
from apps.core.jalali import jalali_year, to_jalali
from apps.core.models import Attachment, Comment
from apps.organization.models import OrgUnit
from apps.risks.models import Evidence, Risk, RiskCategory

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
    return make_user("owner", first_name="رضا", last_name="مالکی")


def make_risk(title="ریسک", owner=None, unit=None):
    return Risk.objects.create(
        title=title,
        description="شرح",
        channel="interview",
        category=RiskCategory.objects.get(code="T1"),
        org_unit=unit or OrgUnit.objects.create(name=f"واحد {title}"),
        owner=owner,
    )


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


def evidence_data(**fields):
    return {
        "kind": "test",
        "title": "نتیجه‌ی آزمون بازیابی",
        "summary": "بازیابی در ۴ ساعت",
        "source": "گزارش واحد زیرساخت",
        "observed_on": "1405/07/20",
        "reliability": "medium",
        "access_class": "normal",
        **fields,
    }


def upload_url(record):
    return reverse("core:attachment_upload", args=[ContentType.objects.get_for_model(record).pk, record.pk])


def comment_url(record):
    return reverse("core:comment_create", args=[ContentType.objects.get_for_model(record).pk, record.pk])


def test_evidence_codes_carry_the_jalali_year(owner):
    year = jalali_year(timezone.localdate())

    assert make_evidence(owner).code == f"EV-{year}-0001"
    assert make_evidence(owner).code == f"EV-{year}-0002"


def test_valid_until_cannot_come_before_the_evidence_date(owner):
    with pytest.raises(IntegrityError), transaction.atomic():
        make_evidence(owner, valid_until=datetime.date(2026, 9, 1))


def test_grc_adds_evidence_to_any_risk_from_its_page(client, grc):
    risk = make_risk()
    client.force_login(grc)

    initial = client.get(reverse("risks:evidence_create"), {"risk": risk.pk}).context["form"].initial
    assert list(initial["risks"]) == [risk]

    response = client.post(reverse("risks:evidence_create"), evidence_data(risks=[risk.pk], owner=grc.pk))

    evidence = Evidence.objects.get()
    assert response.url == evidence.get_absolute_url()
    assert list(evidence.risks.all()) == [risk]
    assert evidence.observed_on == datetime.date(2026, 10, 12)  # 1405/07/20
    assert evidence.history.first().history_user == grc


def test_a_risk_owner_adds_evidence_only_to_their_own_risks(client, owner):
    mine = make_risk("مال من", owner=owner)
    other = make_risk("مال دیگری", owner=make_user("someone"))
    client.force_login(owner)
    url = reverse("risks:evidence_create")

    form = client.get(url).context["form"]
    assert list(form.fields["risks"].queryset) == [mine]
    assert "owner" not in form.fields

    response = client.post(url, evidence_data(risks=[other.pk]))
    assert "risks" in response.context["form"].errors
    response = client.post(url, evidence_data())
    assert "دست‌کم یکی" in response.context["form"].errors["risks"][0]

    client.post(url, evidence_data(risks=[mine.pk]))
    assert Evidence.objects.get().owner == owner


def test_people_without_risks_cannot_add_evidence(client):
    client.force_login(make_user("viewer", Role.VIEWER))

    assert client.get(reverse("risks:evidence_create")).status_code == 403


def test_an_owner_editing_evidence_keeps_links_to_risks_they_do_not_own(client, owner, grc):
    mine = make_risk("مال من", owner=owner)
    other = make_risk("مال دیگری")
    evidence = make_evidence(owner, mine, other)
    client.force_login(owner)

    client.post(
        reverse("risks:evidence_update", args=[evidence.pk]), evidence_data(risks=[mine.pk], title="عنوان تازه")
    )

    evidence.refresh_from_db()
    assert evidence.title == "عنوان تازه"
    assert set(evidence.risks.all()) == {mine, other}


def test_only_grc_and_the_evidence_owner_edit_it(client, owner):
    evidence = make_evidence(owner, make_risk(owner=owner))
    risk_owner_too = make_user("other-owner")
    evidence.risks.add(make_risk("دوم", owner=risk_owner_too))
    client.force_login(risk_owner_too)

    assert client.get(evidence.get_absolute_url()).status_code == 200
    assert client.get(reverse("risks:evidence_update", args=[evidence.pk])).status_code == 403


def test_normal_evidence_follows_its_risks_and_confidential_evidence_is_narrower(client, owner):
    unit = OrgUnit.objects.create(name="عملیات")
    risk = make_risk(owner=owner, unit=unit)
    normal = make_evidence(make_user("grc-author"), risk, title="عادی")
    secret = make_evidence(normal.owner, risk, title="محرمانه", access_class=Evidence.AccessClass.CONFIDENTIAL)
    manager = make_user("manager", Role.UNIT_MANAGER)
    manager.managed_units.add(unit)
    workgroup = make_user("workgroup", Role.SECURITY_WORKGROUP)
    auditor = make_user("auditor", Role.VIEWER)
    outsider = make_user("outsider", Role.UNIT_MANAGER)

    def visible(user):
        client.force_login(user)
        return set(client.get(reverse("risks:evidence_list")).context["evidence_list"])

    assert visible(manager) == {normal}
    assert visible(owner) == {normal, secret}
    assert visible(workgroup) == {normal}
    assert visible(auditor) == {normal, secret}
    assert visible(outsider) == set()
    client.force_login(manager)
    assert client.get(secret.get_absolute_url()).status_code == 404


def test_the_risk_page_lists_its_visible_evidence(client, grc):
    risk = make_risk()
    evidence = make_evidence(grc, risk)
    client.force_login(grc)

    response = client.get(risk.get_absolute_url())

    assert list(response.context["evidence"]) == [evidence]
    assert response.context["can_add_evidence"] is True


def test_files_are_attached_with_a_random_name_and_downloaded_with_the_original(client, owner):
    risk = make_risk(owner=owner)
    client.force_login(owner)

    response = client.post(
        upload_url(risk), {"file": SimpleUploadedFile("گزارش تست نفوذ.pdf", PDF), "description": "تست نفوذ ۱۴۰۵"}
    )

    attachment = Attachment.objects.get()
    assert response.url == risk.get_absolute_url() + "#attachments"
    assert attachment.content_object == risk
    assert attachment.original_name == "گزارش تست نفوذ.pdf"
    assert attachment.size == len(PDF)
    assert "گزارش" not in attachment.file.name and attachment.file.name.endswith(".pdf")

    download = client.get(attachment.get_absolute_url())
    assert download.status_code == 200
    assert b"".join(download.streaming_content) == PDF
    assert "attachment" in download["Content-Disposition"]
    assert download["X-Content-Type-Options"] == "nosniff"


def test_on_the_server_nginx_sends_the_file(client, settings, grc):
    settings.ATTACHMENT_X_ACCEL_PREFIX = "/protected-files/"
    risk = make_risk()
    client.force_login(grc)
    client.post(upload_url(risk), {"file": SimpleUploadedFile("a.pdf", PDF)})
    attachment = Attachment.objects.get()

    download = client.get(attachment.get_absolute_url())

    assert download["X-Accel-Redirect"] == "/protected-files/" + attachment.file.name
    assert download.content == b""


def test_uploads_are_checked_for_type_size_and_content(client, settings, grc):
    risk = make_risk()
    client.force_login(grc)

    for upload, error in [
        (SimpleUploadedFile("run.exe", b"MZ\x90\x00"), "این نوع فایل"),
        (SimpleUploadedFile("fake.pdf", b"MZ\x90\x00binary"), "با پسوندش نمی‌خواند"),
        (SimpleUploadedFile("notes.txt", b"abc\x00def"), "متنی نیست"),
    ]:
        response = client.post(upload_url(risk), {"file": upload})
        assert error in response.context["form"].errors["file"][0]

    settings.ATTACHMENT_MAX_SIZE = 10
    response = client.post(upload_url(risk), {"file": SimpleUploadedFile("big.pdf", PDF)})
    assert "حجم فایل" in response.context["form"].errors["file"][0]
    assert not Attachment.objects.exists()


def test_who_attaches_and_who_downloads(client, owner):
    risk = make_risk(owner=owner)
    unit_manager = make_user("manager", Role.UNIT_MANAGER)
    unit_manager.managed_units.add(risk.org_unit)
    stranger = make_user("stranger", Role.UNIT_MANAGER)
    client.force_login(owner)
    client.post(upload_url(risk), {"file": SimpleUploadedFile("a.pdf", PDF)})
    attachment = Attachment.objects.get()

    client.force_login(unit_manager)  # ریسک را می‌بیند ولی مالکش نیست
    assert client.get(upload_url(risk)).status_code == 403
    assert client.get(attachment.get_absolute_url()).status_code == 200

    client.force_login(stranger)
    assert client.get(upload_url(risk)).status_code == 404
    assert client.get(attachment.get_absolute_url()).status_code == 404


def test_anyone_who_sees_a_record_comments_and_only_the_author_edits(client, owner):
    risk = make_risk(owner=owner)
    unit_manager = make_user("manager", Role.UNIT_MANAGER)
    unit_manager.managed_units.add(risk.org_unit)
    client.force_login(unit_manager)

    response = client.post(comment_url(risk), {"text": "این ریسک در واحد ما هم دیده شده."})

    comment = Comment.objects.get()
    assert response.url == risk.get_absolute_url() + "#comments"
    assert (comment.content_object, comment.created_by) == (risk, unit_manager)

    client.post(reverse("core:comment_update", args=[comment.pk]), {"text": "متن اصلاح‌شده"})
    comment.refresh_from_db()
    assert comment.text == "متن اصلاح‌شده"
    assert comment.history.count() == 2

    client.force_login(owner)
    assert client.get(reverse("core:comment_update", args=[comment.pk])).status_code == 403
    assert "متن اصلاح‌شده" in client.get(risk.get_absolute_url()).content.decode()

    client.force_login(make_user("stranger", Role.UNIT_MANAGER))
    assert client.post(comment_url(risk), {"text": "نظر"}).status_code == 404


def test_records_that_are_not_registered_take_no_files(client, grc):
    category = RiskCategory.objects.get(code="T1")
    client.force_login(grc)

    assert client.get(upload_url(category)).status_code == 404


def test_evidence_takes_files_from_its_owner(client, owner):
    evidence = make_evidence(owner, make_risk(owner=owner), valid_until=datetime.date(2026, 10, 2))
    client.force_login(owner)

    client.post(upload_url(evidence), {"file": SimpleUploadedFile("log.csv", b"time,event\n")})

    assert Attachment.objects.get().content_object == evidence
    page = client.get(evidence.get_absolute_url()).content.decode()
    assert "log.csv" in page
    assert "منقضی" in page
    assert to_jalali(evidence.observed_on) in page
