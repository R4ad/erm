"""پیوست‌ها و نظرهای یک رکورد (ریسک، شاهد و بقیه) به شکل JSON، از همان record_extras صفحه‌ی جنگو.

نشانی بارگذاری پیوست فقط برای کسی است که اجازه‌اش را دارد. نشانی ثبت نظر برای هر کسی است که رکورد را می‌بیند و
نشانی ویرایش هر نظر فقط برای نویسنده‌ی همان نظر؛ خود view جنگو هم هر دو را دوباره چک می‌کند.
"""

from django.urls import reverse

from apps.core.records import record_extras

from . import formatting as fmt


def record_parts(record, user, extras=None):
    extras = extras if extras is not None else record_extras(record, user)
    content_type = extras["record_content_type"]
    return {
        "attachments": [
            {
                "id": attachment.pk,
                "name": attachment.original_name,
                "size": attachment.size,
                "description": attachment.description,
                "by": fmt.person(attachment.created_by),
                "at": fmt.moment(attachment.created_at),
                "href": attachment.get_absolute_url(),
            }
            for attachment in extras["attachments"]
        ],
        "comments": [
            {
                "id": comment.pk,
                "text": comment.text,
                "by": fmt.person(comment.created_by),
                "at": fmt.moment(comment.created_at),
                "edited": comment.was_edited,
                "edit_url": reverse("core:comment_update", args=[comment.pk])
                if comment.created_by_id == user.pk
                else None,
            }
            for comment in extras["comments"]
        ],
        "attach_url": reverse("core:attachment_upload", args=[content_type, record.pk])
        if extras["can_attach"]
        else None,
        "comment_url": reverse("core:comment_create", args=[content_type, record.pk]),
    }
