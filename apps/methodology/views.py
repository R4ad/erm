from django.shortcuts import get_object_or_404
from django.views.generic import DetailView

from .models import MethodVersion, Scale
from .permissions import visible_versions
from .services import LEVELS, MethodTables


class VersionDetailView(DetailView):
    """صفحه‌ی روش ارزیابی. بدون شماره در نشانی، نسخه‌ی فعال را نشان می‌دهد."""

    template_name = "methodology/version_detail.html"
    context_object_name = "version"
    slug_field = "number"  # نشانی با شماره‌ی نسخه است، مثل /method/2/، نه با شناسه‌ی ردیف
    slug_url_kwarg = "number"

    def get_queryset(self):
        # نسخه‌ای که کاربر اجازه‌ی دیدنش را ندارد اصلاً پیدا نمی‌شود (۴۰۴)، نه این‌که پیدا شود و رد شود.
        return visible_versions(self.request.user)

    def get_object(self, queryset=None):
        if self.slug_url_kwarg not in self.kwargs:
            return get_object_or_404(self.get_queryset(), status=MethodVersion.Status.ACTIVE)
        return super().get_object(queryset)

    def get_context_data(self, **kwargs):
        version = self.object
        scales = list(version.scales.prefetch_related("levels"))
        likelihood = [scale for scale in scales if scale.kind == Scale.Kind.LIKELIHOOD]
        bc_scale = next((scale for scale in likelihood if scale.code == "Bc"), None)
        tables = MethodTables(version)
        return super().get_context_data(
            versions=visible_versions(self.request.user),
            # L جدول ترکیب A و B است، نه جدول معیار؛ جدا نشان داده می‌شود.
            likelihood_scales=[scale for scale in likelihood if scale.code != "L"],
            l_scale=next((scale for scale in likelihood if scale.code == "L"), None),
            impact_scales=[scale for scale in scales if scale.kind == Scale.Kind.IMPACT],
            bc_rules=version.bc_rules.all(),
            # Bc بدون هیچ قاعده‌ی برقرار، بزرگ‌ترین سطح مقیاس Bc است (۵ در v5)
            bc_default=max((level.value for level in bc_scale.levels.all()), default=None) if bc_scale else None,
            levels_range=LEVELS,
            likelihood_grid=tables.likelihood_grid(),
            risk_levels=tables.levels,
            floors=tables.floors,
            decision_matrix=tables.decision_matrix(),
            parameters=version.parameters.all(),
            **kwargs,
        )
