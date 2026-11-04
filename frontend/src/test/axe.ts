import axe from "axe-core";
import { expect } from "vitest";

// axe روی DOM همان صفحه‌ی رندرشده با قاعده‌های WCAG 2.2 AA. تضاد رنگ در jsdom قابل سنجش نیست (CSS بار نمی‌شود)؛
// آن را آزمون‌های Playwright در مرورگر واقعی و هر دو تم می‌سنجند.
export async function expectNoAxeViolations(container: Element = document.body) {
  const result = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  const report = result.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help}\n` + violation.nodes.map((node) => `  ${node.html.slice(0, 160)}`).join("\n"),
  );
  expect(report, report.join("\n\n")).toEqual([]);
}
