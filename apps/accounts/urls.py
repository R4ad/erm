from django.contrib.auth import views as auth_views
from django.urls import path
from .forms import LoginForm
from . import views

app_name = "accounts"

urlpatterns = [
    path(
        "login/",
        auth_views.LoginView.as_view(
            template_name="accounts/login.html",
            authentication_form=LoginForm,
            redirect_authenticated_user=True,
        ),
        name="login",
    ),
    path("logout/", auth_views.LogoutView.as_view(), name="logout"),
    path("users/", views.UserListView.as_view(), name="user_list"),
    path("staff-import/", views.staff_import, name="staff_import"),
    path("staff-import/confirm/", views.staff_import_confirm, name="staff_import_confirm"),
]