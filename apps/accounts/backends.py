from django.contrib.auth.backends import ModelBackend
from django.utils import timezone


class AccessWindowBackend(ModelBackend):
    """مثل ModelBackend، به‌اضافه‌ی پایان دسترسی موقت (فیگما ۱۹): پس از access_expires نه ورود پذیرفته می‌شود و نه
    نشست باز؛ get_user هم همین user_can_authenticate را می‌پرسد."""

    def user_can_authenticate(self, user):
        expires = getattr(user, "access_expires", None)
        return super().user_can_authenticate(user) and (expires is None or expires >= timezone.localdate())
