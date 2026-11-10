import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useForm, useFormState } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Alert, ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError, get, post } from "@/lib/api";
import { useTitle } from "@/lib/hooks";
import type { StartField, StartForm } from "@/lib/types";
import { z } from "@/lib/zod";

const ORDER = ["org_unit", "service", "respondent"];

/** قاعده‌ی هر فیلد از همان فرم جنگو می‌آید (required)؛ سرور دوباره همه را چک می‌کند. */
function schemaFor(fields: Record<string, StartField>) {
  return z.object(
    Object.fromEntries(
      Object.entries(fields).map(([name, field]) => [
        name,
        field.required ? z.string().min(1, `${field.label} را انتخاب کنید.`) : z.string(),
      ]),
    ),
  );
}

function StartFormCard({ id, data }: { id: string; data: StartForm }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const fields = data.fields;
  const form = useForm<Record<string, string>>({
    resolver: zodResolver(schemaFor(fields)),
    defaultValues: Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, field.initial ?? ""])),
  });

  // خطاها درون map خوانده می‌شوند؛ formState تازه‌ی هر رندر مانع می‌شود React Compiler فهرست قبلی را نگه دارد.
  const formState = useFormState({ control: form.control });

  const start = useMutation({
    mutationFn: (values: Record<string, string>) => post<{ id: number }>(`questionnaires/${id}/start/`, values),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["answer-home"] });
      toast({ title: "پاسخ ساخته شد", description: "سؤال‌ها باز است؛ هر وقت خواستید پیش‌نویس را ذخیره کنید." });
      navigate(`/responses/${created.id}`, { viewTransition: true });
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) return;
      for (const [name, messages] of Object.entries(error.errors)) {
        if (name in fields) form.setError(name, { type: "server", message: messages.join(" ") });
      }
    },
  });

  const serverErrors = start.error instanceof ApiError ? start.error.errors : {};
  const general =
    serverErrors.__all__?.join(" ") ??
    (start.isError && !Object.keys(serverErrors).length ? start.error.message : null);

  return (
    <Card className="max-w-3xl p-5 sm:p-7">
      <form noValidate onSubmit={form.handleSubmit((values) => start.mutate(values))} className="flex flex-col gap-6">
        {general && (
          <Alert tone="danger" role="alert">
            {general}
          </Alert>
        )}
        <div className="grid gap-5 md:grid-cols-2">
          {ORDER.map((name) => {
            const field = fields[name];
            if (!field) return null;
            return (
              <Field
                key={name}
                label={field.label}
                hint={field.help || undefined}
                required={field.required}
                error={form.getFieldState(name, formState).error?.message}
                className={name === "respondent" ? "md:col-span-2" : undefined}
              >
                <Select {...form.register(name)}>
                  <option value="">{name === "service" ? "بدون خدمت، کل واحد" : "انتخاب کنید"}</option>
                  {field.choices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </Select>
              </Field>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <Button type="submit" variant="primary" loading={start.isPending}>
            {start.isPending ? "در حال ساختن پاسخ" : "شروع پاسخ"}
            {!start.isPending && <ArrowLeft aria-hidden className="ltr:-scale-x-100" />}
          </Button>
          <Button asChild variant="ghost">
            <Link to="/questionnaires" viewTransition>
              انصراف
            </Link>
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function ResponseStartPage() {
  const { id = "" } = useParams();
  const form = useQuery({
    queryKey: ["start", id],
    queryFn: ({ signal }) => get<StartForm>(`questionnaires/${id}/start/`, signal),
  });
  useTitle(form.data ? `شروع پاسخ ${form.data.questionnaire.title}` : "شروع پاسخ");

  if (form.isPending) return <PageSkeleton rows={3} />;
  if (form.isError) return <ErrorState error={form.error} retry={() => form.refetch()} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "پاسخ به سؤال‌ها", to: "/questionnaires" }, { label: "شروع پاسخ" }]}
        title={form.data.questionnaire.title}
        description="واحد را انتخاب کنید؛ مشخصات خدمت را در مرحله بعد ثبت می‌کنید."
      />
      <StartFormCard id={id} data={form.data} />
    </div>
  );
}
