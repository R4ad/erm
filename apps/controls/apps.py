from django.apps import AppConfig


class ControlsConfig(AppConfig):
    name = "apps.controls"

    def ready(self):
        from apps.core import records

        from .models import Control
        from .permissions import can_attach_to_control, visible_controls

        # کنترل پیوست و نظر می‌پذیرد؛ شاهد آزمون را مسئول کنترل بارگذاری می‌کند (جواب س۵۱ و س۵۴).
        records.register(Control, visible_controls, can_attach_to_control)
