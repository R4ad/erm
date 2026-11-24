"""پاسخنامه‌های نمونه برای تست‌های شناسایی و بررسی."""

from django.utils import timezone

from apps.questionnaires.models import (
    PathConsequence,
    Response,
    RiskInstance,
    RiskPath,
    ServiceObjective,
    ServiceRecord,
)


def payment_response(unit, respondent, **fields):
    """همان پاسخنامه‌ی فریم 12a: سه مسیر، مسیر ۳ رویداد ۱ را دوباره استفاده می‌کند، پس دو پیامد و دو گروه."""
    response = Response.objects.create(
        org_unit=unit,
        respondent=respondent,
        conditions="وابستگی کامل ارتباط با شاپرک به یک دیتاسنتر و یک لینک ارتباطی اصلی",
        responsibility="مشترک — زیرساخت در اختیار داتین است و تصمیم ارتقا با بانک",
        **{"status": Response.Status.SUBMITTED, "submitted_at": timezone.now(), **fields},
    )
    record = ServiceRecord.objects.create(response=response, name_and_scope="پرداخت اینترنتی (درگاه پرداخت شاپرک)")
    ServiceObjective.objects.create(service=record, description="پردازش تراکنش‌ها با دسترس‌پذیری ۹۹٫۹٪")
    stop = RiskInstance.objects.create(
        service=record, source_key="e1", number=1, event="توقف کامل پردازش تراکنش‌های پرداخت اینترنتی", scope="همه‌ی بانک‌ها"
    )
    slow = RiskInstance.objects.create(
        service=record, source_key="e2", number=2, event="کندی شدید و خطای زمان‌پایان در تراکنش‌ها", scope="سه بانک بزرگ"
    )
    RiskPath.objects.create(risk_instance=stop, source_key="p1", number=1, description="قطعی لینک ارتباطی اصلی با شاپرک")
    RiskPath.objects.create(risk_instance=slow, source_key="p2", number=2, description="افزایش ناگهانی بار تراکنش در مناسبت‌ها")
    RiskPath.objects.create(risk_instance=stop, source_key="p3", number=3, description="خرابی تجهیزات شبکه‌ی دیتاسنتر اصلی")
    PathConsequence.objects.create(
        risk_instance=stop, impact_types=["F", "R"], description="دسترسی‌نداشتن مشتریان به پرداخت"
    )
    PathConsequence.objects.create(risk_instance=slow, impact_types=["S"], description="تراکنش‌های ناموفق")
    return response
