"""صفحه‌ی روش ارزیابی (methodology/version_detail.html) در رابط React: مقیاس‌ها، جدول احتمال، قاعده‌های Bc، ماتریس
تصمیم، قواعد هر سطح و پارامترهای یک نسخه. فقط خواندنی است؛ نسخه‌ی تازه در پنل مدیریت ساخته می‌شود.

متن‌های راهنما خام فرستاده می‌شوند و رابط آن‌ها را بند به بند با همان قاعده‌ی فیلتر paragraphs جنگو نشان می‌دهد
(بندها با خط خالی و عنوان با «## »)، بی هیچ HTML.
"""

from django.urls import reverse

from . import formatting as fmt


def _scale(scale):
    return {
        "code": scale.code,
        "name": scale.name,
        "scope": scale.scope,
        "description": scale.description,
        "guidance": scale.guidance,
        "has_level_names": scale.has_level_names,
        "has_bounds": scale.has_bounds,
        "levels": [
            {
                "value": level.value,
                "name": level.name,
                "bounds": level.bounds_display() or None,
                "criteria": level.criteria,
            }
            for level in scale.levels.all()
        ],
    }


def _level(level):
    return {"name": level.name, "color": level.color, "text_color": level.text_color}


def _period(value, unit_label):
    return f"{value} {unit_label}" if value else None


def version_detail(context, request):
    version = context["version"]
    l_scale = context["l_scale"]
    return {
        "title": f"روش ارزیابی، {version}",
        "version": {
            "number": version.number,
            "name": str(version),
            "status": fmt.choice(version, "status"),
            "is_trial": version.is_trial,
            "source": version.source,
            "based_on": str(version.based_on) if version.based_on_id else None,
            "approval_ref": version.approval_ref,
            "approved_on": fmt.day(version.approved_on),
            "approval_recorded_by": fmt.person(version.approval_recorded_by),
            "activated_at": fmt.moment(version.activated_at),
            "change_notes": version.change_notes,
            "likelihood_strategy": fmt.choice(version, "likelihood_strategy"),
            "impact_strategy": fmt.choice(version, "impact_strategy"),
            "impact_guidance": version.impact_guidance,
            "decision_guidance": version.decision_guidance,
            "acceptance_guidance": version.acceptance_guidance,
        },
        "versions": [
            {
                "number": other.number,
                "name": str(other),
                "status": fmt.choice(other, "status"),
                "current": other.pk == version.pk,
                "href": other.get_absolute_url(),
            }
            for other in context["versions"]
        ],
        "likelihood_scales": [_scale(scale) for scale in context["likelihood_scales"]],
        "bc_rules": [{"condition": rule.condition_display(), "bc": rule.bc} for rule in context["bc_rules"]],
        "bc_default": context["bc_default"],
        "l_scale": {
            **_scale(l_scale),
            # سطرهای جدول A × B: برای هر A، L در B1 تا B5 (خانه‌ی خالی None).
            "grid": [{"a": a, "values": row} for a, row in context["likelihood_grid"]],
        }
        if l_scale
        else None,
        "levels_range": list(context["levels_range"]),
        "impact_scales": [_scale(scale) for scale in context["impact_scales"]],
        "risk_levels": [
            {
                **_level(level),
                "min_score": level.min_score,
                "max_score": level.max_score,
                "decision_rule": level.decision_rule,
                "co_approver": level.get_co_approver_display(),
                "containment": _period(level.containment_value, level.get_containment_unit_display()),
                "plan": _period(level.plan_value, level.get_plan_unit_display()),
                "acceptance": _period(level.acceptance_value, level.get_acceptance_unit_display()),
                "review": _period(level.review_value, level.get_review_unit_display()),
            }
            for level in context["risk_levels"]
        ],
        "floors": [{"min_impact": floor.min_impact, "min_level": floor.min_level.name} for floor in context["floors"]],
        "decision_matrix": [
            {
                "likelihood": likelihood,
                "cells": [
                    {
                        "score": cell["score"],
                        "level": _level(cell["level"]) if cell["level"] else None,
                        "raised": cell["raised"],
                    }
                    for cell in cells
                ],
            }
            for likelihood, cells in context["decision_matrix"]
        ],
        "parameters": [
            {
                "key": parameter.key,
                "label": parameter.get_key_display(),
                "value": parameter.value_display,
                "unit": parameter.unit,
                "note": parameter.note,
            }
            for parameter in context["parameters"]
        ],
        "active_url": reverse("methodology:active"),
    }


METHODOLOGY_PAGES = {
    "methodology:active": version_detail,
    "methodology:version_detail": version_detail,
    "methodology:version_reference": version_detail,
}
