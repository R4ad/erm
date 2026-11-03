from django.urls import path

from . import views

app_name = "risks"

urlpatterns = [
    path("", views.RiskListView.as_view(), name="risk_list"),
    path("new/", views.RiskCreateView.as_view(), name="risk_create"),
    path("<int:pk>/", views.RiskDetailView.as_view(), name="risk_detail"),
    path("<int:pk>/edit/", views.RiskUpdateView.as_view(), name="risk_update"),
    path("<int:risk_pk>/links/new/", views.ExternalLinkCreateView.as_view(), name="link_create"),
    path("links/<int:pk>/edit/", views.ExternalLinkUpdateView.as_view(), name="link_update"),
    path("scenarios/", views.ScenarioListView.as_view(), name="scenario_list"),
    path("scenarios/new/", views.ScenarioCreateView.as_view(), name="scenario_create"),
    path("scenarios/<int:pk>/", views.ScenarioDetailView.as_view(), name="scenario_detail"),
    path("scenarios/<int:pk>/edit/", views.ScenarioUpdateView.as_view(), name="scenario_update"),
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
