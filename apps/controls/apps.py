from django.apps import AppConfig


class ControlsConfig(AppConfig):
    name = "apps.controls"

    def ready(self):
        from apps.core import records

        from .models import Control, ControlAssessment
        from .permissions import (
            can_attach_to_control,
            can_attach_to_control_assessment,
            visible_control_assessments,
            visible_controls,
        )

        # کنترل و ارزیابی اثربخشی‌اش پیوست و نظر می‌پذیرند؛ شاهد آزمون را مسئول کنترل بارگذاری می‌کند (جواب س۵۱ و س۵۴).
        records.register(Control, visible_controls, can_attach_to_control)
        records.register(ControlAssessment, visible_control_assessments, can_attach_to_control_assessment)
