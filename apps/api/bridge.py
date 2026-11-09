"""صفحه‌های جنگو برای رابط React، با اجرای همان view جنگو.

رابط React نشانی صفحه‌ی جنگو را می‌فرستد (مثلاً /risks/12/edit/). همان view با همان کاربر و همان درخواست اجرا می‌شود،
پس دسترسی، فیلترها، مقدار اولیه، اعتبارسنجی، ذخیره، پیام موفقیت و مقصد بعد از ذخیره همان صفحه‌ی جنگوست و هیچ قاعده‌ای
این‌جا تکرار نمی‌شود. فقط صفحه‌های bridge_pages.py و pages.py پذیرفته می‌شوند و CSRF را خود DRF برای هر POST چک می‌کند.

/api/forms/ (FormBridgeView):
- GET: فرم (از context پاسخ قالب، پیش از رندر) به شکل JSON، با عنوان، نشانی انصراف و چیزهای بیشتر همان صفحه.
- POST: اگر view به صفحه‌ی دیگر هدایت کرد، ذخیره انجام شده و پیام و مقصد برمی‌گردد. اگر همان صفحه را با فرم
  دوباره نشان داد، خطاهای فرم برمی‌گردد.
- اگر view بی‌ذخیره با پیام خطا هدایت کرد (مثلاً ریسک بسته‌شده ویرایش نمی‌شود)، همان پیام با کد ۴۰۹ برمی‌گردد.

/api/pages/ (PageBridgeView): فهرست یا پرونده‌ی یک صفحه‌ی خواندنی، از context همان صفحه با تبدیل pages.py.
"""

import copy
from urllib.parse import urlsplit

from django.contrib.messages import constants
from django.contrib.messages.storage.base import BaseStorage
from django.http import Http404, HttpResponseRedirect, QueryDict
from django.template.response import TemplateResponse
from django.urls import Resolver404, resolve
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from .base import ApiView
from .bridge_pages import FORM_PAGES, FORM_SETS, POST_ONLY_PAGES
from .forms import describe_form, form_data
from .pages import READ_PAGES
from .routes import spa_route


class CollectedMessages(BaseStorage):
    """پیام‌های view به‌جای کوکی یا نشست این‌جا جمع می‌شوند تا در جواب JSON بیایند و بعداً در صفحه‌ی جنگو تکرار نشوند."""

    def _get(self, *args, **kwargs):
        return [], True

    def _store(self, messages, response, *args, **kwargs):
        return []

    def collected(self):
        # نام سطح از جدول پیش‌فرض جنگو، نه level_tag که MESSAGE_TAGS آن را برای Bootstrap «danger» کرده است.
        return [{"level": constants.DEFAULT_TAGS.get(item.level, "info"), "text": str(item.message)} for item in self]


def link(url):
    if not url:
        return None
    url = str(url)
    return {"href": url, "route": spa_route(url)}


def page_request(request, path, query, method, data=None, files=None):
    """کپی درخواست با نشانی صفحه‌ی جنگو؛ کاربر، نشست و کوکی‌ها همان درخواست API است. META هم نشانی صفحه را
    می‌گیرد تا get_full_path() نشانی همان صفحه باشد، نه نشانی API (مثلاً برای ?next= بعد از ذخیره)."""
    page = copy.copy(request._request)
    page.path = page.path_info = path
    page.method = method
    page.META = {**page.META, "PATH_INFO": path, "QUERY_STRING": query, "REQUEST_METHOD": method}
    page.GET = QueryDict(query)
    page.POST = data if data is not None else QueryDict()
    page._files = files if files is not None else QueryDict()
    page._messages = CollectedMessages(page)
    return page


def run(request, path, query, method, allowed, data=None, files=None):
    """view صفحه‌ی path را اجرا می‌کند، اگر نامش در allowed باشد؛ وگرنه ۴۰۴، انگار آن صفحه نیست."""
    try:
        match = resolve(path)
    except Resolver404:
        raise Http404 from None
    if match.view_name not in allowed:
        raise Http404
    page = page_request(request, path, query, method, data, files)
    page.resolver_match = match
    response = match.func(page, *match.args, **match.kwargs)
    return match.view_name, page, response


