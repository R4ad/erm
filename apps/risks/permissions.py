from apps.accounts.roles import Role

# این نقش‌ها وضعیت خانه‌های جدول پوشش و دسته‌های ریسک را ثبت و ویرایش می‌کنند. مدیر سامانه همیشه می‌تواند.
UNIVERSE_EDIT_ROLES = [Role.GRC_MEMBER]


def can_edit_universe(user):
    return user.is_system_admin or user.has_role(*UNIVERSE_EDIT_ROLES)
