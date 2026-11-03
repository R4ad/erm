"""موتور محاسبه‌ی ریسک (قدم ۹): از ورودی‌های یک ارزیابی، B هر مسیر و کل سناریو، L، I، امتیاز، سطح پایه و
سطح تصمیم را حساب می‌کند. بخش ۱۳ تا ۱۸ و بخش ۷ (عدم قطعیت) سند v5.

موتور «تابع خالص» است: فقط ورودی‌ها و جدول‌های یک نسخه‌ی روش در حافظه (MethodTables) را می‌خواند، به پایگاه داده
چیزی نمی‌نویسد و هیچ عدد روشی در کدش نیست. هر عدد، جدول و آستانه از نسخه می‌آید؛ پس نسخه‌ی تازه‌ی روش بدون
تغییر کد اثر می‌کند و هر ارزیابی قدیمی با نسخه‌ی خودش دوباره همان نتیجه را می‌دهد.

هر ورودی عددی می‌تواند یک عدد باشد، یا بازه‌ای مثل (3, 4) وقتی داده کافی نیست، یا None وقتی نامعلوم است و هیچ
کران قابل دفاعی ندارد. نتیجه هم بازه است و تصمیم بر کران بالای آن گرفته می‌شود. اگر کران بالا معلوم نباشد،
ارزیابی «ناقص» است (بخش ۷)."""

from dataclasses import dataclass

from .services import LEVELS


class InvalidInput(ValueError):
    """ورودی‌ای که روش اصلاً نمی‌پذیرد، مثل A برابر ۷ یا پروفایل پیامد تمام‌صفر (بخش ۲۳). messages همه‌ی ایرادهاست."""

    def __init__(self, messages):
        self.messages = list(messages)
        super().__init__(" ".join(self.messages))


@dataclass(frozen=True)
class Band:
    """بازه‌ی یک مقدار، از low تا high. مقدار قطعی بازه‌ای است که دو سرش یکی است."""

    low: int
    high: int

    def __str__(self):
        return str(self.low) if self.low == self.high else f"{self.low} تا {self.high}"


@dataclass(frozen=True)
class Control:
    """یک کنترل پیشگیرانه روی مسیر با اثربخشی E (بخش ۱۶). E را ارزیاب از روی شواهد تعیین می‌کند."""

    e: int | tuple[int, int]
    name: str = ""


@dataclass(frozen=True)
class Path:
    """یک مسیر تحقق (بخش ۱۵): قابلیت پایه‌ی B0، کنترل‌های پیشگیرانه‌اش، و این‌که استقلال موانعش با شواهد تأیید
    شده یا نه. راه دورزدن یا حساب استثنایی که از همه‌ی موانع عبور می‌کند، مسیر جداست (قاعده‌ی ۳ بخش ۱۵)."""

    b0: int | tuple[int, int] | None
    controls: tuple[Control, ...] = ()
    independent: bool = False
    name: str = ""


@dataclass(frozen=True)
class Impact:
    """سطح یک بُعد پیامد (S، D، F، C یا R) برای یک ذی‌نفع: داتین یا یک بانک (بخش ۸). صفر یعنی «اثر ندارد» و None
    یعنی نامعلوم؛ این دو یکی نیستند."""

    stakeholder: str
    dimension: str
    level: int | tuple[int, int] | None


@dataclass(frozen=True)
class Inputs:
    """ورودی‌های یک ارزیابی. سه نشان آخر قاعده‌های تقدم بخش ۱۸ هستند و عضو GRC آن‌ها را با شاهد ثبت می‌کند."""

    a: int | tuple[int, int] | None
    paths: tuple[Path, ...]
    impacts: tuple[Impact, ...]
    ongoing_incident: bool = False  # رویداد در حال وقوع است و پاسخ اضطراری لازم دارد
    binding_prohibition: bool = False  # منع الزام‌آور ادامه‌ی خدمت یا نقض غیرقابل اغماضِ احرازشده
    customer_tolerance_exceeded: bool = False  # عبور از حد تحمل خاص مشتری یا دستور مصوب سخت‌گیرانه‌تر


@dataclass(frozen=True)
class PathResult:
    name: str
    b0: Band | None
    bc: Band
    b: Band | None  # کمترِ B0 و Bc؛ None اگر B0 نامعلوم باشد


@dataclass(frozen=True)
class Result:
    """نتیجه‌ی محاسبه. وقتی ارزیابی ناقص است (incomplete_reasons خالی نیست)، هر مقداری که به جزء نامعلوم وابسته
    است None است. سطح تصمیم بر کران بالای امتیاز است (بخش ۷)."""

    paths: tuple[PathResult, ...]
    b: Band | None
    likelihood: Band | None
    impact: Band | None
    score: Band | None
    base_level: object | None  # RiskLevel
    decision_level: object | None  # RiskLevel
    escalation_reasons: tuple[str, ...] = ()
    incomplete_reasons: tuple[str, ...] = ()
    out_of_acceptance_authority: bool = False  # «خارج از اختیار پذیرش»
    acceptance_restricted: bool = False  # اختیار پذیرش عمومی محدود است

    @property
    def incomplete(self):
        """«ارزیابی ناقص»: کران قابل دفاعی برای دست‌کم یک جزء تعیین‌کننده نیست و پذیرش عادی مسدود است."""
        return bool(self.incomplete_reasons)

    @property
    def decision_score(self):
        """امتیازی که تصمیم بر آن گرفته می‌شود: کران بالای بازه‌ی امتیاز."""
        return self.score.high if self.score else None


