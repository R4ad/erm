from django.db.models import Count, Q
from django.utils import timezone

from .models import Coverage, RiskCategory


def active_categories():
    """دسته‌هایی که ستون جدول پوشش‌اند."""
    return list(RiskCategory.objects.filter(is_active=True))


def coverage_rows(services, categories):
    """برای هر خدمت فهرست خانه‌هایش به ترتیب دسته‌ها. خانه‌ای که ردیف ندارد یک Coverage ذخیره‌نشده با وضعیت
    «در انتظار بررسی» است؛ پس قالب برای همه‌ی خانه‌ها یک‌جور کار می‌کند."""
    services = list(services)
    saved = Coverage.objects.filter(service__in=services, category__in=categories).select_related("reviewed_by")
    by_key = {(cell.service_id, cell.category_id): cell for cell in saved}
    return [
        (
            service,
            [by_key.get((service.pk, category.pk)) or Coverage(service=service, category=category) for category in categories],
        )
        for service in services
    ]


def done_cells_count(categories):
    """شمارش خانه‌های غیر «در انتظار» هر خدمت در دسته‌های فعال، برای annotate."""
    return Count(
        "coverage_cells",
        filter=Q(coverage_cells__category__in=categories) & ~Q(coverage_cells__status=Coverage.Status.PENDING),
    )


def complete_services(services, categories):
    """خدمت‌هایی که هیچ خانه‌ی «در انتظار» ندارند: هر دسته‌ی فعال یا بررسی شده یا با دلیل نامرتبط است."""
    return services.annotate(done_cells=done_cells_count(categories)).filter(done_cells=len(categories))


def incomplete_services(services, categories):
    return services.annotate(done_cells=done_cells_count(categories)).filter(done_cells__lt=len(categories))


def critical_coverage(services, categories):
    """درصد پوشش خدمات حیاتی (بخش ۵): خدمت‌های حیاتی فعالی که هیچ خانه‌ی «در انتظار» ندارند، تقسیم بر همه‌ی
    خدمت‌های حیاتی فعال. services همان خدمت‌هایی است که کاربر می‌بیند. اگر خدمت حیاتی‌ای نباشد percent خالی است."""
    critical = services.filter(is_critical=True, is_active=True)
    total = critical.count()
    complete = complete_services(critical, categories).count()
    return {"total": total, "complete": complete, "percent": round(100 * complete / total) if total else None}


def status_counts(services, categories):
    """تعداد خانه‌های هر وضعیت در جدول این خدمت‌ها. خانه‌ای که ردیف ندارد «در انتظار» شمرده می‌شود."""
    total = services.count() * len(categories)
    saved = Coverage.objects.filter(service__in=services, category__in=categories)
    counts = dict(saved.values_list("status").annotate(count=Count("pk")).values_list("status", "count"))
    reviewed = counts.get(Coverage.Status.REVIEWED, 0)
    not_relevant = counts.get(Coverage.Status.NOT_RELEVANT, 0)
    return {"reviewed": reviewed, "not_relevant": not_relevant, "pending": total - reviewed - not_relevant}


def save_coverage(cell, user, status, reason):
    """وضعیت یک خانه را ذخیره می‌کند، با بررسی‌کننده و تاریخ امروز. خانه‌ای که ردیف نداشت ساخته می‌شود."""
    cell.status = status
    cell.reason = reason
    cell.reviewed_by = user
    cell.reviewed_on = timezone.localdate()
    cell.save()
    return cell
