import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, KeyRound, LogIn, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { LogoMark } from "@/components/ui/icon";
import { Alert } from "@/components/ui/states";
import { ApiError, errorMessage, get, post } from "@/lib/api";
import { safeNext } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import { leaveTo, replaceWith } from "@/lib/navigation";
import type { CsrfState } from "@/lib/types";
import { z } from "@/lib/zod";

const schema = z.object({
  username: z.string().trim().min(1, "نام کاربری را وارد کنید."),
  password: z.string().min(1, "گذرواژه را وارد کنید."),
});

type Values = z.infer<typeof schema>;

function failure(error: unknown) {
  // ۴۰۳ پیش از ورود یعنی توکن CSRF صفحه کهنه شده (مثلاً صفحه از دیروز باز مانده بود)؛ توکن تازه گرفته می‌شود.
  if (error instanceof ApiError && error.status === 403)
    return "صفحه‌ی ورود کهنه شده بود و تازه شد. دوباره «ورود» را بزنید.";
  return errorMessage(error);
}

export function LoginPage() {
  useTitle("ورود");
  const [params] = useSearchParams();
  const next = params.get("next") ?? "";
  const [showPassword, setShowPassword] = useState(false);

  const csrf = useQuery({
    queryKey: ["csrf"],
    queryFn: ({ signal }) => get<CsrfState>("auth/csrf/", signal),
    staleTime: 0,
  });
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { username: "", password: "" } });
  const login = useMutation({
    mutationFn: (values: Values) => post<{ next: string }>("auth/login/", { ...values, next }),
    onSuccess: (result) => leaveTo(result.next),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 403) void csrf.refetch();
      form.setValue("password", "");
      form.setFocus("password");
    },
  });

  // کسی که از قبل وارد شده، به جای فرم به همان مقصد می‌رود.
  useEffect(() => {
    if (csrf.data?.authenticated) replaceWith(safeNext(next));
  }, [csrf.data?.authenticated, next]);

  const errors = form.formState.errors;
  const classicLogin = `/accounts/login/?${new URLSearchParams({ classic: "1", ...(next ? { next } : {}) })}`;

  return (
    <div className="relative flex min-h-dvh flex-col">
      {/* شبکه‌ی خطوط و نور پشت فرم؛ فقط تزئین. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]"
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--line)_1px,transparent_1px),linear-gradient(to_bottom,var(--line)_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] opacity-50" />
        <div className="absolute top-[-18rem] left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-accent/25 blur-[120px]" />
      </div>

      <header className="pad-safe relative flex h-16 items-center justify-end pt-[env(safe-area-inset-top)]"></header>

      <main className="pad-safe relative flex flex-1 items-center justify-center pb-16">
        <div className="w-full max-w-[25rem] animate-pop-in">
          <div className="mb-8 flex flex-col items-center gap-4 text-center">
            <LogoMark size={40} />
            <div className="flex flex-col gap-1.5">
              <h1 className="text-h1 font-bold text-ink">ورود به سامانه</h1>
              <p className="text-sm text-ink-2">
                {t("app.name")} · {t("app.tagline")}
              </p>
            </div>
          </div>

          <form
            noValidate
            onSubmit={form.handleSubmit((values) => login.mutate(values))}
            className="flex flex-col gap-5 rounded-2xl border border-line bg-panel/80 p-6 shadow-pop backdrop-blur-xl sm:p-7"
          >
            {login.isError && (
              <Alert tone="danger" role="alert">
                {failure(login.error)}
              </Alert>
            )}
            {csrf.isError && !login.isError && (
              <Alert tone="warning" role="status">
                {errorMessage(csrf.error)}
              </Alert>
            )}

            <Field label="نام کاربری" error={errors.username?.message}>
              <div className="relative">
                <UserRound
                  aria-hidden
                  className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
                />
                <Input
                  {...form.register("username")}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  dir="ltr"
                  className="h-11 text-start ltr:pl-10 rtl:pr-10"
                />
              </div>
            </Field>

            <Field label="گذرواژه" error={errors.password?.message}>
              <div className="relative">
                <KeyRound
                  aria-hidden
                  className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
                />
                <Input
                  {...form.register("password")}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  dir="ltr"
                  className="h-11 text-start ltr:pr-11 ltr:pl-10 rtl:pr-10 rtl:pl-11"
                />
                <button
                  type="button"
                  className="absolute end-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-fg"
                  aria-label={showPassword ? "پنهان کردن گذرواژه" : "نمایش گذرواژه"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((shown) => !shown)}
                >
                  {showPassword ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
                </button>
              </div>
            </Field>

            <Button type="submit" variant="primary" size="lg" loading={login.isPending} disabled={csrf.isPending}>
              {!login.isPending && <LogIn aria-hidden className="rtl:-scale-x-100" />}
              {login.isPending ? "در حال ورود" : "ورود"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted">
            ورود با همان نام کاربری و گذرواژه‌ی سامانه است.{" "}
            <a href={classicLogin} className="text-accent-text underline-offset-4 hover:underline">
              ورود با صفحه‌ی فعلی سامانه
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