def as_band(value, label, allowed, problems):
    """عدد یا بازه را Band می‌کند و None را همان None نگه می‌دارد. مقدار بیرون از سطح‌های مجاز به problems می‌رود."""
    if value is None:
        return None
    low, high = value if isinstance(value, tuple) else (value, value)
    if not all(isinstance(number, int) and not isinstance(number, bool) for number in (low, high)):
        problems.append(f"{label} باید عدد صحیح باشد.")
        return None
    if low not in allowed or high not in allowed:
        problems.append(f"{label} باید بین {min(allowed)} و {max(allowed)} باشد.")
        return None
    if low > high:
        problems.append(f"در بازه‌ی {label}، کران پایین از کران بالا بیشتر است.")
        return None
    return Band(low, high)


def max_band(bands, unknown, top):
    """بیشترینِ چند بازه، وقتی بعضی جزءها نامعلوم‌اند. اگر بیشترینِ جزءهای معلوم همین حالا بالاترین سطح مقیاس
    باشد، جزء نامعلوم نمی‌تواند نتیجه را بالاتر ببرد و نتیجه معلوم است؛ وگرنه کران بالا نامعلوم است (None)."""
    if not bands:
        return None
    result = Band(max(band.low for band in bands), max(band.high for band in bands))
    if unknown and result.high < top:
        return None
    return result


def calculate(tables, inputs):
    """محاسبه‌ی کامل یک ارزیابی با جدول‌های یک نسخه‌ی روش. ورودی نامعتبر InvalidInput می‌دهد."""
    problems = []
    checked = check_likelihood(tables, inputs.a, inputs.paths, problems)
    impact_bands = check_impacts(tables, inputs.impacts, problems)
    if problems:
        raise InvalidInput(problems)

    incomplete = []
    paths, b, likelihood = likelihood_result(tables, inputs.paths, checked, incomplete)
    impact = impact_band(tables, impact_bands, incomplete)
    score = base_level = decision_level = None
    escalations = []
    if likelihood and impact:
        score = Band(likelihood.low * impact.low, likelihood.high * impact.high)
        base_level = tables.base_level(score.high)
        decision_level = tables.decision_level(likelihood.high, impact.high)
        if decision_level != base_level:
            escalations.append(
                f"کف پیامد: پیامد {impact.high} دست‌کم سطح «{decision_level}» دارد؛ امتیاز {score.high} عوض نمی‌شود."
            )

    # قاعده‌های تقدم بخش ۱۸. امتیاز ریسک جدا حفظ می‌شود و فقط سطح تصمیم بالا می‌رود، حتی در ارزیابی ناقص.
    top_level = tables.levels[-1]
    if inputs.ongoing_incident:
        decision_level = top_level
        escalations.append(
            f"رویداد در حال وقوع است و پاسخ اضطراری لازم دارد: اولویت اقدام «{top_level}» است و ارجاع به مدیریت "
            "رخداد هم‌زمان انجام می‌شود."
        )
    if inputs.binding_prohibition:
        decision_level = top_level
        escalations.append(
            f"منع الزام‌آور یا نقض غیرقابل اغماض احراز شده است: «خارج از اختیار پذیرش» با اولویت «{top_level}»؛ "
            "امتیاز پایین مجوز ادامه نیست."
        )
    if inputs.customer_tolerance_exceeded:
        escalations.append("از حد تحمل خاص مشتری یا دستور مصوب سخت‌گیرانه‌تر عبور شده است؛ اختیار پذیرش عمومی محدود است.")

    return Result(
        paths=paths,
        b=b,
        likelihood=likelihood,
        impact=impact,
        score=score,
        base_level=base_level,
        decision_level=decision_level,
        escalation_reasons=tuple(escalations),
        incomplete_reasons=tuple(incomplete),
        out_of_acceptance_authority=inputs.binding_prohibition,
        acceptance_restricted=inputs.customer_tolerance_exceeded or inputs.binding_prohibition,
    )


@dataclass(frozen=True)
class CheckedLikelihood:
    """ورودی‌های احتمال بعد از بررسی: A و برای هر مسیر B0 و E کنترل‌هایش، همه به صورت Band یا None."""

    a: Band | None
    path_bands: tuple


NO_PATH = "دست‌کم یک مسیر تحقق لازم است (بخش ۱۵)."
A_UNKNOWN = "A نامعلوم است و کران قابل دفاعی ندارد."


def check_likelihood(tables, a, paths, problems):
    """A و مسیرها را بررسی می‌کند. ایرادها به problems می‌رود و نتیجه فقط وقتی معنا دارد که problems خالی باشد."""
    a_band = as_band(a, "A", tables.scale_values["A"], problems)
    path_bands = tuple(check_path(tables, path, number, problems) for number, path in enumerate(paths, 1))
    if not paths:
        problems.append(NO_PATH)
    return CheckedLikelihood(a_band, path_bands)


