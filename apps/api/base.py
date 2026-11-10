"""پایه‌ی endpointهای API که رابط کاربری React (frontend/) از آن‌ها می‌خواند.

API فقط پوسته‌ی تازه‌ای روی همان قاعده‌های سامانه است: دسترسی‌ها از permissions هر اپ، اعتبارسنجی از فرم‌های همان
اپ و کارها از services همان اپ می‌آیند، تا صفحه‌های جنگو و React هیچ‌وقت دو قاعده‌ی متفاوت نداشته باشند.
"""

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from rest_framework import exceptions
from rest_framework.views import APIView
from rest_framework.views import exception_handler as drf_exception_handler

from apps.audit.models import AuditEvent
from apps.audit.services import log_event

from .spa import spa_login_url


class ApiView(APIView):
    """ورود را خود DRF چک می‌کند تا جواب درخواست بی‌ورود JSON باشد، نه هدایت LoginRequiredMiddleware به صفحه‌ی
    ورود؛ رابط React با این جواب کاربر را به صفحه‌ی ورود می‌فرستد."""

    @classmethod
    def as_view(cls, **initkwargs):
        view = super().as_view(**initkwargs)
        view.login_required = False
        return view


def exception_handler(exc, context):
    """مثل صفحه‌های جنگو (handler403)، هر دسترسی ردشده‌ی کاربر واردشده در سوابق ممیزی ثبت می‌شود. جواب درخواست
    بی‌ورود (نشست تمام‌شده) نشانی صفحه‌ی ورود رابط React را دارد تا آن را از ۴۰۳ دسترسی جدا کند."""
    response = drf_exception_handler(exc, context)
    if isinstance(exc, exceptions.NotAuthenticated) and response is not None:
        response.data["login_url"] = spa_login_url()
    request = context.get("request")
    denied = isinstance(exc, (exceptions.PermissionDenied, DjangoPermissionDenied))
    if denied and request is not None and request.user.is_authenticated:
        log_event(
            AuditEvent.Event.PERMISSION_DENIED,
            request._request,
            path=request._request.get_full_path(),
            method=request.method,
        )
    return response
