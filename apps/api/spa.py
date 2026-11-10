"""صفحه‌ی رابط React زیر /app/. همه‌ی مسیرهای /app/... همین index.html ساخته‌شده با Vite را می‌گیرند و مسیریابی
را خود React انجام می‌دهد. خود صفحه داده‌ای ندارد و بی‌ورود هم باز می‌شود (صفحه‌ی ورود هم در همین رابط است)؛ هر
داده‌ای از API می‌آید که ورود و دسترسی را چک می‌کند."""

import secrets

from django.conf import settings
from django.contrib.auth.decorators import login_not_required
from django.http import HttpResponse
from django.shortcuts import render
from django.urls import reverse
from django.views.decorators.csrf import ensure_csrf_cookie

# فقط فایل‌های همین سایت؛ بدون اسکریپت و استایل درون‌خطی، بدون قاب شدن در سایت دیگر، و با Trusted Types که هر
# نوشتن HTML خام در DOM را می‌بندد. React استایل‌های درون‌خطی را با CSSOM می‌گذارد که CSP آن را نمی‌بندد؛ تنها
# <style> ساختنی (قفل اسکرول پنجره‌های Radix) nonce همین درخواست را دارد.
NONCE_PLACEHOLDER = "__CSP_NONCE__"


def content_security_policy(nonce):
    return (
        "default-src 'self'; "
        f"script-src 'self' 'nonce-{nonce}'; "
        f"style-src 'self' 'nonce-{nonce}'; "
        "img-src 'self' data:; "
        "font-src 'self'; "
        "connect-src 'self'; "
        "object-src 'none'; "
        "base-uri 'self'; "
        "form-action 'self'; "
        "frame-ancestors 'none'; "
        "require-trusted-types-for 'script'; "
        "trusted-types 'none'"
    )


def spa_ready():
    """رابط React ساخته شده است (npm run build)؛ تا آن موقع صفحه‌ی ورود جنگو کار ورود را می‌کند."""
    return (settings.SPA_DIST / "index.html").is_file()


def spa_login_url():
    return reverse("spa_path", args=["login/"])


@login_not_required
@ensure_csrf_cookie
def index(request, path=""):
    page = settings.SPA_DIST / "index.html"
    if not page.exists():
        # هنوز npm run build اجرا نشده؛ به‌جای ۴۰۴ می‌گوییم چه کنند و صفحه‌های جنگو در دسترس می‌مانند.
        return render(request, "api/spa_missing.html", status=503)
    nonce = secrets.token_urlsafe(18)
    response = HttpResponse(page.read_text(encoding="utf-8").replace(NONCE_PLACEHOLDER, nonce))
    # index.html نام فایل‌های ساخته‌شده را دارد؛ اگر کش شود، بعد از هر ساخت تازه مرورگر فایل‌های قدیمی را می‌خواهد.
    response["Cache-Control"] = "no-store"
    response["Content-Security-Policy"] = content_security_policy(nonce)
    return response
