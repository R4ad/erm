import pytest
from django.urls import reverse
from django.utils import timezone

from apps.accounts.roles import Role
from apps.assessments.models import Assessment, ImpactDetail, Path
from apps.catalog.models import Customer
from apps.catalog.tests.factories import make_service, make_user
from apps.methodology.models import MethodVersion
from apps.risks.models import Evidence, Risk, RiskCategory
from apps.workflow.models import StatusTransition

pytestmark = pytest.mark.django_db


@pytest.fixture
def setup():
    workgroup = make_user("workspace_workgroup", Role.SECURITY_WORKGROUP)
    grc = make_user("workspace_grc", Role.GRC_MEMBER)
    viewer = make_user("workspace_viewer", Role.VIEWER)
    service = make_service("SRV-WORKSPACE")
    bank = Customer.objects.create(name="بانک آزمون ارزیابی")
    risk = Risk.objects.create(
        title="قطع خدمت",
        description="سناریوی قطع خدمت",
        service=service,
        org_unit=service.org_unit,
        category=RiskCategory.objects.get(code="T1"),
        owner=service.owner,
        channel=Risk.Channel.INTERVIEW,
        status=Risk.Status.SUBMITTED,
        initiator="خرابی سوئیچ",
        realization_path="اختلال اتصال شبکه",
        additional_notes="توضیح ریسک",
        scenario_snapshot={"code": "SC-1"},
    )
    risk.customers.add(bank)
    return workgroup, grc, viewer, risk, bank


def test_queue_permissions_and_atomic_idempotent_start(client, setup):
    workgroup, grc, viewer, risk, _ = setup
    client.force_login(grc)
    assert client.get(reverse("api:assessment_candidates")).status_code == 403
    assert (
        client.post(
            reverse("api:assessment_start", args=[risk.pk]),
            {},
            content_type="application/json",
        ).status_code
        == 403
    )
    assert Risk.objects.get(pk=risk.pk).status == Risk.Status.SUBMITTED
    client.force_login(workgroup)
    assert [
        r["id"]
        for r in client.get(reverse("api:assessment_candidates")).json()["results"]
    ] == [risk.pk]
    assert "ارزیابی ریسک" in str(
        client.get(reverse("api:session")).json()["navigation"]
    )
    started = client.post(
        reverse("api:assessment_start", args=[risk.pk]),
        {},
        content_type="application/json",
    )
    assert started.status_code == 200
    assessment = Assessment.objects.get(pk=started.json()["id"])
    assert (
        assessment.created_by == workgroup
        and assessment.kind == Assessment.Kind.CURRENT
    )
    risk.refresh_from_db()
    assert risk.status == Risk.Status.ASSESSMENT
    assert list(
        StatusTransition.objects.filter(risk=risk).values_list(
            "from_status", "to_status"
        )
    ) == [(Risk.Status.SUBMITTED, Risk.Status.ASSESSMENT)]
    assert not client.get(reverse("api:assessment_candidates")).json()["results"]
    assert (
        client.post(
            reverse("api:assessment_start", args=[risk.pk]),
            {},
            content_type="application/json",
        ).json()["id"]
        == assessment.pk
    )
    assert Assessment.objects.filter(risk=risk).count() == 1
    path_form = client.get(
        reverse("assessments:path_create", args=[assessment.pk])
    ).context["form"]
    assert path_form.initial["description"] == risk.realization_path
    detail = client.get(
        reverse("api:page_bridge"), {"path": assessment.get_absolute_url()}
    ).json()
    assert any(row["value"] == "اختلال اتصال شبکه" for row in detail["risk_details"])
    assert detail["actions"]["initiator"] and detail["actions"]["impact_profile"]
    client.force_login(viewer)
    assert (
        client.post(
            reverse("api:assessment_start", args=[risk.pk]),
            {},
            content_type="application/json",
        ).status_code
        == 403
    )


def test_missing_method_does_not_change_status(client, setup):
    workgroup, _, _, risk, _ = setup
    MethodVersion.objects.filter(status=MethodVersion.Status.ACTIVE).update(
        status=MethodVersion.Status.ARCHIVED
    )
    client.force_login(workgroup)
    result = client.post(
        reverse("api:assessment_start", args=[risk.pk]),
        {},
        content_type="application/json",
    )
    assert result.status_code == 409
    risk.refresh_from_db()
    assert risk.status == Risk.Status.SUBMITTED
    assert not risk.assessments.exists() and not risk.transitions.exists()


def test_failed_assessment_creation_rolls_back_transition(client, setup, monkeypatch):
    from apps.assessments import workspace
    from apps.assessments.services import AssessmentError

    workgroup, _, _, risk, _ = setup

    def fail(*args, **kwargs):
        raise AssessmentError(["خطای ساخت ارزیابی"])

    monkeypatch.setattr(workspace, "create_assessment", fail)
    client.force_login(workgroup)
    response = client.post(
        reverse("api:assessment_start", args=[risk.pk]),
        {},
        content_type="application/json",
    )
    assert response.status_code == 409
    risk.refresh_from_db()
    assert risk.status == Risk.Status.SUBMITTED and not risk.transitions.exists()


