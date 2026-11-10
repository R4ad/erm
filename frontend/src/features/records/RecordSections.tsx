import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Paperclip, PencilLine, Plus, Send } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import { AppLink } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { bridge, errorMessage, post } from "@/lib/api";
import { dateTime, faText, fileSize, longDate } from "@/lib/format";
import type { FormResult, RecordParts } from "@/lib/types";

// پیوست‌ها و نظرهای هر رکورد (ریسک، شاهد و بعدها بقیه) با همان قاعده‌های صفحه‌ی جنگو: بارگذاری فقط برای کسی که
// اجازه دارد، نظر برای هر کسی که رکورد را می‌بیند و ویرایش نظر فقط برای نویسنده‌اش. خود جنگو همه را دوباره چک می‌کند.

function Prose({ text }: { text: string }) {
  return <p className="text-sm leading-8 whitespace-pre-line text-fg/90">{text}</p>;
}

export function Attachments({ record, as = "h2" }: { record: RecordParts; as?: "h2" | "h3" }) {
  const upload = record.attach_url && (
    <AppLink href={record.attach_url} button={{ variant: "secondary", size: "sm" }}>
      <Plus aria-hidden />
      افزودن پیوست
    </AppLink>
  );
  if (!record.attachments.length) {
    return <EmptyState as={as} icon={<Paperclip />} title="فایلی پیوست نشده است" action={upload} />;
  }
  return (
    <Card className="overflow-clip">
      <CardHeader icon={<Paperclip />} title="پیوست‌ها" as={as} actions={upload} />
      <ul className="divide-y divide-line border-t border-line">
        {record.attachments.map((attachment) => (
          <li key={attachment.id} className="flex items-start gap-3 px-5 py-4">
            <Paperclip aria-hidden className="mt-0.5 size-[1.125rem] shrink-0 text-muted" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {/* دانلود از خود جنگو، با همان چک دسترسی رکورد */}
              <a href={attachment.href} className="font-medium text-fg hover:text-accent-text">
                <bdi>{attachment.name}</bdi>
                <span className="sr-only"> (دانلود)</span>
              </a>
              <p className="flex flex-wrap gap-x-3 text-xs text-muted">
                <span>{fileSize(attachment.size)}</span>
                {attachment.description && <span>{attachment.description}</span>}
                <span>
                  {attachment.by?.name}، {longDate(attachment.at)}
                </span>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Composer({ url }: { url: string }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const id = useId();
  const toast = useToast();
  const queryClient = useQueryClient();
  const send = useMutation({
    mutationFn: (value: string) => post<FormResult>(bridge("forms", url), { values: { text: value } }),
    onSuccess: (result) => {
      setText("");
      toast({ title: faText(result.message) });
      void queryClient.invalidateQueries();
    },
    onError: (failure) => setError(errorMessage(failure)),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) {
      setError("نظر خالی ثبت نمی‌شود.");
      return;
    }
    setError(undefined);
    send.mutate(text);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 border-t border-line px-5 py-4">
      <Field id={id} label="نظر تازه" error={error}>
        <Textarea
          rows={3}
          value={text}
          disabled={send.isPending}
          onChange={(event) => {
            setText(event.target.value);
            if (error) setError(undefined);
          }}
        />
      </Field>
      <div>
        <Button type="submit" variant="secondary" size="sm" loading={send.isPending}>
          {!send.isPending && <Send aria-hidden className="rtl:-scale-x-100" />}
          ثبت نظر
        </Button>
      </div>
    </form>
  );
}

export function Comments({ record, as = "h2" }: { record: RecordParts; as?: "h2" | "h3" }) {
  return (
    <Card className="overflow-clip">
      <CardHeader icon={<MessageSquare />} title="نظرها" as={as} />
      {record.comments.length ? (
        <ul className="divide-y divide-line border-t border-line">
          {record.comments.map((comment) => (
            <li key={comment.id} className="flex gap-3 px-5 py-4">
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface text-xs font-semibold text-muted"
              >
                {comment.by?.name.trim()[0] ?? "؟"}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <p>
                    <span className="font-medium text-fg">{comment.by?.name}</span>، {dateTime(comment.at)}
                    {comment.edited && "، ویرایش‌شده"}
                  </p>
                  {comment.edit_url && (
                    <AppLink href={comment.edit_url} className="inline-flex items-center gap-1 text-xs">
                      <PencilLine aria-hidden className="size-3.5" />
                      ویرایش
                    </AppLink>
                  )}
                </div>
                <Prose text={comment.text} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-line px-5 py-4 text-sm text-muted">هنوز نظری نیست.</p>
      )}
      <Composer url={record.comment_url} />
    </Card>
  );
}
