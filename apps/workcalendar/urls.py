from django.urls import path

from . import views

app_name = "workcalendar"

urlpatterns = [
    path("", views.HolidayListView.as_view(), name="holiday_list"),
    path("new/", views.HolidayCreateView.as_view(), name="holiday_create"),
    path("<int:pk>/edit/", views.HolidayUpdateView.as_view(), name="holiday_update"),
    path("<int:pk>/delete/", views.HolidayDeleteView.as_view(), name="holiday_delete"),
]