def test_workgroup_inputs_compute_scores_and_show_them_in_list(client, setup):
    workgroup, grc, _, risk, bank = setup
    client.force_login(workgroup)
    assessment_id = client.post(
        reverse("api:assessment_start", args=[risk.pk]),
        {},
        content_type="application/json",
    ).json()["id"]
    assessment = Assessment.objects.get(pk=assessment_id)
    evidence = Evidence.objects.create(
        owner=workgroup,
        kind=Evidence.Kind.STATISTICS,
        title="سابقه",
        summary="-",
        source="گزارش",
        observed_on=timezone.localdate(),
        reliability=Evidence.Reliability.HIGH,
    )
    evidence.risks.add(risk)
    a = client.post(
        reverse("assessments:initiator", args=[assessment_id]),
        {
            "a_basis": "forward",
            "a_level": "2",
            "a_confidence": "high",
            "a_rationale": "داده آزمون",
            "a_evidence": [evidence.pk],
            "risk_scope": "تولید",
            "risk_count_unit": "هر تغییر",
        },
    )
    assert a.status_code == 302, (
        a.context["form"].errors if a.status_code == 200 else a.content
    )
    risk.refresh_from_db()
    assert (risk.scope, risk.count_unit) == ("تولید", "هر تغییر")
    path = client.post(
        reverse("assessments:path_create", args=[assessment_id]),
        {
            "name": "مسیر شبکه",
            "description": "اختلال اتصال",
            "b0_level": "3",
            "b0_rationale": "بررسی مسیر",
            "b0_confidence": "high",
            "evidence": [evidence.pk],
        },
    )
    assert path.status_code == 302, (
        path.context["form"].errors if path.status_code == 200 else path.content
    )
    data = {}
    for stakeholder in ("datin", str(bank.pk)):
        for scale in ("S", "D", "F", "C", "R"):
            prefix = f"{stakeholder}-{scale}"
            data[f"{prefix}-level"] = (
                "3" if stakeholder == str(bank.pk) and scale == "S" else "0"
            )
            data[f"{prefix}-rationale"] = "دلیل بررسی"
            data[f"{prefix}-confidence"] = "high"
            if stakeholder == str(bank.pk) and scale == "S":
                data[f"{prefix}-evidence"] = [evidence.pk]
    impact = client.post(
        reverse("assessments:impact_profile", args=[assessment_id]), data
    )
    assert impact.status_code == 302
    assert Path.objects.filter(assessment=assessment).count() == 1
    assert ImpactDetail.objects.filter(assessment=assessment).count() == 10
    result = client.get(reverse("api:assessment_list")).json()["results"][0]
    assert (
        result["likelihood"] == [2, 2]
        and result["impact"] == [3, 3]
        and result["score"] == [6, 6]
    )
    assert result["level"]["name"] == "متوسط" and result["provisional"]
    assert (
        client.post(reverse("assessments:submit", args=[assessment_id]), {}).status_code
        == 302
    )
    assessment.refresh_from_db()
    assert assessment.status == Assessment.Status.IN_QC
    from apps.assessments.review import can_review

    assert not can_review(workgroup, assessment) and can_review(grc, assessment)


def test_workgroup_can_create_evidence_only_for_risks_under_assessment(client, setup):
    workgroup, _, _, risk, _ = setup
    client.force_login(workgroup)
    risk.status = Risk.Status.ASSESSMENT
    risk.save()
    form = client.get(reverse("risks:evidence_create"), {"risk": risk.pk}).context[
        "form"
    ]
    assert risk in form.fields["risks"].queryset
    other = Risk.objects.create(
        title="ارسال‌شده",
        description="-",
        org_unit=risk.org_unit,
        category=risk.category,
        channel=Risk.Channel.INTERVIEW,
        status=Risk.Status.SUBMITTED,
    )
    assert other not in form.fields["risks"].queryset
    values = {
        "kind": "test",
        "title": "شاهد ارزیابی",
        "summary": "نتیجه آزمون",
        "source": "گزارش",
        "observed_on": "1405/08/10",
        "reliability": "high",
        "access_class": "normal",
        "risks": [risk.pk],
    }
    result = client.post(reverse("risks:evidence_create"), values)
    assert result.status_code == 302
    evidence = Evidence.objects.get(title="شاهد ارزیابی")
    assert evidence.owner == workgroup and list(evidence.risks.all()) == [risk]
    values["risks"] = [other.pk]
    result = client.post(reverse("risks:evidence_create"), values)
    assert result.status_code == 200 and "risks" in result.context["form"].errors


def test_workgroup_can_complete_counting_for_legacy_risk_without_erasing_existing_fields(
    client, setup
):
    workgroup, _, _, risk, _ = setup
    risk.scenario_snapshot = {}
    risk.scope = "دامنه قبلی"
    risk.save()
    client.force_login(workgroup)
    result = client.post(
        reverse("api:assessment_start", args=[risk.pk]),
        {},
        content_type="application/json",
    )
    assessment_id = result.json()["id"]
    response = client.post(
        reverse("assessments:initiator", args=[assessment_id]),
        {
            "a_basis": "forward",
            "a_level": "2",
            "a_confidence": "high",
            "a_rationale": "دلیل",
            "risk_count_unit": "هر رویداد",
        },
    )
    assert response.status_code == 302
    risk.refresh_from_db()
    assert risk.scope == "دامنه قبلی" and risk.count_unit == "هر رویداد"


def test_risk_details_do_not_expose_inaccessible_confidential_evidence(client, setup):
    workgroup, grc, _, risk, _ = setup
    client.force_login(workgroup)
    assessment_id = client.post(
        reverse("api:assessment_start", args=[risk.pk]),
        {},
        content_type="application/json",
    ).json()["id"]
    evidence = Evidence.objects.create(
        owner=grc,
        kind=Evidence.Kind.TEST,
        title="شاهد محرمانه",
        summary="-",
        source="گزارش",
        observed_on=timezone.localdate(),
        reliability=Evidence.Reliability.HIGH,
        access_class=Evidence.AccessClass.CONFIDENTIAL,
    )
    evidence.risks.add(risk)
    page = client.get(
        reverse("api:page_bridge"),
        {"path": reverse("assessments:assessment_detail", args=[assessment_id])},
    )
    assert page.status_code == 200
    assert "شاهد محرمانه" not in str(page.json()["risk_details"])
