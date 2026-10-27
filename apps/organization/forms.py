from django import forms
from django.forms.models import ModelChoiceIterator

from apps.core.forms import BootstrapFormMixin

from .models import OrgUnit
from .services import get_subtree_ids, unit_tree


class UnitChoiceIterator(ModelChoiceIterator):
    """گزینه‌ها را به ترتیب درخت می‌دهد: هر واحد و پشت سرش زیرمجموعه‌هایش."""

    def __iter__(self):
        if self.field.empty_label is not None:
            yield ("", self.field.empty_label)
        for unit in unit_tree(self.queryset):
            yield self.choice(unit)


class UnitChoiceField(forms.ModelChoiceField):
    """فهرست کشویی واحدها به شکل درخت، تا واحدهای هم‌نام با جایشان در درخت از هم جدا شوند."""

    iterator = UnitChoiceIterator

    def label_from_instance(self, unit):
        label = "— " * unit.depth + unit.name
        if not unit.is_active:
            label += " - غیرفعال"
        return label

class OrgUnitForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = OrgUnit
        fields = ["name", "parent", "code", "is_active"]
        field_classes = {"parent": UnitChoiceField}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        parent = self.fields["parent"]
        parent.empty_label = "بدون بالادست (واحد ریشه)"
        if self.instance.pk:
            parent.queryset = parent.queryset.exclude(pk__in=get_subtree_ids(self.instance))