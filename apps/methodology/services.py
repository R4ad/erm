"""کار با نسخه‌ی روش: جدول‌های یک نسخه در حافظه (موتور محاسبه‌ی قدم ۹ روی MethodTables ساخته می‌شود)،
و چرخه‌ی عمر نسخه: بررسی، کپی به پیش‌نویس، ثبت تصویب و فعال‌سازی."""

from itertools import pairwise

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from .models import MethodParameter, MethodVersion, Scale

LEVELS = range(1, 6)  # احتمال و پیامد در جدول‌ها از ۱ تا ۵ است؛ پیامد صفر یعنی «اثر ندارد» و امتیاز ندارد

# مقیاس‌هایی که هر راهبرد احتمال لازم دارد. مسیرمحور v5: بخش ۱۵ و ۱۷ سند.
REQUIRED_SCALES = {MethodVersion.LikelihoodStrategy.PATHS_V5: ["A", "B0", "E", "Bc", "L"]}


def active_version():
    """نسخه‌ی روشی که الان فعال است؛ ارزیابی و ارزیابی کنترل تازه با همین نسخه ثبت می‌شوند."""
    return MethodVersion.objects.filter(status=MethodVersion.Status.ACTIVE).first()


def parameter(version, key):
    """مقدار یک پارامتر نسخه، یا None اگر نسخه این پارامتر را ندارد."""
    row = version.parameters.filter(key=key).first() if version else None
    return row.value if row else None


class MethodTables:
    """جدول‌های یک نسخه در حافظه، تا هر خانه‌ی ماتریس یک پرس‌وجوی جدا به پایگاه داده نزند."""

    def __init__(self, version):
        self.version = version
        self.cells = {(cell.a, cell.b): cell.likelihood for cell in version.likelihood_cells.all()}
        self.levels = list(version.risk_levels.all())  # به ترتیب رتبه، طبق Meta.ordering
        self.floors = list(version.impact_floors.select_related("min_level"))
        self.bc_rules = list(version.bc_rules.all())
        # سطح‌های مجاز هر مقیاس، مثل {"A": [1, 2, 3, 4, 5], "S": [0, 1, 2, 3, 4, 5]}
        scales = list(version.scales.prefetch_related("levels"))
        self.scale_values = {scale.code: [level.value for level in scale.levels.all()] for scale in scales}
        self.impact_codes = [scale.code for scale in scales if scale.kind == Scale.Kind.IMPACT]

    def likelihood(self, a, b):
        """L از جدول A × B (بخش ۱۷)."""
        return self.cells[(a, b)]

    def base_level(self, score):
        """سطح پایه: سطحی که امتیاز در بازه‌اش است (بخش ۱۸)."""
        for level in self.levels:
            if level.min_score <= score <= level.max_score:
                return level
        raise ValueError(f"امتیاز {score} در بازه‌ی هیچ سطحی نیست.")

    def decision_level(self, likelihood, impact):
        """سطح تصمیم: سطح پایه‌ی L × I، مگر کف پیامد سطح بالاتری بخواهد. خود امتیاز عوض نمی‌شود (بخش ۱۸)."""
        level = self.base_level(likelihood * impact)
        for floor in self.floors:
            if impact >= floor.min_impact and floor.min_level.rank > level.rank:
                level = floor.min_level
        return level

    def bc(self, e_values, independent):
        """Bc یک مسیر از E کنترل‌های پیشگیرانه‌اش (بخش ۱۵ و س۱۱ قدم ۸). از قاعده‌های برقرار کمترین Bc انتخاب
        می‌شود و اگر هیچ قاعده‌ای برقرار نباشد، Bc بزرگ‌ترین سطح مقیاس Bc است (۵ در v5: «فاقد مانع با اثر
        اثبات‌شده»). independent یعنی استقلال موانع این مسیر با شواهد تأیید شده است (بخش ۱۵، قاعده‌ی ۴)."""
        bc = max(self.scale_values["Bc"])
        for rule in self.bc_rules:
            enough = sum(1 for e in e_values if e >= rule.min_e) >= rule.min_count
            if enough and (independent or not rule.needs_independence):
                bc = min(bc, rule.bc)
        return bc

    def likelihood_grid(self):
        """سطرهای جدول احتمال برای نمایش: [(a، [L برای B1 تا B5])]. خانه‌ی خالی None است."""
        return [(a, [self.cells.get((a, b)) for b in LEVELS]) for a in LEVELS]

    def decision_matrix(self):
        """سطرهای ماتریس L × I برای نمایش. هر خانه امتیاز، سطح تصمیم و این را دارد که کف پیامد سطح را بالا برده
        یا نه. در پیش‌نویسی که بازه‌ی سطح‌هایش کامل نیست، سطح خانه‌ای که در هیچ بازه‌ای نیست None است."""
        rows = []
        for likelihood in LEVELS:
            cells = []
            for impact in LEVELS:
                score = likelihood * impact
                try:
                    base, level = self.base_level(score), self.decision_level(likelihood, impact)
                except ValueError:
                    base = level = None
                cells.append({"score": score, "level": level, "raised": level is not None and level != base})
            rows.append((likelihood, cells))
        return rows


