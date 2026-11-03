from django.db import transaction

from .models import CodeCounter


def next_code(prefix, width=4):
    """کد بعدی یک پیشوند، مثل next_code("SC") که SC-0001 و بعد SC-0002 می‌دهد. شماره‌ها از هم پریده
    نمی‌شوند مگر ثبتی که کد گرفته بعداً شکست بخورد؛ کدی که یک بار داده شده دوباره داده نمی‌شود."""
    with transaction.atomic():
        counter, _ = CodeCounter.objects.select_for_update().get_or_create(prefix=prefix)
        counter.last += 1
        counter.save(update_fields=["last"])
    return f"{prefix}-{counter.last:0{width}d}"
