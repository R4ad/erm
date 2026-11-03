from django import forms

from apps.core.forms import JalaliDateField


class ApprovalForm(forms.Form):
    """شماره و تاریخ نامه‌ی تصویب. قاعده‌های ثبت (مثل تاریخ آینده) در record_approval است، نه این‌جا."""

    approval_ref = forms.CharField(label="شماره‌ی نامه‌ی تصویب", max_length=100)
    approved_on = JalaliDateField(label="تاریخ نامه‌ی تصویب")
