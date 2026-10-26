from django import forms

from apps.core.forms import BootstrapFormMixin

from .models import OrgUnit
from .services import get_subtree_ids


class UnitChoiceField(forms.ModelChoiceField):

    def label_from_instance(self, unit):
        label = f"{unit.name} ({unit.code})"
        if not unit.is_active:
            label += " - غیرفعال"
        return label

class OrgUnitForm(BootstrapFormMixin, forms.ModelForm):
    class Meta:
        model = OrgUnit
        fields = ["code", "name", "parent", "is_active"]
        field_classes = {"parent": UnitChoiceField}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        parent = self.fields["parent"]
        parent.empty_label = "بدون بالادست (واحد ریشه)"
        if self.instance.pk:
            parent.queryset = parent.queryset.exclude(pk__in=get_subtree_ids(self.instance))