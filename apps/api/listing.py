"""فهرست‌های صفحه‌های جنگو در رابط React: ردیف‌ها، صفحه‌بندی و فرم فیلتر."""

from .forms import describe_form


def listing(context, rows):
    """ردیف‌های یک فهرست با صفحه‌بندی ListView و فرم فیلتر FilteredListView، اگر صفحه آن‌ها را دارد."""
    page = context.get("page_obj")
    return {
        "results": rows,
        "count": page.paginator.count if page else len(rows),
        "page": page.number if page else 1,
        "pages": page.paginator.num_pages if page else 1,
        "filters": describe_form(context.get("filter_form")),
    }
