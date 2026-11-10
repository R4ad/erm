from django.db import transaction
from django.utils import timezone

from apps.workcalendar.workdays import add_working_days

from .models import Answer, PendingRisk, Question, Response

RETURN_WORKING_DAYS = 5  # مهلت پیشنهادی بخش ۴ برای جواب ورودی برگشت‌خورده


def missing_required(response):
    """سؤال‌های اجباری فعالی که این پاسخ هنوز جوابشان را ندارد."""
    answered = {
        answer.question_id
        for answer in response.answers.prefetch_related("options")
        if answer.text.strip() or answer.options.exists()
    }
    required = response.questionnaire.questions.filter(is_active=True, is_required=True)
    return [question for question in required if question.pk not in answered]


def save_answer(response, question, value):
    """جواب یک سؤال را ذخیره می‌کند. value برای سؤال متنی متن است و برای بقیه فهرست گزینه‌ها."""
    answer, _ = Answer.objects.get_or_create(response=response, question=question)
    if question.kind == Question.Kind.TEXT:
        if answer.text != value:
            answer.text = value
            answer.save()
    else:
        current = set(answer.options.values_list("pk", flat=True))
        if current != {option.pk for option in value}:
            answer.options.set(value)
    return answer


@transaction.atomic
def submit_response(response):
    """پاسخ را به صف بررسی GRC می‌فرستد و برای هر گزینه‌ی «نشانه‌ی ریسک» انتخاب‌شده و برای «مورد جدید»
    «ریسک در انتظار» می‌سازد (س۴۷). در ارسال دوباره بعد از برگشت، ریسک در انتظار تکراری ساخته نمی‌شود."""
    response.status = Response.Status.SUBMITTED
    response.submitted_at = timezone.now()
    response.save()

    existing = set(response.pending_risks.filter(source=PendingRisk.Source.OPTION).values_list("option", flat=True))
    for answer in response.answers.select_related("question").prefetch_related("options"):
        for option in answer.options.all():
            if option.indicates_risk and option.pk not in existing:
                PendingRisk.objects.create(
                    response=response,
                    source=PendingRisk.Source.OPTION,
                    option=option,
                    description=f"{answer.question.text}\nجواب: {option.text}",
                    scenario=option.scenario,
                    category=option.category,
                )

    new_item = response.new_item.strip()
    if new_item:
        pending = response.pending_risks.filter(source=PendingRisk.Source.NEW_ITEM).last()
        if pending is None:
            PendingRisk.objects.create(response=response, source=PendingRisk.Source.NEW_ITEM, description=new_item)
        elif pending.is_pending and pending.description != new_item:
            pending.description = new_item  # شرح تازه‌ی مورد جدید بعد از برگشت
            pending.save()


def return_response(response, question):
    """پاسخ را با یک سؤال مشخص به پاسخ‌دهنده برمی‌گرداند، با مهلت پنج روز کاری."""
    response.status = Response.Status.RETURNED
    response.return_question = question
    response.returned_at = timezone.now()
    response.return_due = add_working_days(timezone.localdate(), RETURN_WORKING_DAYS)
    response.save()


def mark_reviewed(response, user):
    response.status = Response.Status.REVIEWED
    response.reviewed_by = user
    response.reviewed_at = timezone.now()
    response.save()


def convert_pending(pending, risk, user):
    pending.status = PendingRisk.Status.CONVERTED
    pending.risk = risk
    pending.decided_by = user
    pending.decided_at = timezone.now()
    pending.save()


def dismiss_pending(pending, user, reason, duplicate_of=None):
    pending.status = PendingRisk.Status.DISMISSED
    pending.dismiss_reason = reason
    pending.duplicate_of = duplicate_of
    pending.decided_by = user
    pending.decided_at = timezone.now()
    pending.save()
