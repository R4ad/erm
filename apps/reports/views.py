from django.shortcuts import render

from .forms import ReportForm
from .services import management_report


def management(request):
    form = ReportForm(request.GET or None)
    context = {"form": form}
    if not request.GET or form.is_valid():
        context.update(
            management_report(
                request.user, **(form.cleaned_data if form.is_bound else {})
            )
        )
    return render(request, "reports/management.html", context)
