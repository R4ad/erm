import type { IdentificationScenario, IdentificationValues } from "@/lib/types";

// شباهت متن فرم با سناریوهای کتابخانه برای «سناریوهای مشابه در کتابخانه» (فیگما ۱۱): هم‌پوشانی واژه‌های معنادار
// (ضریب Dice)، با کمی وزن بیشتر برای همان خدمت و همان دسته. فقط راهنمای عضو است؛ پیوند را خود کاربر می‌زند.

const STOP_WORDS = new Set(
  "در به از با که را و یا تا برای این آن است می شود شده یک هر یا بر بی ها های ی را".split(" "),
);

export function words(text: string): Set<string> {
  return new Set(
    text
      .replace(/[‌‏‎]/g, " ")
      .replace(/[ي]/g, "ی")
      .replace(/[ك]/g, "ک")
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 1 && !STOP_WORDS.has(word)),
  );
}

export function similarity(query: Set<string>, text: string): number {
  const other = words(text);
  if (!query.size || !other.size) return 0;
  let shared = 0;
  for (const word of query) if (other.has(word)) shared += 1;
  return (2 * shared) / (query.size + other.size);
}

export interface Match {
  scenario: IdentificationScenario;
  percent: number;
}

/** سه سناریوی شبیه‌تر به متن فرم؛ زیر ۱۵٪ شباهت نشان داده نمی‌شود. */
export function similarScenarios(
  values: IdentificationValues,
  scenarios: IdentificationScenario[],
  serviceId: number | null,
): Match[] {
  const query = words([values.subject, values.objective, values.conditions, values.event, values.harm].join(" "));
  if (query.size < 2) return [];
  return scenarios
    .map((scenario) => {
      let score = similarity(query, scenario.text);
      if (score > 0 && serviceId !== null && scenario.service_id === serviceId) score += 0.15;
      if (score > 0 && values.category && String(scenario.category.id) === values.category) score += 0.1;
      return { scenario, percent: Math.min(99, Math.round(score * 100)) };
    })
    .filter((match) => match.percent >= 15)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 3);
}

/** شاخص‌های «شرط پذیرش ورودی»: هدف، رویداد، دامنه‌ی خدمت و مشتری، مالک و شاهد یا فرض قابل آزمون. */
export function entryChecks(values: IdentificationValues, owner: string | null) {
  const filled = (text: string) => text.trim().length > 0;
  const evidence: "met" | "assumption" | "missing" = values.evidence_items.length
    ? "met"
    : filled(values.evidence)
      ? "assumption"
      : "missing";
  const checks = [
    { key: "objective", label: "هدف یا تعهد مشخص", met: filled(values.objective) },
    { key: "event", label: "رویداد مشخص", met: filled(values.event) },
    { key: "scope", label: "دامنه‌ی خدمت و مشتری", met: Boolean(values.target) && filled(values.customer) },
    { key: "owner", label: owner ? `مالک: ${owner}` : "مالک ریسک", met: Boolean(owner) },
  ];
  return { checks, evidence, met: checks.filter((check) => check.met).length + (evidence === "met" ? 1 : 0) };
}
