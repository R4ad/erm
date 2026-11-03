from apps.accounts.roles import Role

# این نقش‌ها وضعیت خانه‌های جدول پوشش را ثبت و ویرایش می‌کنند (س۳۷). مدیر سامانه همیشه می‌تواند.
COVERAGE_EDIT_ROLES = [Role.GRC_MEMBER, Role.SECURITY_WORKGROUP]
# این نقش‌ها دسته‌های ریسک را ثبت و ویرایش می‌کنند (س۴۱). مدیر سامانه همیشه می‌تواند.
CATEGORY_EDIT_ROLES = [Role.GRC_MEMBER]


def can_edit_coverage(user):
    return user.is_system_admin or user.has_role(*COVERAGE_EDIT_ROLES)


def can_edit_categories(user):
    return user.is_system_admin or user.has_role(*CATEGORY_EDIT_ROLES)
