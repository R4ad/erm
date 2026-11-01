from django.shortcuts import render

from .models import AuditEvent
from .services import log_event


def permission_denied(request, exception=None):
    """جای صفحه‌ی ۴۰۳ خود Django (handler403 در config/urls.py): هر دسترسی ردشده را هم ثبت می‌کند."""
    log_event(AuditEvent.Event.PERMISSION_DENIED, request, path=request.get_full_path(), method=request.method)
    return render(request, "403.html", status=403)