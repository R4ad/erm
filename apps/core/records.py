"""پیوست و نظر برای هر رکوردی که آن‌ها را می‌پذیرد.

هر اپ مدلش را در ready() با register ثبت می‌کند و دو تابع می‌دهد: visible(user) که رکوردهای قابل‌دیدن کاربر را
برمی‌گرداند، و can_attach(user, record) که می‌گوید کاربر روی این رکورد فایل بارگذاری می‌کند یا نه. نظر را هر کس
که رکورد را می‌بیند می‌نویسد، و فایل را هر کس که رکورد را می‌بیند دانلود می‌کند. مدلی که ثبت نشده پیوست و نظر
نمی‌گیرد."""

from django.contrib.contenttypes.models import ContentType
from django.http import Http404

from .forms import CommentForm

_registry = {}


def register(model, visible, can_attach):
    _registry[model] = (visible, can_attach)


def is_registered(model):
    return model in _registry


def visible_record(user, content_type, object_id):
    """رکورد content_type با شناسه‌ی object_id، اگر ثبت شده باشد و کاربر ببیندش؛ وگرنه ۴۰۴."""
    model = content_type.model_class()
    if model not in _registry:
        raise Http404
    visible, _ = _registry[model]
    record = visible(user).filter(pk=object_id).first()
    if record is None:
        raise Http404
    return record


def can_attach(user, record):
    _, check = _registry[type(record)]
    return check(user, record)


def record_extras(record, user):
    """بخش پیوست‌ها و نظرهای صفحه‌ی یک رکورد، برای context همان صفحه."""
    content_type = ContentType.objects.get_for_model(record)
    return {
        "record_content_type": content_type.pk,
        "attachments": record.attachments.select_related("created_by"),
        "comments": record.comments.select_related("created_by"),
        "can_attach": can_attach(user, record),
        "comment_form": CommentForm(),
    }
