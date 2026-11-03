from django.db.models import Count, Q

from .models import Applicability, IsoControl


def soa_summary():
    """شمار ردیف‌های بیانیه‌ی کاربردپذیری برای سر صفحه‌ی آن."""
    total = IsoControl.objects.count()
    # نام شمارنده‌ها با نام فیلدها یکی نیست تا جنگو آن‌ها را با فیلد اشتباه نگیرد.
    counts = Applicability.objects.aggregate(
        applicable_count=Count("pk", filter=Q(applicable=True)),
        not_applicable_count=Count("pk", filter=Q(applicable=False)),
        implemented_count=Count("pk", filter=Q(implementation=Applicability.Implementation.IMPLEMENTED)),
    )
    rows = {name.removesuffix("_count"): value for name, value in counts.items()}
    # کنترلی از پیوست A که کاربرد دارد ولی هیچ کنترل فعال سازمان به آن نگاشت نشده است.
    gaps = (
        IsoControl.objects.filter(applicability__applicable=True)
        .alias(active=Count("controls", filter=Q(controls__is_active=True)))
        .filter(active=0)
        .count()
    )
    return {
        "total": total,
        "undetermined": total - rows["applicable"] - rows["not_applicable"],
        "gaps": gaps,
        **rows,
    }
