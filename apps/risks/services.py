import re

from django.db.models import Count, Q
from django.utils import timezone

from .models import Coverage, Risk, RiskCategory, RiskScenario, Tag


def active_categories():
    """دسته‌هایی که ستون جدول پوشش‌اند."""
    return list(RiskCategory.objects.filter(is_active=True))


def coverage_rows(services, categories, risks=None):
    """برای هر خدمت فهرست خانه‌هایش به ترتیب دسته‌ها. خانه‌ای که ردیف ندارد یک Coverage ذخیره‌نشده با وضعیت
    «در انتظار بررسی» است؛ پس قالب برای همه‌ی خانه‌ها یک‌جور کار می‌کند. اگر risks (ریسک‌هایی که کاربر می‌بیند)
    داده شود، هر خانه risk_count هم دارد: تعداد ریسک‌های فعال همان خدمت و دسته."""
    services = list(services)
    saved = Coverage.objects.filter(service__in=services, category__in=categories).select_related("reviewed_by")
    by_key = {(cell.service_id, cell.category_id): cell for cell in saved}
    counts = {}
    if risks is not None:
        in_grid = active_risks(risks).filter(service__in=services, category__in=categories)
        counts = {
            (row["service"], row["category"]): row["count"]
            for row in in_grid.values("service", "category").annotate(count=Count("pk")).order_by()
        }
    rows = []
    for service in services:
        cells = []
        for category in categories:
            cell = by_key.get((service.pk, category.pk)) or Coverage(service=service, category=category)
            cell.risk_count = counts.get((service.pk, category.pk), 0)
            cells.append(cell)
        rows.append((service, cells))
    return rows


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


def coverage_tabs(services, categories):
    """شمارنده‌ی زبانه‌های جدول جهان ریسک (فیگما ۰۹): همه‌ی خدمت‌های فعالی که کاربر می‌بیند، حیاتی‌ها، و آن‌هایی که
    دست‌کم یک خانه‌ی «در انتظار» دارند."""
    return {
        "all": services.count(),
        "critical": services.filter(is_critical=True).count(),
        "incomplete": incomplete_services(services, categories).count(),
    }


def scenario_index(services, categories):
    """سناریوهای فعال هر «خدمت × دسته». ثبت ریسک همیشه از یک سناریو است؛ خانه‌ای که یک سناریو دارد مستقیم به ثبت
    ریسک از همان سناریو می‌رود و بقیه به کتابخانه‌ی سناریو با همان خدمت و دسته."""
    index = {}
    scenarios = RiskScenario.objects.filter(is_active=True, service__in=services, category__in=categories)
    for pk, service, category in scenarios.values_list("pk", "service_id", "category_id").order_by("code"):
        index.setdefault((service, category), []).append(pk)
    return index


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


def active_risks(risks):
    """ریسک‌هایی که رد یا بسته نشده‌اند."""
    return risks.exclude(status__in=Risk.CLOSED_STATUSES)


def mark_covered_by_risk(risk, user):
    """ریسک فعالی که خدمت و دسته دارد، خانه‌ی «خدمت × دسته‌ی» خودش را اگر «در انتظار» است «بررسی‌شده» می‌کند (س۳۸)
    و همان خانه را برمی‌گرداند؛ اگر چیزی عوض نشد None. خانه‌ی «بررسی‌شده» دست نمی‌خورد و فرم ریسک نمی‌گذارد
    ریسک در خانه‌ی «نامرتبط» ثبت شود."""
    if not (risk.is_active and risk.service_id and risk.category_id):
        return None
    cell = Coverage.objects.filter(service=risk.service, category=risk.category).first()
    if cell and not cell.is_pending:
        return None
    cell = cell or Coverage(service=risk.service, category=risk.category)
    return save_coverage(cell, user, Coverage.Status.REVIEWED, f"ریسک {risk.code} برای این خانه ثبت شد.")


def parse_tag_names(text):
    """متن برچسب‌ها را که با ویرگول فارسی یا انگلیسی جدا شده‌اند به فهرست نام‌های یکتا تبدیل می‌کند،
    با همان ترتیب و بدون فاصله‌ی اضافه."""
    names = []
    for part in re.split(r"[,،]", text):
        name = " ".join(part.split())
        if name and name not in names:
            names.append(name)
    return names


def set_tags(risk, names):
    """برچسب‌های ریسک را همین نام‌ها می‌کند؛ برچسبی که نیست ساخته می‌شود."""
    tags = [Tag.objects.get_or_create(name=name)[0] for name in names]
    risk.tags.set(tags)
