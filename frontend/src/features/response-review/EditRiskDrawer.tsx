import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Check, Lock, Pencil } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent } from "@/components/ui/drawer";
import { Field, Input, RequiredMark, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { ApiError, errorMessage, get, patch } from "@/lib/api";
import { fa } from "@/lib/format";
import type { DecisionOptions, ResponseReview, ReviewRisk, ReviewRiskChanges, ReviewRiskTexts } from "@/lib/types";

import { AiChip } from "./AiPanel";

// «پنل ویرایش ریسک پیشنهادی» (فریم 12d): کشوی ۵۲۰ پیکسلی از سمت پایان خط (چپ). هر متنی که با پیشنهاد AI فرق دارد
// راهنمای نارنجی «ویرایش‌شده · پیشنهاد AI: «…»» و پیوند «بازگرداندن پیشنهاد AI» می‌گیرد. دسته اختیاری است (تصمیم ۵) و
// مالک ریسک واحد و شخص است (تصمیم ۶)؛ با عوض شدن واحد، شخص پیش‌فرض مدیر همان واحد می‌شود.

type TextKey = Exclude<keyof ReviewRiskTexts, "paths">;

function initial(risk: ReviewRisk): ReviewRiskChanges {
  return {
    title: risk.title,
    initiating_factor: risk.initiating_factor,
    target_event: risk.target_event,
    impact: risk.impact,
    paths: risk.paths.map((path) => ({ number: path.number, text: path.text })),
    category: risk.category?.id ?? null,
    owner_unit: risk.owner_unit?.id ?? null,
    owner: risk.owner?.id ?? null,
  };
}

function EditedHint({ suggestion }: { suggestion: string }) {
  return (
    <span className="flex items-start gap-1 text-tangerine">
      <Pencil aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      {`ویرایش‌شده · پیشنهاد AI: «${suggestion}»`}
    </span>
  );
}

function RevertLink({ onClick, label }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-brand hover:underline"
    >
      <ArrowUp aria-hidden className="size-3.5" />
      بازگرداندن پیشنهاد AI
    </button>
  );
}

const optionalId = (value: string) => (value ? Number(value) : null);

