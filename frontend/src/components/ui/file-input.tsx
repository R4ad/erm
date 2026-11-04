import { FileText, Upload, X } from "lucide-react";
import { useRef, useState, type ComponentProps, type DragEvent } from "react";

import { cn } from "@/lib/cn";
import { fileSize } from "@/lib/format";

import { Button } from "./button";
import { useFieldControl } from "./field";

interface FileInputProps extends Omit<ComponentProps<"input">, "type" | "value" | "onChange"> {
  value: File | null;
  onChange: (file: File | null) => void;
  /** پسوندهای مجاز، همان accept ورودی فایل (.pdf,.docx). */
  accept?: string;
  maxSize?: number;
}

/**
 * انتخاب یک فایل با کلیک یا کشیدن و رها کردن. خود ورودی فایل بومی است و با Tab فوکوس می‌گیرد؛ کادر رها کردن فقط
 * نمای آن است. نوع و اندازه را فرم (schema.ts) و بعد خود جنگو چک می‌کنند.
 */
export function FileInput({ value, onChange, accept, maxSize, disabled, className, ref, ...props }: FileInputProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const aria = useFieldControl(props);

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = event.dataTransfer.files[0];
    if (file) onChange(file);
  }

  const types = accept
    ?.split(",")
    .map((ext) => ext.trim().replace(/^\./, ""))
    .filter(Boolean)
    .join("، ");

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* کلیک و رها کردن برای موش است؛ صفحه‌کلید و صفحه‌خوان با خود ورودی فایل کار می‌کنند. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        onClick={() => !disabled && input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface/60 px-4 py-6 text-center transition-colors",
          "hover:border-accent-line has-focus-visible:border-accent-line has-focus-visible:ring-4 has-focus-visible:ring-accent-soft",
          dragging && "border-accent bg-accent-soft",
          aria["aria-invalid"] && "border-danger/70",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <span
          aria-hidden
          className="grid size-10 place-items-center rounded-xl border border-line bg-panel text-accent-text"
        >
          <Upload className="size-[1.125rem]" />
        </span>
        <span aria-hidden className="text-sm text-fg">
          فایل را این‌جا رها کنید یا <span className="text-accent-text underline underline-offset-4">انتخاب کنید</span>
        </span>
        {(types || maxSize) && (
          <span aria-hidden className="text-xs text-muted">
            {[types, maxSize ? `حداکثر ${fileSize(maxSize)}` : null].filter(Boolean).join("، ")}
          </span>
        )}
        <input
          ref={(element) => {
            // ref خود کادر (برای کلیک روی ناحیه‌ی رها کردن) و ref بیرونی (فوکوس فرم روی فیلد خطادار) هر دو.
            input.current = element;
            if (typeof ref === "function") ref(element);
            else if (ref) ref.current = element;
          }}
          type="file"
          accept={accept}
          disabled={disabled}
          className="sr-only"
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => {
            onChange(event.target.files?.[0] ?? null);
            event.target.value = ""; // همان فایل را دوباره هم می‌شود انتخاب کرد
          }}
          {...props}
          {...aria}
        />
      </div>
      {value && (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3.5 py-2.5">
          <FileText aria-hidden className="size-[1.125rem] shrink-0 text-accent-text" />
          <div className="flex min-w-0 flex-1 flex-col">
            <bdi className="truncate text-sm text-fg">{value.name}</bdi>
            <span className="text-xs text-muted">{fileSize(value.size)}</span>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            onClick={() => onChange(null)}
            aria-label={`برداشتن ${value.name}`}
          >
            <X aria-hidden />
          </Button>
        </div>
      )}
    </div>
  );
}
