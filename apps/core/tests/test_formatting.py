from apps.core.templatetags.formatting import thousands


def test_thousands_groups_digits_and_leaves_empty_values_empty():
    assert thousands(12_000_000_000) == "12,000,000,000"
    assert thousands(999) == "999"
    assert thousands(None) == ""
