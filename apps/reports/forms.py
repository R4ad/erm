from django import forms

from apps.core.forms import BootstrapFormMixin, JalaliDateField


class ReportForm(BootstrapFormMixin, forms.Form):
    start = JalaliDateField(label="آغاز دوره تغییرات", required=False)
    end = JalaliDateField(label="پایان دوره تغییرات", required=False)

    def clean(self):
        data = super().clean()
        if data.get("start") and data.get("end") and data["start"] > data["end"]:
            self.add_error("end", "پایان دوره پیش از آغاز آن است.")
        return data
