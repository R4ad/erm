from django.apps import AppConfig


class RisksConfig(AppConfig):
    name = "apps.risks"

    def ready(self):
        from apps.core import records

        from .models import Evidence, Risk
        from .permissions import can_add_evidence, can_edit_evidence, visible_evidence, visible_risks

        # ریسک و شاهد پیوست و نظر می‌پذیرند.
        records.register(Risk, visible_risks, can_add_evidence)
        records.register(Evidence, visible_evidence, can_edit_evidence)
