"""«کتابخانه‌ی سناریو» در رابط React (فیگما ۲۱): سناریوهای مرجع با دسته، شمار نمونه‌ی ریسک، بالاترین سطح جاری و
آخرین بازبینی؛ جزئیات سناریوی انتخاب‌شده (الگوی ثبت، عامل آغازگر، رویداد، پیامد و نمونه‌ها با امتیاز جاری)؛
پیشنهادهای ادغام یا تفکیک و قواعد بخش ۶ روش. ساخت و ویرایش سناریو همان فرم‌های جنگوست."""

from collections import Counter, defaultdict

from django.core.exceptions import ValidationError
from django.db.models import OuterRef, Subquery
from django.shortcuts import get_object_or_404
from django.urls import reverse
from rest_framework.response import Response

from apps.assessments.models import Assessment
from apps.methodology.services import active_version
from apps.risks.models import Risk, RiskCategory, RiskScenario, ScenarioProposal
from apps.risks.permissions import visible_risks
from apps.risks.scenario_proposals import can_decide, decide, propose

from .base import ApiView
from .treatment import fa

RULES = [
    ("اختلاف اساسی در کنترل یا مواجهه", "نمونه‌های جدا زیر یک سناریوی مرجع"),
    ("کنترل، مالک و تعهد همسان", "دامنه‌ی مشترک؛ شواهد کل دامنه را پوشش دهد"),
    ("رویداد مشترک در چند بانک", "سناریوی علت مشترک و نگاشت بانک‌های متأثر"),
    ("ادغام یا تفکیک", "دلیل + تأیید مالک و متولی روش؛ حذف فیزیکی ممنوع"),
    ("بدون اثر مستقیم بر CIA", "در رجیستر می‌ماند با برچسب غیرامنیتی"),
]


def current(field):
    """یک ستون از آخرین ارزیابی جاری تأییدشده‌ی هر ریسک."""
    return Subquery(
        Assessment.objects.filter(
            risk=OuterRef("pk"),
            kind=Assessment.Kind.CURRENT,
            status=Assessment.Status.APPROVED,
            decision_level__isnull=False,
        )
        .order_by("-approved_at", "-pk")
        .values(field)[:1]
    )


def jalali(value):
    from apps.core.jalali import to_jalali

    return fa(to_jalali(value)) if value else None


def proposal_row(proposal, user):
    return {
        "id": proposal.pk,
        "kind": {"value": proposal.kind, "label": proposal.get_kind_display()},
        "scenario": {"id": proposal.scenario_id, "code": proposal.scenario.code},
        "target": {"id": proposal.target_id, "code": proposal.target.code, "title": proposal.target.title}
        if proposal.target_id
        else None,
        "similarity": proposal.similarity,
        "reason": proposal.reason,
        "created_by": proposal.created_by.get_full_name() or proposal.created_by.username,
        "can_decide": can_decide(user),
    }


def detail(scenario, risks, levels, user, pending):
    first = scenario.history.order_by("history_date").first()
    author = first.history_user if first else None
    instances = [
        {
            "id": risk.pk,
            "code": risk.code,
            "title": risk.title,
            "href": risk.get_absolute_url(),
            "scope": " · ".join(
                part
                for part in (
                    risk.service.name if risk.service_id else "",
                    "، ".join(customer.name for customer in risk.customers.all()) or "همه‌ی بانک‌ها",
                )
                if part
            ),
            "score": risk.score,
            "level": levels.get(risk.rank),
        }
        for risk in risks
    ]
    proposal = pending.get(scenario.pk)
    return {
        "id": scenario.pk,
        "code": scenario.code,
        "title": scenario.title,
        "version": scenario.version,
        "active": scenario.is_active,
        "merged_into": {"code": scenario.merged_into.code, "href": scenario.merged_into.get_absolute_url()}
        if scenario.merged_into_id
        else None,
        "author": author.get_full_name() if author else None,
        "narrative": scenario.narrative or scenario.build_narrative(),
        "conditions": scenario.conditions,
        "event": scenario.event,
        "consequence": scenario.consequence,
        "category": {"code": scenario.category.code, "name": scenario.category.name},
        "service": scenario.service.name if scenario.service_id else scenario.service_name_snapshot or None,
        "href": scenario.get_absolute_url(),
        "edit_url": reverse("risks:scenario_update", args=[scenario.pk]) if can_decide(user) else None,
        "instances": instances,
        "proposal": proposal_row(proposal, user) if proposal else None,
    }


