from django.shortcuts import render
from django.utils import timezone
from django.views.generic import ListView


def home(request):
    return render(request, "core/home.html", {"now": timezone.now()})


class FilteredListView(ListView):
    """فهرست با فرم جست‌وجو و فیلتر و صفحه‌بندی. فرم فیلتر باید متد filter(queryset) داشته باشد."""

    filter_form_class = None
    paginate_by = 25

    def get_queryset(self):
        self.filter_form = self.filter_form_class(self.request.GET)
        queryset = super().get_queryset()
        if not self.filter_form.is_valid():
            return queryset.none()
        return self.filter_form.filter(queryset)

    def get_context_data(self, **kwargs):
        return super().get_context_data(filter_form=self.filter_form, **kwargs)