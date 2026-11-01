import pytest
from django import forms

from apps.catalog.forms import ServiceForm


@pytest.mark.django_db
def test_empty_choice_of_select_boxes_is_persian():
    form = ServiceForm()

    assert form.fields["kind"].choices[0] == ("", "- انتخاب کنید -")  # فیلد choices مدل
    assert next(iter(form.fields["org_unit"].choices)) == ("", "- انتخاب کنید -")  # ForeignKey
    assert forms.ChoiceField(choices=[]).choices == []  # فهرست بدون گزینه‌ی خالی دست نمی‌خورد
