"""تعریف پرسشنامه‌ها و بررسی پاسخ‌ها در رابط React (apps/questionnaires/templates/questionnaires/).

مثل pages.py، هر تابع context همان view جنگو را به JSON می‌دهد؛ هر دکمه فقط وقتی نشانی دارد که view جنگو همان دکمه را
به همین کاربر نشان می‌دهد. «بررسی تمام شد» با همان view جنگو فرستاده می‌شود (bridge_pages.POST_ONLY_PAGES) و برگشت
پاسخ، ریسک در انتظار تازه، ثبت در رجیستر و کنار گذاشتن فرم‌های همان view‌های جنگو هستند (bridge_pages.FORM_PAGES).
"""

from django.urls import reverse

from apps.questionnaires.models import Response

from . import formatting as fmt
from .forms import describe_form
from .listing import listing


def _code(item, name="title"):
    """سناریو (کد و عنوان) یا دسته (کد و نام)؛ همان کدی که قالب جنگو با عنوانش در title نشان می‌دهد."""
    if item is None:
        return None
    return {"code": item.code, "name": getattr(item, name)}


# --- تعریف پرسشنامه‌ها ---


def questionnaire_row(questionnaire):
    return {
        "id": questionnaire.pk,
        "title": questionnaire.title,
        "question_count": questionnaire.question_count,
        "response_count": questionnaire.response_count,
        "is_active": questionnaire.is_active,
        "is_structured": questionnaire.is_structured,
        "href": questionnaire.get_absolute_url(),
    }


def questionnaire_list(context, request):
    return {
        "title": "تعریف پرسشنامه‌ها",
        **listing(context, [questionnaire_row(item) for item in context["questionnaires"]]),
        "create_url": reverse("questionnaires:questionnaire_create") if context["can_edit"] else None,
    }


def _option(option):
    return {
        "id": option.pk,
        "text": option.text,
        "is_active": option.is_active,
        "indicates_risk": option.indicates_risk,
        "scenario": _code(option.scenario) if option.indicates_risk else None,
        "category": _code(option.category, "name") if option.indicates_risk else None,
    }


def questionnaire_detail(context, request):
    questionnaire, can_edit = context["questionnaire"], context["can_edit"]
    return {
        "title": str(questionnaire),
        "questionnaire": {
            "id": questionnaire.pk,
            "title": questionnaire.title,
            "description": questionnaire.description,
            "is_active": questionnaire.is_active,
            "is_structured": questionnaire.is_structured,
        },
        "questions": [
            {
                "id": question.pk,
                "order": question.order,
                "text": question.text,
                "help": question.help_text,
                "kind": fmt.choice(question, "kind"),
                "stage": fmt.choice(question, "stage"),
                "required": question.is_required,
                "is_active": question.is_active,
                "options": [_option(option) for option in question.options.all()],
                "edit_url": reverse("questionnaires:question_update", args=[question.pk]) if can_edit else None,
            }
            for question in context["questions"]
        ],
        "add_question_url": reverse("questionnaires:question_create", args=[questionnaire.pk]) if can_edit else None,
        "edit_url": reverse("questionnaires:questionnaire_update", args=[questionnaire.pk]) if can_edit else None,
        "list_url": reverse("questionnaires:questionnaire_list"),
    }


# --- پاسخ‌ها و بررسی ---


def response_row(response):
    """یک ردیف response_list.html."""
    return {
        "id": response.pk,
        "questionnaire": response.questionnaire.title,
        "org_unit": response.org_unit.name,
        "service": response.service.code if response.service_id else None,
        "respondent": fmt.person(response.respondent),
        "interview": response.channel == Response.Channel.INTERVIEW,
        "submitted_at": fmt.day(response.submitted_at),
        "pending_count": response.pending_count,
        "status": fmt.choice(response, "status"),
        "is_overdue": response.is_overdue,
        "href": response.get_absolute_url(),
    }


def response_list(context, request):
    return {
        "title": "پاسخ‌های پرسشنامه",
        **listing(context, [response_row(response) for response in context["responses"]]),
        "queue_url": f"{reverse('questionnaires:response_list')}?status={Response.Status.SUBMITTED}",
    }


def _pending(item, can_decide):
    decide = can_decide and item.is_pending
    return {
        "id": item.pk,
        "description": item.description,
        "source": item.get_source_display(),
        "scenario": _code(item.scenario),
        "category": _code(item.category, "name"),
        "status": fmt.choice(item, "status"),
        "risk": {"code": item.risk.code, "href": item.risk.get_absolute_url()} if item.risk_id else None,
        "dismiss_reason": item.dismiss_reason,
        "duplicate_of": {"code": item.duplicate_of.code, "href": item.duplicate_of.get_absolute_url()}
        if item.duplicate_of_id
        else None,
        "convert_url": reverse("questionnaires:pending_convert", args=[item.pk]) if decide else None,
        "dismiss_url": reverse("questionnaires:pending_dismiss", args=[item.pk]) if decide else None,
    }


