"""صفحه‌ی رابط React زیر /app/. همه‌ی مسیرهای /app/... همین index.html ساخته‌شده با Vite را می‌گیرند و مسیریابی
را خود React انجام می‌دهد. ورود را LoginRequiredMiddleware مثل بقیه‌ی صفحه‌ها چک می‌کند."""

from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie


@ensure_csrf_cookie
def index(request, path=""):
    page = settings.SPA_DIST / "index.html"
    if not page.exists():
        # هنوز npm run build اجرا نشده؛ به‌جای ۴۰۴ می‌گوییم چه کنند و صفحه‌های جنگو در دسترس می‌مانند.
        return render(request, "api/spa_missing.html", status=503)
    response = HttpResponse(page.read_text(encoding="utf-8"))
    # index.html نام فایل‌های ساخته‌شده را دارد؛ اگر کش شود، بعد از هر ساخت تازه مرورگر فایل‌های قدیمی را می‌خواهد.
    response["Cache-Control"] = "no-store"
    return response
