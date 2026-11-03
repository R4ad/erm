from django.apps import AppConfig


class ActionsConfig(AppConfig):
    name = "apps.actions"
    verbose_name = "طرح مواجهه و اقدام‌ها"

    def ready(self):
        from apps.core import records

        from .models import TreatmentAction, TreatmentPlan
        from .permissions import can_attach_to_action, can_attach_to_plan, visible_actions, visible_plans

        # طرح و اقدام پیوست و نظر می‌پذیرند (جواب س۵۱).
        records.register(TreatmentPlan, visible_plans, can_attach_to_plan)
        records.register(TreatmentAction, visible_actions, can_attach_to_action)