def check_version(version):
    """نسخه را پیش از تصویب و فعال‌سازی بررسی می‌کند و فهرست ایرادها را برمی‌گرداند. فهرست خالی یعنی موتور
    محاسبه برای هر ورودی جواب دارد: همه‌ی مقیاس‌ها و سطح‌ها هستند و هر امتیاز دقیقاً یک سطح دارد."""
    scales = {scale.code: scale for scale in version.scales.prefetch_related("levels")}
    problems = check_scales(version, scales) + check_likelihood_table(version) + check_risk_levels(version)

    present = set(version.parameters.values_list("key", flat=True))
    missing = [label for key, label in MethodParameter.Key.choices if key not in present]
    if missing:
        problems.append(f"این پارامترها مقدار ندارند: {'، '.join(missing)}.")
    if version.based_on_id and not version.change_notes.strip():
        problems.append("شرح تغییرات نسبت به نسخه‌ی قبلی خالی است؛ مقدار، دلیل و مرجع هر تغییر را بنویسید (بخش ۳۲).")
    return problems


def check_scales(version, scales):
    problems = []
    for code in REQUIRED_SCALES[version.likelihood_strategy]:
        if code not in scales:
            problems.append(f"مقیاس {code} نیست.")
        elif scales[code].kind != Scale.Kind.LIKELIHOOD:
            problems.append(f"مقیاس {code} باید از نوع احتمال باشد.")
    if not any(scale.kind == Scale.Kind.IMPACT for scale in scales.values()):
        problems.append("هیچ بُعد پیامدی نیست.")

    for scale in scales.values():
        values = [level.value for level in scale.levels.all()]
        if scale.kind == Scale.Kind.LIKELIHOOD and values != list(LEVELS):
            problems.append(f"سطح‌های مقیاس {scale.code} باید دقیقاً ۱ تا ۵ باشند.")
        if scale.kind == Scale.Kind.IMPACT and values != [0, *LEVELS]:
            problems.append(f"سطح‌های مقیاس {scale.code} باید دقیقاً ۰ تا ۵ باشند.")
        problems += check_bounds(scale)
    return problems


def check_bounds(scale):
    """مرزهای عددی سطح‌ها باید به هم برسند تا هر عدد فقط در یک سطح بیفتد، و آخرین سطح بی‌سقف باشد."""
    bounded = [level for level in scale.levels.all() if level.has_bounds]
    if not bounded:
        return []
    if not scale.bound_rule:
        return [f"مقیاس {scale.code} مرز عددی دارد ولی قاعده‌ی مرزش (کدام سر بازه بسته است) تعیین نشده است."]
    problems = []
    for lower, upper in pairwise(bounded):
        if lower.upper is None or lower.upper != upper.lower:
            problems.append(f"مرز سطح {lower.value} و {upper.value} مقیاس {scale.code} به هم نمی‌رسد.")
    if bounded[-1].upper is not None:
        problems.append(f"آخرین سطح مقیاس {scale.code} نباید کران بالا داشته باشد تا عددهای بزرگ‌تر هم سطح داشته باشند.")
    return problems


def check_likelihood_table(version):
    cells = {(cell.a, cell.b): cell.likelihood for cell in version.likelihood_cells.all()}
    missing = [f"A{a} و B{b}" for a in LEVELS for b in LEVELS if (a, b) not in cells]
    if missing:
        return [f"این خانه‌های جدول احتمال خالی‌اند: {'، '.join(missing)}."]
    problems = []
    for a in LEVELS:
        for b in LEVELS:
            # A بیشتر یعنی آغازگر پرتکرارتر و B بیشتر یعنی مسیر آسان‌تر؛ هیچ‌کدام نباید L را پایین بیاورد.
            if (a > 1 and cells[(a, b)] < cells[(a - 1, b)]) or (b > 1 and cells[(a, b)] < cells[(a, b - 1)]):
                problems.append(f"در جدول احتمال، L خانه‌ی A{a} و B{b} از خانه‌ی پیش از خودش کمتر است.")
    return problems