def page(request):
    user = request.user
    version = active_version()
    levels = (
        {level.rank: {"rank": level.rank, "name": level.name} for level in version.risk_levels.all()} if version else {}
    )
    scenarios = list(RiskScenario.objects.select_related("category", "service", "merged_into").order_by("code"))
    risks = list(
        visible_risks(user)
        .filter(scenario__isnull=False, merged_into__isnull=True)
        .exclude(status=Risk.Status.REJECTED)
        .select_related("service")
        .prefetch_related("customers")
        .annotate(rank=current("decision_level__rank"), score=current("score_high"))
        .order_by("code")
    )
    by_scenario = defaultdict(list)
    for risk in risks:
        by_scenario[risk.scenario_id].append(risk)
    pending = {
        proposal.scenario_id: proposal
        for proposal in ScenarioProposal.objects.filter(status=ScenarioProposal.Status.PENDING).select_related(
            "scenario", "target", "created_by"
        )
    }

    rows = []
    for scenario in scenarios:
        instances = by_scenario.get(scenario.pk, [])
        ranks = [risk.rank for risk in instances if risk.rank]
        proposal = pending.get(scenario.pk)
        note = None
        if scenario.merged_into_id:
            note = {"tone": "neutral", "text": f"ادغام‌شده در {scenario.merged_into.code}"}
        elif proposal:
            label = f"پیشنهاد ادغام با {proposal.target.code}" if proposal.target_id else "پیشنهاد تفکیک"
            note = {"tone": "warning", "text": label}
        rows.append(
            {
                "id": scenario.pk,
                "code": scenario.code,
                "title": scenario.title,
                "category": {"code": scenario.category.code, "name": scenario.category.name},
                "instances": len(instances),
                "level": levels.get(max(ranks)) if ranks else None,
                "reviewed": jalali(scenario.updated_at.date()),
                "active": scenario.is_active,
                "note": note,
            }
        )

    active = [row for row in rows if row["active"]]
    by_id = {scenario.pk: scenario for scenario in scenarios}
    wanted = request.query_params.get("scenario")
    selected = by_id.get(int(wanted)) if wanted and wanted.isdigit() else None
    if selected is None and scenarios:
        selected = next((by_id[row["id"]] for row in rows if row["note"] and row["active"]), None) or scenarios[0]
    counts = Counter(row["category"]["code"] for row in active)
    instances = sum(row["instances"] for row in active)
    return {
        "summary": {
            "scenarios": len(active),
            "categories": len(counts),
            "instances": instances,
            "average": fa(f"{instances / len(active):.1f}".replace(".", "٫")) if active else "۰",
            "empty": sum(1 for row in active if not row["instances"]),
            "proposals": len(pending),
        },
        "categories": [
            {"code": category.code, "name": category.name, "count": counts.get(category.code, 0)}
            for category in RiskCategory.objects.filter(is_active=True).order_by("code")
        ],
        "rows": rows,
        "selected": detail(selected, by_scenario.get(selected.pk, []), levels, user, pending) if selected else None,
        "options": [{"id": row["id"], "code": row["code"], "title": row["title"]} for row in active],
        "rules": [{"title": title, "text": text} for title, text in RULES],
        "create_url": reverse("risks:scenario_create") if can_decide(user) else None,
        "can_propose": can_decide(user),
    }


class ScenarioLibraryView(ApiView):
    def get(self, request):
        return Response(page(request))


def problems_of(error):
    return {"detail": " ".join(error.messages)}


class ScenarioProposalView(ApiView):
    """ثبت پیشنهاد ادغام یا تفکیک: {scenario, kind, target?, reason}."""

    def post(self, request):
        data = request.data
        scenario = get_object_or_404(RiskScenario, pk=data.get("scenario"))
        target = RiskScenario.objects.filter(pk=data.get("target")).first() if data.get("target") else None
        try:
            propose(scenario, request.user, data.get("kind"), data.get("reason"), target)
        except ValidationError as error:
            return Response(problems_of(error), status=400)
        return Response(page(request), status=201)


class ScenarioDecisionView(ApiView):
    """تصمیم درباره‌ی پیشنهاد: {accept: bool, reason}."""

    def post(self, request, pk):
        proposal = get_object_or_404(ScenarioProposal, pk=pk)
        try:
            decide(proposal, request.user, bool(request.data.get("accept")), request.data.get("reason"))
        except ValidationError as error:
            return Response(problems_of(error), status=400)
        return Response(page(request))