function EditForm({
  data,
  risk,
  onApprove,
  onClose,
}: {
  data: ResponseReview;
  risk: ReviewRisk;
  onApprove: (id: number) => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [values, setValues] = useState(() => initial(risk));
  const suggested = risk.suggested;
  const options = useQuery({
    queryKey: ["decision-options", data.id],
    queryFn: ({ signal }) => get<DecisionOptions>(`questionnaire-responses/${data.id}/decision-options/`, signal),
    staleTime: Infinity,
  });

  const save = useMutation({
    mutationFn: (_: "draft" | "approve") => patch<ReviewRisk>(`pending-risks/${risk.id}/`, values),
    onSuccess: async (_saved, mode) => {
      await queryClient.invalidateQueries({ queryKey: ["response-review", String(data.id)] });
      onClose();
      if (mode === "approve") onApprove(risk.id);
      else toast({ title: "تغییرات ریسک پیشنهادی ذخیره شد.", tone: "success" });
    },
    onError: (error) => {
      if (!(error instanceof ApiError && Object.keys(error.errors).length)) {
        toast({ title: errorMessage(error), tone: "danger" });
      }
    },
  });
  const errors = save.error instanceof ApiError ? save.error.errors : {};

  function set<K extends keyof ReviewRiskChanges>(key: K, value: ReviewRiskChanges[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function setPath(number: number, text: string) {
    set(
      "paths",
      values.paths.map((path) => (path.number === number ? { ...path, text } : path)),
    );
  }

  function textField(key: TextKey, label: string, control: ReactNode, extra?: ReactNode) {
    const original = suggested?.[key];
    const edited = original !== undefined && values[key] !== original;
    const hint =
      edited || extra ? (
        <span className="flex flex-col gap-0.5">
          {edited && <EditedHint suggestion={original} />}
          {extra}
        </span>
      ) : undefined;
    return (
      <Field
        label={label}
        required
        error={errors[key]}
        hint={hint}
        aside={edited ? <RevertLink onClick={() => set(key, original)} /> : undefined}
      >
        {control}
      </Field>
    );
  }

  const units = options.data?.units ?? [];
  const chosenCategory = values.category === risk.category?.id && risk.category_suggested;

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate("approve");
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        {textField(
          "title",
          "عنوان ریسک",
          <Input
            value={values.title}
            maxLength={120}
            onChange={(event) => set("title", event.target.value)}
            className="h-[2.875rem]"
          />,
        )}
        {textField(
          "initiating_factor",
          "عامل آغازگر (شروع رویداد)",
          <Textarea
            rows={2}
            value={values.initiating_factor}
            onChange={(event) => set("initiating_factor", event.target.value)}
            className="min-h-16 resize-none"
          />,
        )}
        <div role="group" aria-labelledby="edit-paths-label" className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p id="edit-paths-label" className="flex items-center gap-1 text-sm font-medium text-ink">
              مسیر تحقق
              <RequiredMark />
            </p>
            <span className="text-xs text-ink-3">{`${fa(values.paths.length)} مسیر به این پیامد می‌رسد`}</span>
          </div>
          <div className="flex flex-col gap-2">
            {values.paths.map((path) => {
              const original = suggested?.paths.find((item) => item.number === path.number)?.text;
              const edited = original !== undefined && path.text !== original;
              const error = errors[`paths.${path.number}`];
              const errorId = `edit-path-${path.number}-error`;
              const hintId = `edit-path-${path.number}-hint`;
              return (
                <div key={path.number} className="flex flex-col gap-1">
                  <div className="relative">
                    <span
                      aria-hidden
                      className="pointer-events-none absolute start-3 top-1/2 inline-flex h-[1.375rem] -translate-y-1/2 items-center rounded-full bg-brand-subtle px-2 text-xs font-medium text-brand"
                    >
                      {`مسیر ${fa(path.number)}`}
                    </span>
                    <Input
                      value={path.text}
                      aria-label={`مسیر تحقق ${fa(path.number)}`}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={[edited && hintId, error && errorId].filter(Boolean).join(" ") || undefined}
                      onChange={(event) => setPath(path.number, event.target.value)}
                      className="h-[2.875rem] ps-[4.75rem]"
                    />
                  </div>
                  {edited && (
                    <p id={hintId} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <EditedHint suggestion={original} />
                      <RevertLink
                        onClick={() => setPath(path.number, original)}
                        label={`بازگرداندن پیشنهاد AI · مسیر تحقق ${fa(path.number)}`}
                      />
                    </p>
                  )}
                  {error && (
                    <p id={errorId} className="text-xs text-danger">
                      {error.join(" ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {textField(
          "target_event",
          "رویداد هدف",
          <Input
            value={values.target_event}
            onChange={(event) => set("target_event", event.target.value)}
            className="h-[2.875rem]"
          />,
        )}
        {textField(
          "impact",
          "پیامد",
          <Textarea
            rows={2}
            value={values.impact}
            onChange={(event) => set("impact", event.target.value)}
            className="min-h-16 resize-none"
          />,
          <span>{`نوع: ${risk.impact_type} · دامنه: ${risk.impact_scope}`}</span>,
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="دسته‌ی ریسک" error={errors.category} aside={chosenCategory ? <AiChip /> : undefined}>
            <Select
              value={values.category ?? ""}
              onChange={(event) => set("category", optionalId(event.target.value))}
              disabled={!options.data}
            >
              <option value="">—</option>
              {(options.data?.categories ?? (risk.category ? [risk.category] : [])).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="مالک ریسک" required error={errors.owner_unit} hint="پیش‌فرض: واحد پاسخ‌دهنده">
            <Select
              value={values.owner_unit ?? ""}
              disabled={!options.data}
              onChange={(event) => {
                const unit = optionalId(event.target.value);
                setValues((current) => ({
                  ...current,
                  owner_unit: unit,
                  owner: units.find((item) => item.id === unit)?.owner ?? null,
                }));
              }}
            >
              {(options.data ? units : risk.owner_unit ? [risk.owner_unit] : []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="مالک ریسک (شخص)" error={errors.owner} hint="اختیاری · پیش‌فرض: مدیر واحد مالک">
          <Select
            value={values.owner ?? ""}
            disabled={!options.data}
            onChange={(event) => set("owner", optionalId(event.target.value))}
          >
            <option value="">—</option>
            {(options.data?.people ?? (risk.owner ? [risk.owner] : [])).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-ink">روش شناسایی</p>
          <p className="flex h-[2.875rem] items-center gap-2 rounded-md border border-line bg-subtle px-3 text-sm text-ink-2">
            <Lock aria-hidden className="size-4 shrink-0 text-ink-3" />
            پاسخنامه · <bdi className="code">{data.code}</bdi>
          </p>
          <p className="text-xs text-ink-3">خودکار ثبت می‌شود</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-6 py-4">
        <DrawerClose asChild>
          <Button variant="ghost">انصراف</Button>
        </DrawerClose>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            loading={save.isPending && save.variables === "draft"}
            disabled={save.isPending}
            onClick={() => save.mutate("draft")}
          >
            ذخیره‌ی پیش‌نویس
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={save.isPending && save.variables === "approve"}
            disabled={save.isPending}
          >
            ذخیره و تأیید
            <Check aria-hidden />
          </Button>
        </div>
      </div>
    </form>
  );
}

export function EditRiskDrawer({
  data,
  risk,
  onOpenChange,
  onApprove,
  returnFocus,
}: {
  data: ResponseReview;
  /** ریسکی که کشو برایش باز است؛ null یعنی کشو بسته است. */
  risk: ReviewRisk | null;
  onOpenChange: (open: boolean) => void;
  onApprove: (id: number) => void;
  returnFocus?: () => HTMLElement | null;
}) {
  return (
    <Drawer open={risk !== null} onOpenChange={onOpenChange}>
      {risk && (
        <DrawerContent
          title="ویرایش ریسک پیشنهادی"
          description="تغییرات شما در تاریخچه‌ی ریسک ثبت می‌شود و مقدار پیشنهادی AI هر زمان قابل بازگردانی است."
          side="end"
          size="panel"
          chip={<AiChip>پیش‌نویس AI</AiChip>}
          returnFocus={returnFocus}
        >
          <EditForm key={risk.id} data={data} risk={risk} onApprove={onApprove} onClose={() => onOpenChange(false)} />
        </DrawerContent>
      )}
    </Drawer>
  );
}