def check_risk_levels(version):
    levels = list(version.risk_levels.all())  # به ترتیب رتبه
    if not levels:
        return ["هیچ سطح ریسکی نیست."]
    problems = []
    if [level.rank for level in levels] != list(range(1, len(levels) + 1)):
        problems.append("رتبه‌ی سطح‌های ریسک باید از ۱ شروع شود و پشت سر هم باشد.")
    if levels[0].min_score != 1 or levels[-1].max_score != 25:
        problems.append("بازه‌ی سطح‌های ریسک باید از امتیاز ۱ شروع شود و به ۲۵ برسد.")
    # سطح با رتبه‌ی بالاتر باید امتیاز بالاتر داشته باشد؛ وگرنه کم شدن L یا I می‌توانست سطح را بالا ببرد.
    for lower, upper in pairwise(levels):
        if upper.min_score != lower.max_score + 1:
            problems.append(f"بازه‌ی «{upper.name}» درست بعد از بازه‌ی «{lower.name}» شروع نمی‌شود.")
    for floor in version.impact_floors.select_related("min_level"):
        if floor.min_level.version_id != version.pk:
            problems.append(f"کف پیامد {floor.min_impact} به سطحی از نسخه‌ی دیگر اشاره می‌کند.")
    return problems


def save_with_reason(row, by, reason):
    """ذخیره با کاربر و دلیل، تا در «تغییرات داده» معلوم باشد چه کسی و چرا، حتی وقتی از shell اجرا شود."""
    row._history_user = by
    row._change_reason = reason
    row.save()
    return row


def save_as_copy(row, by, reason, **changes):
    """ردیف را با شناسه‌ی تازه ذخیره می‌کند. همه‌ی فیلدها کپی می‌شوند، حتی فیلدی که بعداً به مدل اضافه شود."""
    row.pk = None
    row._state.adding = True
    for name, value in changes.items():
        setattr(row, name, value)
    return save_with_reason(row, by, reason)


@transaction.atomic
def copy_version(version, by):
    """نسخه را با همه‌ی جدول‌هایش به پیش‌نویس تازه کپی می‌کند. هر تغییر روش از همین کپی شروع می‌شود."""
    reason = f"کپی از نسخه‌ی {version.number}"
    source = MethodVersion.objects.get(pk=version.pk)  # شیء جدا، تا شیء فراخواننده دست نخورد
    copy = save_as_copy(
        source,
        by,
        reason,
        number=MethodVersion.objects.aggregate(Max("number"))["number__max"] + 1,
        status=MethodVersion.Status.DRAFT,
        based_on=version,
        change_notes="",
        effective_from=None,
        approval_ref="",
        approved_on=None,
        approval_recorded_by=None,
        activated_at=None,
        activated_by=None,
        submitted_at=None,
        submitted_by=None,
    )

    for scale in version.scales.prefetch_related("levels"):
        levels = list(scale.levels.all())  # پیش از آن‌که شناسه‌ی مقیاس عوض شود
        new_scale = save_as_copy(scale, by, reason, version=copy)
        for level in levels:
            save_as_copy(level, by, reason, scale=new_scale)

    new_levels = {}  # رتبه ← سطح ریسک تازه، تا کف‌ها به سطح نسخه‌ی تازه اشاره کنند
    for level in version.risk_levels.all():
        new_levels[level.rank] = save_as_copy(level, by, reason, version=copy)
    for floor in version.impact_floors.select_related("min_level"):
        save_as_copy(floor, by, reason, version=copy, min_level=new_levels[floor.min_level.rank])

    for row in [*version.likelihood_cells.all(), *version.bc_rules.all(), *version.parameters.all()]:
        save_as_copy(row, by, reason, version=copy)
    return copy


@transaction.atomic
def set_parameters(version, values, by):
    """مقدار پارامترهای پیش‌نویسِ فرستاده‌نشده را عوض می‌کند. values: {کلید: Decimal}. خروجی: کلیدهای عوض‌شده."""
    version = MethodVersion.objects.select_for_update().get(pk=version.pk)
    if not version.is_editable_draft:
        raise ValidationError("فقط پیش‌نویسی که هنوز برای تصویب فرستاده نشده ویرایش می‌شود.")
    rows = {row.key: row for row in version.parameters.all()}
    unknown = sorted(set(values) - set(rows))
    if unknown:
        raise ValidationError(f"پارامتر ناشناخته: {'، '.join(unknown)}")
    changed = []
    for key, value in values.items():
        if value < 0:
            raise ValidationError(f"{rows[key].get_key_display()} منفی نمی‌شود.")
        if rows[key].value != value:
            rows[key].value = value
            save_with_reason(rows[key], by, "ویرایش پارامتر در تعریف متدولوژی")
            changed.append(key)
    return changed


