"""گیرنده‌های سیگنال: ورود، خروج، ورود ناموفق و تغییر نقش‌ها و واحدهای تحت مدیریت کاربران."""

from django.contrib.auth import get_user_model
from django.contrib.auth.signals import (
    user_logged_in,
    user_logged_out,
    user_login_failed,
)
from django.db.models.signals import m2m_changed
from django.dispatch import receiver
from django.utils import timezone

from .models import AuditEvent
from .services import log_event

User = get_user_model()


@receiver(user_logged_in)
def on_login(sender, request, user, **kwargs):
    # کار update_last_login خود Django، ولی با update() که save و ردیف تاریخچه ندارد.
    user.last_login = timezone.now()
    User.objects.filter(pk=user.pk).update(last_login=user.last_login)
    log_event(AuditEvent.Event.LOGIN, request, user)


@receiver(user_logged_out)
def on_logout(sender, request, user, **kwargs):
    if user is not None:  # خروج کسی که وارد نشده بود چیزی برای ثبت ندارد
        log_event(AuditEvent.Event.LOGOUT, request, user)


@receiver(user_login_failed)
def on_login_failed(sender, credentials, request=None, **kwargs):
    # Django رمز را پیش از فرستادن سیگنال با ستاره عوض می‌کند؛ فقط نام کاربری را برمی‌داریم.
    log_event(AuditEvent.Event.LOGIN_FAILED, request, username=credentials.get("username", ""))


def track_relation(field_name, event):
    """برای فیلد چندبه‌چند field_name روی User، هر افزودن و برداشتن را ثبت می‌کند، از هر دو طرف رابطه:
    user.groups.add(group) و group.user_set.add(user) هر دو ثبت می‌شوند."""
    field = User._meta.get_field(field_name)
    reverse_name = field.remote_field.get_accessor_name()  # مثلاً user_set روی Group

    def on_change(sender, instance, action, reverse, model, pk_set, **kwargs):
        if action == "pre_clear":
            # بعد از clear دیگر نمی‌شود فهمید چه چیزهایی برداشته شد؛ پیش از آن نگهشان می‌داریم.
            related = getattr(instance, reverse_name if reverse else field_name)
            instance._audit_cleared = set(related.values_list("pk", flat=True))
            return
        if action == "post_clear":
            pk_set = instance.__dict__.pop("_audit_cleared", set())
        elif action not in ("post_add", "post_remove"):
            return
        if not pk_set:
            return
        if reverse:
            # instance مثلاً یک گروه است و pk_set شناسه‌ی کاربرها
            changes = [(user, [instance]) for user in User.objects.filter(pk__in=pk_set)]
        else:
            changes = [(instance, list(model.objects.filter(pk__in=pk_set)))]
        for user, items in changes:
            log_event(
                event,
                target=f"{user.get_full_name() or user.username} ({user.username})",
                action="added" if action == "post_add" else "removed",
                items=sorted(str(item) for item in items),
            )

    m2m_changed.connect(on_change, sender=field.remote_field.through, weak=False, dispatch_uid=f"audit_{field_name}")


track_relation("groups", AuditEvent.Event.ROLES_CHANGED)
track_relation("managed_units", AuditEvent.Event.MANAGED_UNITS_CHANGED)
