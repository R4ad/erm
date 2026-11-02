"""کار با جدول‌های یک نسخه‌ی روش. موتور محاسبه‌ی قدم ۹ روی همین ساخته می‌شود."""

LEVELS = range(1, 6)  # احتمال و پیامد در جدول‌ها از ۱ تا ۵ است؛ پیامد صفر یعنی «اثر ندارد» و امتیاز ندارد


class MethodTables:
    """جدول‌های یک نسخه در حافظه، تا هر خانه‌ی ماتریس یک پرس‌وجوی جدا به پایگاه داده نزند."""

    def __init__(self, version):
        self.version = version
        self.cells = {(cell.a, cell.b): cell.likelihood for cell in version.likelihood_cells.all()}
        self.levels = list(version.risk_levels.all())  # به ترتیب رتبه، طبق Meta.ordering
        self.floors = list(version.impact_floors.select_related("min_level"))

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
