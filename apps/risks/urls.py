from django.urls import path

from . import views

app_name = "risks"

urlpatterns = [
    path("coverage/", views.CoverageView.as_view(), name="coverage"),
    path(
        "coverage/<int:service_pk>/<int:category_pk>/",
        views.CoverageUpdateView.as_view(),
        name="coverage_update",
    ),
    path("categories/", views.RiskCategoryListView.as_view(), name="category_list"),
    path("categories/new/", views.RiskCategoryCreateView.as_view(), name="category_create"),
    path("categories/<int:pk>/edit/", views.RiskCategoryUpdateView.as_view(), name="category_update"),
]