def _answers(response, context):
    """جواب‌ها همان‌طور که response_detail.html نشان می‌دهد: پاسخ شاخه‌ای با خدمت‌ها و شاخه‌ها، بقیه با قلم‌های ثابت،
    جواب هر سؤالی که جواب گرفته و «مورد جدید»."""
    if response.questionnaire.is_structured:
        return {
            "structured": {
                "data": response.structured_data,
                "questions": [
                    {"id": q.pk, "text": q.text, "stage": q.stage, "required": q.is_required, "help": q.help_text}
                    for q in response.questionnaire.questions.all()
                ],
            }
        }
    return {
        "fixed": [{"label": str(label), "value": value} for label, value in response.fixed_items()],
        "answers": [
            {
                "id": answer.pk,
                "question": answer.question.text,
                "has_options": answer.question.has_options,
                "text": answer.text,
                "options": [
                    {"text": option.text, "indicates_risk": option.indicates_risk} for option in answer.options.all()
                ],
            }
            for answer in context["answers"]
        ],
        "new_item": response.new_item,
    }


def response_detail(context, request):
    response = context["response"]
    returned = bool(response.return_question)
    review = None
    if context["can_review"]:
        review = {
            "pending_create_url": reverse("questionnaires:pending_create", args=[response.pk]),
            "return_url": reverse("questionnaires:response_return", args=[response.pk]),
            "reviewed_url": reverse("questionnaires:response_reviewed", args=[response.pk]),
            "undecided": context["undecided"],
        }
    return {
        "title": str(response),
        "response": {
            "id": response.pk,
            "questionnaire": {
                "id": response.questionnaire_id,
                "title": response.questionnaire.title,
                "href": response.questionnaire.get_absolute_url(),
            },
            "org_unit": response.org_unit.name,
            "service": {"code": response.service.code, "name": response.service.name} if response.service_id else None,
            "respondent": fmt.person(response.respondent),
            "recorded_by": fmt.person(response.recorded_by),
            "interview": response.channel == Response.Channel.INTERVIEW,
            "status": fmt.choice(response, "status"),
            "is_overdue": response.is_overdue,
            "is_structured": response.questionnaire.is_structured,
            "submitted_at": fmt.moment(response.submitted_at),
            "return_question": response.return_question if returned else "",
            "returned_at": fmt.day(response.returned_at) if returned else None,
            "return_due": fmt.deadline(response.return_due) if returned else None,
            "reviewed_by": fmt.person(response.reviewed_by) if response.reviewed_at else None,
            "reviewed_at": fmt.day(response.reviewed_at),
        },
        **_answers(response, context),
        "pending_risks": [_pending(item, context["can_decide"]) for item in context["pending_risks"]],
        "answer_url": reverse("questionnaires:response_answer", args=[response.pk]) if context["can_edit"] else None,
        "review": review,
        "list_url": reverse("questionnaires:response_list"),
    }


QUESTIONNAIRE_PAGES = {
    "questionnaires:questionnaire_list": questionnaire_list,
    "questionnaires:questionnaire_detail": questionnaire_detail,
    "questionnaires:response_list": response_list,
    "questionnaires:response_detail": response_detail,
}


# --- چیزهای کنار فرم‌ها (bridge_pages.FORM_PAGES) ---


def question_forms(context):
    """فرم سؤال و فرم هر گزینه، برای خواندن خطاهای فرستادن ناموفق."""
    return [context["form"], *context["formset"].forms]


def question_form(context, request):
    """فرم سؤال و گزینه‌هایش (question_form.html): فیلدهای مدیریت formset پنهان‌اند و هر گزینه فرم جدای خودش با
    پیشوند options-<شماره> است؛ همه با هم به همان view فرستاده می‌شوند."""
    formset = context["formset"]
    return {
        "structured": context["view"].questionnaire.is_structured,
        "options": {
            "management": describe_form(formset.management_form)["fields"],
            "errors": [str(error) for error in formset.non_form_errors()],
            "rows": [{"prefix": form.prefix, **describe_form(form)} for form in formset.forms],
        },
    }


def _pending_facts(pending):
    response = pending.response
    rows = [
        ("شرح", pending.description),
        ("منبع", pending.get_source_display()),
        ("پاسخ", str(response)),
    ]
    if pending.scenario_id:
        rows.append(("سناریو", f"{pending.scenario.code} {pending.scenario.title}"))
    if pending.category_id:
        rows.append(("دسته", f"{pending.category.code} {pending.category.name}"))
    return {"title": "ریسک در انتظار", "rows": [{"label": label, "value": value} for label, value in rows]}


def pending_dismiss(context, request):
    return {"facts": _pending_facts(context["view"].pending), "submit": "کنار گذاشتن"}


def pending_convert(context, request):
    """ثبت ریسک در انتظار در رجیستر. بی ?scenario= view جنگو اول فهرست سناریوهای فعال را برای انتخاب نشان می‌دهد
    (risks/pending_scenario_select.html)؛ با سناریو، فرم ثبت ریسک از سناریو با مقدارهای پاسخ (جزئیات سناریو را
    bridge_pages مثل ثبت ریسک از سناریو اضافه می‌کند)."""
    # صفحه‌ی انتخاب سناریو context خودش را دارد (pending و scenarios) و view در آن نیست.
    pending = context.get("pending") or context["view"].pending
    brief = {"description": pending.description, "source": pending.get_source_display()}
    if "form" in context:
        return {"pending": brief, "submit": "ثبت در رجیستر"}
    return {
        "title": "انتخاب سناریو برای ثبت ریسک",
        "cancel_url": pending.response.get_absolute_url(),
        "pending": brief,
        "scenarios": [
            {"id": scenario.pk, "code": scenario.code, "title": scenario.title, "service": str(scenario.service)}
            for scenario in context["scenarios"]
        ],
    }
