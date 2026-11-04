"""ورود و خروج رابط React. همان فرم ورود صفحه‌ی جنگو (LoginForm) و همان login/logout خود Django به کار می‌رود، پس
سیگنال‌های سوابق ممیزی (ورود، ورود ناموفق، خروج) و چرخش کلید نشست و توکن CSRF بی‌هیچ تفاوتی اجرا می‌شوند."""

from django.contrib.auth import login as auth_login
from django.contrib.auth import logout as auth_logout
from django.middleware.csrf import get_token
from django.urls import reverse
from django.utils.decorators import method_decorator
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.accounts.forms import LoginForm

from . import formatting as fmt
from .base import ApiView
from .spa import spa_login_url


def safe_next(request, value):
    """مقصد بعد از ورود فقط نشانی‌ای در همین سایت است؛ هر چیز دیگر (سایت دیگر، //، javascript:) به خانه‌ی React
    برمی‌گردد تا صفحه‌ی ورود ابزار هدایت کاربر به جای دیگر نشود."""
    hosts = {request.get_host()}
    if value and url_has_allowed_host_and_scheme(value, allowed_hosts=hosts, require_https=request.is_secure()):
        return value
    return reverse("spa")


@method_decorator(ensure_csrf_cookie, name="get")
class CsrfView(ApiView):
    """پیش از فرم ورود خوانده می‌شود: کوکی csrftoken را می‌سازد (در npm run dev صفحه را Vite می‌دهد، نه جنگو) و
    می‌گوید کاربر از قبل وارد شده است یا نه."""

    permission_classes = (AllowAny,)

    def get(self, request):
        return Response({"csrf_token": get_token(request), "authenticated": request.user.is_authenticated})


class LoginView(ApiView):
    permission_classes = (AllowAny,)

    def post(self, request):
        # DRF توکن CSRF را فقط برای کاربر واردشده چک می‌کند؛ ورود باید آن را همیشه داشته باشد (login CSRF).
        SessionAuthentication().enforce_csrf(request)
        data = request.data if isinstance(request.data, dict) else {}
        form = LoginForm(
            request._request,
            data={"username": data.get("username", ""), "password": data.get("password", "")},
        )
        if not form.is_valid():
            errors = fmt.form_errors(form)
            message = " ".join(errors.get("__all__", [])) or "نام کاربری و گذرواژه را وارد کنید."
            return Response({"message": message, "errors": errors}, status=status.HTTP_400_BAD_REQUEST)
        auth_login(request._request, form.get_user())
        return Response({"next": safe_next(request, data.get("next"))})


class LogoutView(ApiView):
    def post(self, request):
        auth_logout(request._request)
        return Response({"login_url": spa_login_url()})
