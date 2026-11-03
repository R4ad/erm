from django.urls import path

from . import views

app_name = "controls"

urlpatterns = [
    path("", views.ControlListView.as_view(), name="control_list"),
    path("new/", views.ControlCreateView.as_view(), name="control_create"),
    path("<int:pk>/", views.ControlDetailView.as_view(), name="control_detail"),
    path("<int:pk>/edit/", views.ControlUpdateView.as_view(), name="control_update"),
    path("soa/", views.SoaListView.as_view(), name="soa_list"),
    path("soa/<int:pk>/", views.SoaDetailView.as_view(), name="soa_detail"),
    path("soa/<int:pk>/edit/", views.SoaUpdateView.as_view(), name="soa_update"),
]
