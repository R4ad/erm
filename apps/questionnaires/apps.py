from django.apps import AppConfig


class QuestionnairesConfig(AppConfig):
    name = "apps.questionnaires"
    verbose_name = "پرسشنامه‌ها"

    def ready(self):
        from apps.core import records

        from .models import Response
        from .permissions import can_edit_response, visible_responses

        # پیوست هر پاسخ (فیگما ۱۰: «افزودن پیوست»)؛ فقط کسی که پاسخ را ویرایش می‌کند فایل می‌گذارد.
        records.register(Response, visible_responses, can_edit_response)
