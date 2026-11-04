import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../api";
import { daysLeft, isDeadline, longDate, shortDate } from "../format";
import type { Day, Deadline, Level, RiskRef } from "../types";

export function useTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} | مدیریت ریسک` : "مدیریت ریسک";
  }, [title]);
}

export function LevelChip({ level, large = false }: { level: Level | null; large?: boolean }) {
  if (!level) return <span className="level-none">ارزیابی نشده</span>;
  return (
    <span
      className={large ? "level level-large" : "level"}
      style={{ background: level.color, color: level.text_color }}
      title={`سطح ریسک: ${level.name}`}
    >
      {level.name}
    </span>
  );
}

/** مهلت با کلمه («۳ روز مانده») و تاریخ کوتاهش زیر آن؛ مهلت گذشته قرمز است. */
export function DeadlineText({ value, label = "مهلت" }: { value: Deadline | Day | null; label?: string }) {
  if (!value) return null;
  if (!isDeadline(value)) {
    return <span className="deadline-date">{longDate(value)}</span>;
  }
  return (
    <span className={value.overdue ? "deadline is-late" : "deadline"}>
      <span className="deadline-words">{daysLeft(value)}</span>
      <span className="deadline-date">
        <span className="visually-hidden">{label}: </span>
        {longDate(value)}
      </span>
    </span>
  );
}

export function ShortDate({ value }: { value: Day | null }) {
  if (!value) return null;
  return <time dateTime={value.iso}>{shortDate(value)}</time>;
}

export function RiskCode({ risk, link = true }: { risk: Pick<RiskRef, "id" | "code">; link?: boolean }) {
  if (!link) return <bdi className="code">{risk.code}</bdi>;
  return (
    <Link className="code" to={`/risks/${risk.id}`}>
      {risk.code}
    </Link>
  );
}

function ClassicIcon() {
  // برگه با پیکان بیرون: این پیوند صفحه‌ی جنگوی همان کار را با بارگذاری کامل باز می‌کند.
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
    </svg>
  );
}

/** پیوند به صفحه‌ای که هنوز فقط در رابط جنگو هست. */
export function ClassicLink({
  href,
  children,
  className = "classic-link",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a href={href} className={className} title="در صفحه‌های فعلی سامانه باز می‌شود">
      {children}
      <ClassicIcon />
    </a>
  );
}

export { ClassicIcon };

export function Loading({ label = "در حال خواندن" }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="visually-hidden">{label}…</span>
      <div className="loading-lines" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export function ErrorNotice({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof ApiError || error instanceof Error ? error.message : "خطای ناشناخته.";
  return (
    <div className="notice notice-error" role="alert">
      <p>{message}</p>
      {retry && (
        <button type="button" className="link-button" onClick={retry}>
          دوباره امتحان کنید
        </button>
      )}
    </div>
  );
}

export function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p className="field-error" id={id}>
      {messages.join(" ")}
    </p>
  );
}