def target(request):
    """نشانی صفحه‌ی جنگو از ?path=؛ فقط مسیر داخل همین سامانه، نه نشانی کامل سایت دیگر."""
    parts = urlsplit(request.query_params.get("path", ""))
    if not parts.path.startswith("/") or parts.path.startswith("//") or parts.netloc or parts.scheme:
        raise Http404
    return parts.path, parts.query


def blocked(notes, response):
    """view بی‌نشان دادن صفحه هدایت کرد: کار از این وضعیت ممکن نیست و پیامش دلیل را می‌گوید."""
    text = " ".join(note["text"] for note in notes) or "این صفحه الان باز نمی‌شود."
    return Response({"message": text, "redirect": link(response.url)}, status=status.HTTP_409_CONFLICT)


def rendered(response):
    """context پاسخ قالب، پیش از رندر. هر پاسخ دیگری (فایل، JSON یا HTML آماده) برای این رابط نیست."""
    if not isinstance(response, TemplateResponse):
        raise Http404
    return response.context_data or {}


class PageBridgeView(ApiView):
    """صفحه‌ی خواندنی جنگو (فهرست یا پرونده) به شکل JSON، با همان فیلترها، صفحه‌بندی و دسترسی."""

    def get(self, request):
        path, query = target(request)
        name, page, response = run(request, path, query, "GET", READ_PAGES)
        notes = page._messages.collected()
        if isinstance(response, HttpResponseRedirect):
            return blocked(notes, response)
        context = rendered(response)
        return Response({"view": name, "messages": notes, **READ_PAGES[name](context, page)})


class FormBridgeView(ApiView):
    parser_classes = (JSONParser, MultiPartParser, FormParser)

    def get(self, request):
        path, query = target(request)
        name, page, response = run(request, path, query, "GET", FORM_PAGES)
        notes = page._messages.collected()
        if isinstance(response, HttpResponseRedirect):
            return blocked(notes, response)
        context = rendered(response)
        extras = FORM_PAGES.get(name)
        extra = extras(context, page) if extras else {}
        cancel_url = extra.pop("cancel_url", None) or context.get("cancel_url")
        return Response(
            {
                "view": name,
                "title": str(extra.pop("title", None) or context.get("title") or ""),
                "form": describe_form(context.get("form")),
                "cancel": link(cancel_url),
                "messages": notes,
                **extra,
            }
        )

    def post(self, request):
        path, query = target(request)
        if request.content_type.startswith("multipart/"):
            data, files = request.data.copy(), request.FILES
        else:
            body = request.data if isinstance(request.data, dict) else {}
            data, files = form_data(body.get("values")), None
        name, page, response = run(request, path, query, "POST", FORM_PAGES.keys() | POST_ONLY_PAGES, data, files)
        notes = page._messages.collected()
        if isinstance(response, HttpResponseRedirect):
            failed = [note["text"] for note in notes if note["level"] == "error"]
            if failed:
                body = {"message": " ".join(failed), "redirect": link(response.url)}
                return Response(body, status=status.HTTP_400_BAD_REQUEST)
            text = " ".join(note["text"] for note in notes) or "ذخیره شد."
            return Response({"message": text, "redirect": link(response.url)})
        if isinstance(response, TemplateResponse):
            context = response.context_data or {}
            forms = FORM_SETS[name](context) if name in FORM_SETS else [context.get("form")]
            invalid = [form for form in forms if form is not None and form.is_bound and not form.is_valid()]
            if invalid:
                errors, general = {}, []
                for form in invalid:
                    described = describe_form(form)
                    errors.update({field["name"]: field["errors"] for field in described["fields"] if field["errors"]})
                    general += described["errors"]
                if general:
                    errors["__all__"] = general
                failed = [note["text"] for note in notes if note["level"] == "error"]
                message = " ".join(general or failed) or "چند مورد فرم درست نیست؛ کنار هر فیلد آمده است."
                body = {"message": message, "errors": errors}
                if len(forms) == 1:
                    body["form"] = describe_form(forms[0])
                return Response(body, status=status.HTTP_400_BAD_REQUEST)
        raise Http404
