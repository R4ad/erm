"""کدام صفحه‌های جنگو در رابط React هم هستند و نشانی‌شان در React چیست.

رابط React هر پیوندی را که سرور می‌دهد (href صفحه‌ی جنگو) با همین جدول به صفحه‌ی خودش می‌برد؛ پیوندی که در جدول نیست
صفحه‌ی جنگو را باز می‌کند. با منتقل شدن هر صفحه فقط یک سطر به این جدول اضافه می‌شود و همه‌ی پیوندهای آن صفحه، در منو،
کارهای من، پرونده‌ها و بعد از ذخیره‌ی فرم‌ها، خودشان به React می‌روند.
"""

import re
from functools import cache
from urllib.parse import urlsplit

from django.urls import Resolver404, URLResolver, get_resolver, resolve

from .bridge_pages import FORM_PAGES
from .pages import READ_PAGES

# نام صفحه‌ی جنگو → مسیر React (نسبت به /app). None یعنی همان نشانی جنگو بدون / آخر، که قاعده‌ی صفحه‌های تازه است.
SPA_PAGES = {
    "actions:my_work": "/",
    "assessments:assessment_list": "/assessments",
    "assessments:candidates": "/assessments/new",
    "workflow:question_list": "/questionnaires/risk-questions",
    "reports:management": "/reports",
    "committee:current": "/committee",
    "committee:meeting": "/committee/{pk}",
    "actions:action_verify": None,
    "risks:risk_list": None,
    "risks:risk_detail": None,
    # صفحه‌های خواندنی و فرم‌هایی که React با همان view جنگو نشان می‌دهد (bridge.py)، همه با نشانی خود جنگو.
    **dict.fromkeys(READ_PAGES),
    **dict.fromkeys(FORM_PAGES),
}

# الگوی regex هر نوع پارامتر نشانی جنگو، برای ساختن همان الگو در جاوااسکریپت.
CONVERTERS = {"int": "[0-9]+", "slug": "[-a-zA-Z0-9_]+", "str": "[^/]+", "path": ".+", "uuid": "[-0-9a-f]+"}
PARAM = re.compile(r"<(?:(?P<converter>\w+):)?(?P<name>\w+)>")
REGEX_SPECIAL = re.compile(r"([.^$*+?()\[\]{}|\\])")


def _escape(text):
    # re.escape خط تیره را هم \- می‌کند که در regex جاوااسکریپت با پرچم u خطاست؛ فقط نویسه‌های ویژه escape می‌شوند.
    return REGEX_SPECIAL.sub(r"\\\1", text)


def _walk(patterns, prefix="", namespace=""):
    for pattern in patterns:
        route = prefix + str(pattern.pattern)
        if isinstance(pattern, URLResolver):
            child = f"{namespace}{pattern.namespace}:" if pattern.namespace else namespace
            yield from _walk(pattern.url_patterns, route, child)
        elif pattern.name:
            yield f"{namespace}{pattern.name}", route


@cache
def _routes():
    """الگوی کامل هر نشانی نام‌دار، مثل risks:risk_update → risks/<int:pk>/edit/."""
    return dict(_walk(get_resolver().url_patterns))


def _js_pattern(route):
    parts, last = [], 0
    for match in PARAM.finditer(route):
        parts.append(_escape(route[last : match.start()]))
        parts.append(f"(?<{match['name']}>{CONVERTERS[match['converter'] or 'str']})")
        last = match.end()
    parts.append(_escape(route[last:]))
    return "^/" + "".join(parts) + "$"


def _react_route(route, template):
    """مسیر React به شکل الگوی React Router (/risks/:pk)."""
    if template is not None:
        return re.sub(r"\{(\w+)\}", r":\1", template)
    return "/" + PARAM.sub(lambda match: f":{match['name']}", route).rstrip("/")


def route_table():
    """جدول پیوندها برای رابط React: الگوی نشانی جنگو (regex جاوااسکریپت) و مسیر همان صفحه در React."""
    routes = _routes()
    return [
        {
            "name": url_name,
            "pattern": _js_pattern(routes[url_name]),
            "route": _react_route(routes[url_name], template),
            # form یعنی صفحه را فرم عمومی رابط React با bridge.py نشان می‌دهد.
            "form": url_name in FORM_PAGES,
        }
        for url_name, template in SPA_PAGES.items()
    ]


def spa_route(url):
    """مسیر React یک نشانی جنگو با همان query و #بخش، یا None اگر آن صفحه هنوز فقط در جنگو است."""
    if not url:
        return None
    parts = urlsplit(str(url))
    try:
        match = resolve(parts.path)
    except Resolver404:
        return None
    if match.view_name not in SPA_PAGES:
        return None
    template = SPA_PAGES[match.view_name]
    route = (parts.path.rstrip("/") or "/") if template is None else template.format(**match.kwargs)
    query = f"?{parts.query}" if parts.query else ""
    fragment = f"#{parts.fragment}" if parts.fragment else ""
    return route + query + fragment
