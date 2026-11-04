import uuid
from pathlib import Path
from urllib.parse import urlencode

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import views as auth_views
from django.shortcuts import redirect, render
from django.views.decorators.http import require_POST

from apps.api.spa import spa_login_url, spa_ready
from apps.core.views import FilteredListView

from .forms import LoginForm, StaffFileForm, StaffImportConfirmForm, UserFilterForm
from .models import User
from .permissions import RoleRequiredMixin, role_required
from .roles import Role
from .staff_import import StaffFileError, run_import


class LoginView(auth_views.LoginView):
    """صفحه‌ی ورود. وقتی رابط React ساخته شده باشد، ورود در همان رابط است و این صفحه کاربر را با همان next به آن‌جا
    می‌فرستد. با ?classic=1 همین فرم جنگو باز می‌شود تا اگر رابط تازه مشکلی داشت راه ورود بسته نشود."""

    template_name = "accounts/login.html"
    authentication_form = LoginForm
    redirect_authenticated_user = True

    def get(self, request, *args, **kwargs):
        if spa_ready() and "classic" not in request.GET:
            target = spa_login_url()
            next_url = request.GET.get(self.redirect_field_name)
            if next_url:
                target = f"{target}?{urlencode({'next': next_url})}"
            return redirect(target)
        return super().get(request, *args, **kwargs)


def pending_file(token):
    """مسیر فایلی که منتظر تأیید است. نام فایل فقط از شناسه‌ی تصادفی ساخته می‌شود، نه از ورودی کاربر."""
    return Path(settings.STAFF_IMPORT_DIR) / f"{token.hex}.xlsx"


def save_pending_file(file):
    """فایل را تا تأیید نگه می‌دارد و شناسه‌اش را برمی‌گرداند."""
    folder = Path(settings.STAFF_IMPORT_DIR)
    folder.mkdir(parents=True, exist_ok=True)
    for old in folder.glob("*.xlsx"):
        old.unlink()  # در هر لحظه فقط آخرین فایل منتظر تأیید می‌ماند
    token = uuid.uuid4()
    with pending_file(token).open("wb") as out:
        for chunk in file.chunks():
            out.write(chunk)
    return token


@role_required(Role.SYSTEM_ADMIN)
def staff_import(request):
    form = StaffFileForm(request.POST or None, request.FILES or None)
    if form.is_valid():
        token = save_pending_file(form.cleaned_data["file"])
        deactivate = form.cleaned_data["deactivate_missing"]
        try:
            report = run_import(pending_file(token), deactivate, dry_run=True)
        except StaffFileError as error:
            pending_file(token).unlink()
            form.add_error("file", str(error))
        else:
            confirm_form = StaffImportConfirmForm(initial={"token": token, "deactivate_missing": deactivate})
            return render(request, "accounts/staff_import.html", {"report": report, "confirm_form": confirm_form})
    return render(request, "accounts/staff_import.html", {"form": form})


@require_POST
@role_required(Role.SYSTEM_ADMIN)
def staff_import_confirm(request):
    form = StaffImportConfirmForm(request.POST)
    path = pending_file(form.cleaned_data["token"]) if form.is_valid() else None
    if path is None or not path.exists():
        messages.error(request, "فایل پیدا نشد؛ یا پیش‌تر تأیید یا لغو شده یا فایل تازه‌تری بارگذاری شده است.")
        return redirect("accounts:staff_import")
    if "cancel" in request.POST:
        path.unlink()
        messages.info(request, "ورود لغو شد و فایل پاک شد.")
        return redirect("accounts:staff_import")

    try:
        report = run_import(path, form.cleaned_data["deactivate_missing"])
    finally:
        path.unlink()  # بعد از تأیید، فایل در هر حال پاک می‌شود
    messages.success(request, "کارکنان وارد شدند. گزارش آن‌چه انجام شد:")
    return render(request, "accounts/staff_import.html", {"report": report})


class UserListView(RoleRequiredMixin, FilteredListView):
    roles = [Role.SYSTEM_ADMIN]
    queryset = User.objects.select_related("org_unit").prefetch_related("groups").order_by("last_name", "first_name")
    filter_form_class = UserFilterForm
    template_name = "accounts/user_list.html"
    context_object_name = "users"