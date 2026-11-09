"""فهرست‌های صفحه‌های جنگو در رابط React: ردیف‌ها، صفحه‌بندی و فرم فیلتر."""

import copy

from django.http import QueryDict

from .forms import describe_form


def filter_defaults(context):
    """مقدارهایی که فیلتر view وقتی پارامتری در نشانی نیست به کار می‌برد (مثل تعطیلات امسال یا اولین نوع رکورد در
    سوابق ممیزی). رابط React همین را در فیلتر نشان می‌دهد و برای «همه» پارامتر را خالی می‌فرستد، نه این‌که حذفش کند،
    چون نبودن پارامتر یعنی همین پیش‌فرض. view با نشانی بی‌پارامتر فقط پرسیده می‌شود و خود درخواست عوض نمی‌شود."""
    view = context.get("view")
    if view is None or not hasattr(view, "get_filter_data"):
        return {}
    probe = copy.copy(view)
    probe.request = copy.copy(view.request)
    probe.request.GET = QueryDict()
    return {name: str(value) for name, value in probe.get_filter_data().items()}


def listing(context, rows):
    """ردیف‌های یک فهرست با صفحه‌بندی ListView و فرم فیلتر FilteredListView، اگر صفحه آن‌ها را دارد."""
    page = context.get("page_obj")
    filters = describe_form(context.get("filter_form"))
    defaults = filter_defaults(context) if filters is not None else {}
    if defaults:
        filters["defaults"] = defaults
    return {
        "results": rows,
        "count": page.paginator.count if page else len(rows),
        "page": page.number if page else 1,
        "pages": page.paginator.num_pages if page else 1,
        "filters": filters,
    }
