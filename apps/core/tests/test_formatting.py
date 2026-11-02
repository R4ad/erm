from apps.core.templatetags.formatting import minutes, paragraphs, thousands


def test_paragraphs_splits_on_blank_lines_and_escapes_html():
    html = paragraphs("## عنوان\n\nبند اول\nخط دوم\n\n<script>alert(1)</script>")

    assert html == (
        '<h4 class="h6 mt-3">عنوان</h4><p>بند اول<br>خط دوم</p><p>&lt;script&gt;alert(1)&lt;/script&gt;</p>'
    )
    assert paragraphs("") == ""
    assert paragraphs(None) == ""


def test_thousands_groups_digits_and_leaves_empty_values_empty():
    assert thousands(12_000_000_000) == "12,000,000,000"
    assert thousands(999) == "999"
    assert thousands(None) == ""


def test_minutes_are_shown_as_days_hours_and_minutes():
    assert minutes(45) == "45 دقیقه"
    assert minutes(90) == "1 ساعت و 30 دقیقه"
    assert minutes(240) == "4 ساعت"
    assert minutes(1440) == "1 روز"
    assert minutes(1500) == "1 روز و 1 ساعت"
    assert minutes(2 * 1440 + 5) == "2 روز و 5 دقیقه"
    assert minutes(None) == ""