@transaction.atomic
def submit_version(version, by):
    """پیش‌نویس را برای بازبینی روش‌شناختی و تصویب مرجع مجاز می‌فرستد. پیش‌نویس ناقص فرستاده نمی‌شود."""
    version = MethodVersion.objects.select_for_update().get(pk=version.pk)
    if not version.is_editable_draft:
        raise ValidationError("فقط پیش‌نویسی که هنوز فرستاده نشده برای تصویب فرستاده می‌شود.")
    problems = check_version(version)
    if problems:
        raise ValidationError(problems)
    version.submitted_at = timezone.now()
    version.submitted_by = by
    return save_with_reason(version, by, "ارسال برای تصویب")


@transaction.atomic
def record_approval(version, approval_ref, approved_on, by):
    """شماره و تاریخ نامه‌ی تصویب را ثبت می‌کند؛ مرجع مجاز بیرون از سامانه تصویب کرده است (س۱۲ قدم ۸).
    پیش‌نویس با این کار «تصویب‌شده» می‌شود. نسخه‌ی آزمایشی فعال، اگر بی‌تغییر تصویب شده باشد، تصویب را روی همان
    نسخه می‌گیرد و فعال می‌ماند. تصویبی که ثبت شد دیگر عوض نمی‌شود."""
    version = MethodVersion.objects.select_for_update().get(pk=version.pk)  # وضعیت تازه، نه آن‌چه در حافظه مانده
    approval_ref = approval_ref.strip()
    if not approval_ref or approved_on is None:
        raise ValidationError("شماره و تاریخ نامه‌ی تصویب هر دو لازم‌اند.")
    if approved_on > timezone.localdate():
        raise ValidationError("تاریخ نامه‌ی تصویب نمی‌تواند بعد از امروز باشد.")
    if not version.can_record_approval:
        raise ValidationError("تصویب فقط برای پیش‌نویس، یا نسخه‌ی آزمایشی فعال، ثبت می‌شود.")
    if version.submitted_by_id and version.submitted_by_id == by.pk:
        # تفکیک وظایف (فیگما ۱۹): متولی روش نسخه‌ی پیشنهادی خودش را تصویب نمی‌کند
        raise ValidationError("تصویب نسخه را کسی جز فرستنده‌ی آن برای تصویب ثبت می‌کند.")
    if version.is_draft:
        problems = check_version(version)
        if problems:
            raise ValidationError(problems)
        version.status = MethodVersion.Status.APPROVED
    version.approval_ref = approval_ref
    version.approved_on = approved_on
    version.approval_recorded_by = by
    return save_with_reason(version, by, "ثبت تصویب")


@transaction.atomic
def activate_version(version, by):
    """نسخه‌ی تصویب‌شده را فعال و نسخه‌ی فعال قبلی را بایگانی می‌کند؛ ارزیابی‌های تازه از این لحظه با این نسخه‌اند.
    نسخه‌ی تصویب‌نشده فعال نمی‌شود (س۱۲). فقط نسخه‌ی آزمایشی ۱ بی‌تصویب فعال شد، آن هم با migration داده."""
    version = MethodVersion.objects.select_for_update().get(pk=version.pk)
    if version.status != MethodVersion.Status.APPROVED:
        raise ValidationError("فقط نسخه‌ی تصویب‌شده فعال می‌شود.")
    problems = check_version(version)
    if problems:
        raise ValidationError(problems)
    # اول نسخه‌ی قبلی بایگانی می‌شود، چون پایگاه داده دو نسخه‌ی فعال را حتی یک لحظه نمی‌پذیرد.
    for current in MethodVersion.objects.select_for_update().filter(status=MethodVersion.Status.ACTIVE):
        current.status = MethodVersion.Status.ARCHIVED
        save_with_reason(current, by, f"بایگانی با فعال شدن نسخه‌ی {version.number}")
    version.status = MethodVersion.Status.ACTIVE
    version.activated_at = timezone.now()
    version.activated_by = by
    return save_with_reason(version, by, "فعال‌سازی")
