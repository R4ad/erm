import { AppLink } from "@/components/ui/app-link";
import { Badge, type Tone } from "@/components/ui/badge";
import { Deadline } from "@/components/ui/deadline";
import { LevelBadge } from "@/components/ui/level-badge";
import { shortDate } from "@/lib/format";
import type { AcceptanceRow, AcceptanceState, ActionRow, ActionStatus } from "@/lib/types";

// جدول اقدام‌ها و پذیرش‌ها (actions/includes/action_table.html و acceptance_table.html) و نشان وضعیتشان، در فهرست‌ها،
// پرونده‌ی طرح مواجهه و هر جای دیگری که اقدام یا پذیرش ریسک فهرست می‌شود.

const ACTION_TONES: Record<string, Tone> = {
  verified: "success",
  blocked: "danger",
  failed: "danger",
  ready: "warning",
  in_progress: "accent",
  approved: "info",
};

/** وضعیت اقدام و، اگر سررسید گذشته و نتیجه تأیید نشده، نشان «عقب‌افتاده». */
export function ActionStatusBadge({ status }: { status: ActionStatus }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge tone={ACTION_TONES[status.value] ?? "neutral"} dot>
        {status.label}
      </Badge>
      {status.overdue && <Badge tone="danger">عقب‌افتاده</Badge>}
    </span>
  );
}

const ACCEPTANCE_TONES: Record<string, Tone> = {
  expired: "danger",
  active: "success",
  pending: "warning",
};

export function AcceptanceStateBadge({ state }: { state: AcceptanceState }) {
  return (
    <Badge tone={ACCEPTANCE_TONES[state.value] ?? "neutral"} dot>
      {state.label}
    </Badge>
  );
}

export function ActionTable({
  actions,
  caption,
  showRisk = false,
}: {
  actions: ActionRow[];
  caption: string;
  showRisk?: boolean;
}) {
  return (
    <table className="data-table">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">کد</th>
          <th scope="col">عنوان</th>
          {showRisk && <th scope="col">ریسک</th>}
          <th scope="col">سازوکار</th>
          <th scope="col">مالک و مجری</th>
          <th scope="col">سررسید</th>
          <th scope="col">وضعیت</th>
        </tr>
      </thead>
      <tbody>
        {actions.map((action) => (
          <tr key={action.id}>
            <td data-label="کد" className="w-0">
              <bdi className="code text-accent-text">{action.code}</bdi>
            </td>
            <td data-primary className="min-w-56">
              <AppLink href={action.href} className="font-medium text-fg hover:text-accent-text hover:no-underline">
                {action.title}
              </AppLink>
            </td>
            {showRisk && (
              <td data-label="ریسک" className="whitespace-nowrap">
                <bdi className="code text-xs">{action.risk}</bdi>
              </td>
            )}
            <td data-label="سازوکار" className="text-xs">
              {action.mechanism}
              {action.dimension && <span className="text-muted"> ({action.dimension})</span>}
            </td>
            <td data-label="مالک و مجری" className="text-xs">
              <span className="block text-fg">{action.owner?.name}</span>
              <span className="block text-muted">{action.assignee?.name}</span>
            </td>
            <td data-label="سررسید">
              <Deadline value={action.due} label="سررسید" />
            </td>
            <td data-label="وضعیت">
              <ActionStatusBadge status={action.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AcceptanceTable({
  acceptances,
  caption,
  showRisk = false,
}: {
  acceptances: AcceptanceRow[];
  caption: string;
  showRisk?: boolean;
}) {
  return (
    <table className="data-table">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">کد</th>
          {showRisk && <th scope="col">ریسک</th>}
          <th scope="col">ارزیابی</th>
          <th scope="col">سطح</th>
          <th scope="col">اعتبار</th>
          <th scope="col">مسئول پیگیری</th>
          <th scope="col">وضعیت</th>
        </tr>
      </thead>
      <tbody>
        {acceptances.map((acceptance) => (
          <tr key={acceptance.id}>
            <td data-primary className="w-0 whitespace-nowrap">
              <AppLink href={acceptance.href} className="font-medium hover:no-underline">
                پذیرش <bdi className="code">{acceptance.code}</bdi>
              </AppLink>
            </td>
            {showRisk && (
              <td data-label="ریسک" className="whitespace-nowrap">
                {acceptance.risk && (
                  <AppLink href={acceptance.risk.href} className="code text-xs">
                    {acceptance.risk.code}
                  </AppLink>
                )}
              </td>
            )}
            <td data-label="ارزیابی" className="whitespace-nowrap">
              <bdi className="code text-xs">{acceptance.assessment}</bdi>
            </td>
            <td data-label="سطح">
              <LevelBadge level={acceptance.level} />
            </td>
            <td data-label="اعتبار" className="text-xs whitespace-nowrap">
              <time dateTime={acceptance.start.iso}>{shortDate(acceptance.start)}</time> تا{" "}
              <time dateTime={acceptance.end.iso}>{shortDate(acceptance.end)}</time>
            </td>
            <td data-label="مسئول پیگیری" className="text-xs">
              {acceptance.follow_up_by?.name}
            </td>
            <td data-label="وضعیت">
              <AcceptanceStateBadge state={acceptance.state} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
