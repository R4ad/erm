from django import forms
from django.db.models import Q

from apps.core.forms import BootstrapFormMixin, JalaliDateField

from .models import AuditEvent
from .services import HISTORY_TYPES, tracked_models


class PeriodFilterMixin(forms.Form):
    """فیلدهای مشترک دو فهرست: جست‌وجوی کاربر و بازه‌ی تاریخ شمسی."""

    q = forms.CharField(
        label="کاربر", required=False, widget=forms.TextInput(attrs={"placeholder": "نام یا نام کاربری"})
    )
    start = JalaliDateField(label="از تاریخ", required=False)
    end = JalaliDateField(label="تا تاریخ", required=False)

    def clean(self):
        data = super().clean()
        if data.get("start") and data.get("end") and data["start"] > data["end"]:
            self.add_error("end", "«تا تاریخ» نباید پیش از «از تاریخ» باشد.")
        return data

    def filter_period(self, queryset, date_field, user_fields):
        """user_fields: نام فیلدهای متنی کاربر، مثل username یا user__first_name."""
        data = self.cleaned_data
        for word in data["q"].split():
            condition = Q()
            for name in user_fields:
                condition |= Q(**{f"{name}__icontains": word})
            queryset = queryset.filter(condition)
        # __date زمان را با منطقه‌ی زمانی تهران به روز تبدیل می‌کند، پس «تا تاریخ» کل همان روز را دارد.
        if data["start"]:
            queryset = queryset.filter(**{f"{date_field}__date__gte": data["start"]})
        if data["end"]:
            queryset = queryset.filter(**{f"{date_field}__date__lte": data["end"]})
        return queryset


class EventFilterForm(BootstrapFormMixin, PeriodFilterMixin):
    event = forms.ChoiceField(label="رویداد", required=False, choices=[("", "همه")] + AuditEvent.Event.choices)

    field_order = ["q", "event", "start", "end"]

    def filter(self, events):
        events = self.filter_period(events, "at", ["username", "user__first_name", "user__last_name"])
        if self.cleaned_data["event"]:
            events = events.filter(event=self.cleaned_data["event"])
        return events


class ChangeFilterForm(BootstrapFormMixin, PeriodFilterMixin):
    model = forms.ChoiceField(label="نوع رکورد")
    history_type = forms.ChoiceField(
        label="تغییر", required=False, choices=[("", "همه")] + list(HISTORY_TYPES.items())
    )

    field_order = ["model", "q", "history_type", "start", "end"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.models = {model._meta.label_lower: model for model in tracked_models()}
        self.fields["model"].choices = [(label, model._meta.verbose_name) for label, model in self.models.items()]

    def filter(self):
        """ردیف‌های تاریخچه‌ی همان نوع رکوردی که انتخاب شده."""
        model = self.models[self.cleaned_data["model"]]
        records = model.history.select_related("history_user").order_by("-history_date", "-history_id")
        records = self.filter_period(
            records,
            "history_date",
            ["history_user__username", "history_user__first_name", "history_user__last_name"],
        )
        if self.cleaned_data["history_type"]:
            records = records.filter(history_type=self.cleaned_data["history_type"])
        return records
