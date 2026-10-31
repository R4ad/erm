from django import forms
from django.utils import timezone

from apps.core.forms import BootstrapFormMixin, JalaliDateField
from apps.core.jalali import jalali_year, jalali_year_range

from .models import Holiday


class HolidayForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = Holiday
        fields = ["date", "title"]
        field_classes = {"date": JalaliDateField}


class HolidayFilterForm(BootstrapFormMixin, forms.Form):
    year = forms.TypedChoiceField(label="سال", coerce=int, required=False, empty_value=None)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # سال‌هایی که تعطیلی دارند، به‌اضافه‌ی امسال
        years = {jalali_year(day) for day in Holiday.objects.values_list("date", flat=True)}
        years.add(jalali_year(timezone.localdate()))
        self.fields["year"].choices = [("", "همه‌ی سال‌ها")] + [(year, year) for year in sorted(years, reverse=True)]

    def filter(self, holidays):
        year = self.cleaned_data["year"]
        if year:
            start, end = jalali_year_range(year)
            holidays = holidays.filter(date__gte=start, date__lt=end)
        return holidays