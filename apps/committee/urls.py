"""جلسه‌ی کمیته فقط در رابط React است؛ این نشانی‌ها پیوندهای سرور (مثلاً اعلان مصوبه) را به همان صفحه می‌برند."""

from django.contrib.auth.decorators import login_required
from django.urls import path
from django.views.generic import RedirectView

app_name = "committee"


class ToApp(RedirectView):
    def get_redirect_url(self, *args, **kwargs):
        pk = kwargs.get("pk")
        url = f"/app/committee/{pk}/" if pk else "/app/committee/"
        query = self.request.META.get("QUERY_STRING", "")
        return f"{url}?{query}" if query else url


urlpatterns = [
    path("", login_required(ToApp.as_view()), name="current"),
    path("<int:pk>/", login_required(ToApp.as_view()), name="meeting"),
]
