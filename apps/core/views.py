from django.shortcuts import render
from django.utils import timezone
from django.views.generic import ListView


def home(request):
    return render(request, "core/home.html", {"now": timezone.now()})


class FilteredListView(ListView):
    """فهرست با فرم جست‌وجو و فیلتر و صفحه‌بندی. فرم فیلتر باید متد filter(queryset) داشته باشد."""

    filter_form_class = None
    paginate_by = 25

    def get_filter_data(self):
        """داده‌ی فرم فیلتر. فهرستی که فیلتر پیش‌فرض دارد این را بازنویسی می‌کند."""
        return self.request.GET

    def get_queryset(self):
        self.filter_form = self.filter_form_class(self.get_filter_data())
        queryset = super().get_queryset()
        if not self.filter_form.is_valid():
            return queryset.none()
        return self.filter_form.filter(queryset)

    def get_context_data(self, **kwargs):
        return super().get_context_data(filter_form=self.filter_form, **kwargs)


class FormPageMixin:
    """صفحه‌ی یکسان ساختن و ویرایش: عنوان از نام مدل و دکمه‌ی انصراف به success_url."""

    template_name = "form_page.html"

    def get_context_data(self, **kwargs):
        name = self.model._meta.verbose_name
        title = f"ویرایش {name}" if self.object else f"{name} جدید"
        return super().get_context_data(title=title, cancel_url=self.success_url, **kwargs)