def likelihood_result(tables, paths, checked, incomplete):
    """B هر مسیر، B سناریو و L از ورودی‌های بررسی‌شده. جزء نامعلوم دلیلش را به incomplete اضافه می‌کند. پیش‌نویس
    ارزیابی هم همین را نشان می‌دهد، حتی وقتی پروفایل پیامدش هنوز کامل نیست."""
    a = checked.a
    if a is None:
        incomplete.append(A_UNKNOWN)

    results = tuple(path_result(tables, path, b0, e_bands) for path, (b0, e_bands) in zip(paths, checked.path_bands))
    # B سناریو بزرگ‌ترین B مسیرهاست؛ کنترل خوب یک مسیر، باز بودن مسیر دیگر را جبران نمی‌کند (بخش ۱۵).
    unknown_paths = [path.name or f"مسیر {number}" for number, path in enumerate(results, 1) if path.b is None]
    b = max_band(
        [path.b for path in results if path.b], unknown=bool(unknown_paths), top=max(tables.scale_values["B0"])
    )
    if b is None and results:
        incomplete.append(f"B0 {'، '.join(unknown_paths)} نامعلوم است؛ نبود اطلاعات مسیر مجوز B0 برابر ۱ نیست.")

    likelihood = None
    if a and b:
        # جدول A × B با بالا رفتن A یا B پایین نمی‌آید (check_version)، پس دو سر بازه از دو گوشه می‌آیند.
        likelihood = Band(tables.likelihood(a.low, b.low), tables.likelihood(a.high, b.high))
    return results, b, likelihood


def check_path(tables, path, number, problems):
    label = path.name or f"مسیر {number}"
    b0 = as_band(path.b0, f"B0 {label}", tables.scale_values["B0"], problems)
    e_bands = []
    for index, control in enumerate(path.controls, 1):
        control_label = f"E کنترل {control.name or index} در {label}"
        if control.e is None:
            # نبود شاهد مجوز کاهش Bc نیست (بخش ۱۵)؛ کنترل بی‌شاهد E1 می‌گیرد، نه «نامعلوم».
            problems.append(f"{control_label} خالی است؛ کنترل بدون شاهد اثربخشی E1 است.")
        e_bands.append(as_band(control.e, control_label, tables.scale_values["E"], problems))
    return b0, e_bands


def path_result(tables, path, b0, e_bands):
    # Bc با بالا رفتن E پایین می‌آید: کمترین Bc از بالاترین E ها و بیشترین Bc از پایین‌ترین E ها.
    bc = Band(
        tables.bc([band.high for band in e_bands], path.independent),
        tables.bc([band.low for band in e_bands], path.independent),
    )
    b = Band(min(b0.low, bc.low), min(b0.high, bc.high)) if b0 else None
    return PathResult(name=path.name, b0=b0, bc=bc, b=b)


def check_impacts(tables, impacts, problems):
    """سطح‌های پیامد را بررسی می‌کند و [(Impact، Band یا None)] برمی‌گرداند."""
    if not impacts:
        problems.append("پروفایل پیامد خالی است.")
        return []
    checked = []
    seen = set()
    for impact in impacts:
        label = f"{impact.dimension} برای {impact.stakeholder}"
        if impact.dimension not in tables.impact_codes:
            problems.append(f"بُعد پیامد «{impact.dimension}» در این نسخه‌ی روش نیست.")
            continue
        if (impact.stakeholder, impact.dimension) in seen:
            problems.append(f"پیامد {label} دو بار آمده است.")
        seen.add((impact.stakeholder, impact.dimension))
        checked.append(
            (impact, as_band(impact.level, f"پیامد {label}", tables.scale_values[impact.dimension], problems))
        )

    known = [band for impact, band in checked if band]
    if known and len(known) == len(checked) and all(band.high == 0 for band in known):
        problems.append(
            "پروفایل پیامد تمام‌صفر نامعتبر است؛ رویداد یا در دامنه‌ی ریسک نیست یا ارزیابی کامل نیست (بخش ۸)."
        )
    return checked


def impact_band(tables, checked, incomplete):
    """I بیشترین سطح معتبر بین ابعاد و ذی‌نفعان است (بخش ۸). سطح نامعلوم با صفر پر نمی‌شود."""
    unknown = [impact for impact, band in checked if band is None]
    top = max(max(tables.scale_values[code]) for code in tables.impact_codes)
    impact = max_band([band for _, band in checked if band], unknown=bool(unknown), top=top)
    if impact is None:
        names = "، ".join(f"{item.dimension} برای {item.stakeholder}" for item in unknown)
        incomplete.append(f"پیامد {names} نامعلوم است و می‌تواند I را بالاتر ببرد.")
        return None
    # امتیاز ۱ تا ۲۵ است (بخش ۱۸)؛ کران پایینی که صفر باشد، یعنی «اثر ندارد»، کمترین سطح امتیازدار حساب می‌شود.
    return Band(max(impact.low, min(LEVELS)), impact.high)
