from django.urls import path

from . import views

app_name = "catalog"

urlpatterns = [
    path("customers/", views.CustomerListView.as_view(), name="customer_list"),
    path("customers/new/", views.CustomerCreateView.as_view(), name="customer_create"),
    path("customers/<int:pk>/edit/", views.CustomerUpdateView.as_view(), name="customer_update"),
    path("services/", views.ServiceListView.as_view(), name="service_list"),
    path("services/new/", views.ServiceCreateView.as_view(), name="service_create"),
    path("services/<int:pk>/", views.ServiceDetailView.as_view(), name="service_detail"),
    path("services/<int:pk>/edit/", views.ServiceUpdateView.as_view(), name="service_update"),
    path(
        "services/<int:service_pk>/customers/new/",
        views.ServiceCustomerCreateView.as_view(),
        name="service_customer_create",
    ),
    path(
        "services/customers/<int:pk>/edit/",
        views.ServiceCustomerUpdateView.as_view(),
        name="service_customer_update",
    ),
    path(
        "services/<int:service_pk>/dependencies/new/<str:kind>/",
        views.DependencyCreateView.as_view(),
        name="dependency_create",
    ),
    path("services/dependencies/<int:pk>/edit/", views.DependencyUpdateView.as_view(), name="dependency_update"),
    path("commitments/", views.CommitmentListView.as_view(), name="commitment_list"),
    path("commitments/new/", views.CommitmentCreateView.as_view(), name="commitment_create"),
    path("commitments/<int:pk>/edit/", views.CommitmentUpdateView.as_view(), name="commitment_update"),
    path("suppliers/", views.SupplierListView.as_view(), name="supplier_list"),
    path("suppliers/new/", views.SupplierCreateView.as_view(), name="supplier_create"),
    path("suppliers/<int:pk>/", views.SupplierDetailView.as_view(), name="supplier_detail"),
    path("suppliers/<int:pk>/edit/", views.SupplierUpdateView.as_view(), name="supplier_update"),
    path("assets/", views.AssetListView.as_view(), name="asset_list"),
    path("assets/new/", views.AssetCreateView.as_view(), name="asset_create"),
    path("assets/<int:pk>/", views.AssetDetailView.as_view(), name="asset_detail"),
    path("assets/<int:pk>/edit/", views.AssetUpdateView.as_view(), name="asset_update"),
]
