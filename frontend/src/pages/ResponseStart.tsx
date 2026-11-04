import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError, get, post } from "../api";
import { ErrorNotice, FieldError, Loading, useTitle } from "../components/bits";
import type { StartForm } from "../types";

const ORDER = ["org_unit", "service", "respondent"];

export function ResponseStart() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useQuery({ queryKey: ["start", id], queryFn: () => get<StartForm>(`questionnaires/${id}/start/`) });
  const [values, setValues] = useState<Record<string, string>>({});
  useTitle(form.data ? `شروع پاسخ ${form.data.questionnaire.title}` : "شروع پاسخ");

  const start = useMutation({
    mutationFn: (data: Record<string, string>) => post<{ id: number }>(`questionnaires/${id}/start/`, data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["answer-home"] });
      navigate(`/responses/${created.id}`);
    },
  });

  if (form.isPending) return <Loading />;
  if (form.isError) return <ErrorNotice error={form.error} retry={() => form.refetch()} />;

  const fields = form.data.fields;
  const value = (name: string) => values[name] ?? fields[name]?.initial ?? "";
  const errors = start.error instanceof ApiError ? start.error.errors : {};

  function submit(event: FormEvent) {
    event.preventDefault();
    const data: Record<string, string> = {};
    for (const name of Object.keys(fields)) data[name] = value(name);
    start.mutate(data);
  }

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-head-text">
          <nav className="crumbs" aria-label="مسیر">
            <Link to="/questionnaires">پاسخ به سؤال‌ها</Link>
          </nav>
          <h1>{form.data.questionnaire.title}</h1>
          <p className="page-lead">اول بگویید پاسخ برای کدام واحد و خدمت است. بعد سؤال‌ها باز می‌شود.</p>
        </div>
      </header>

      <form className="sheet form-sheet" onSubmit={submit} noValidate>
        {errors.__all__ && (
          <p className="notice notice-error" role="alert">
            {errors.__all__.join(" ")}
          </p>
        )}
        {start.isError && !(start.error instanceof ApiError && Object.keys(errors).length) && (
          <ErrorNotice error={start.error} />
        )}
        <div className="start-grid">
          {ORDER.filter((name) => fields[name]).map((name) => {
            const field = fields[name];
            const id = `start-${name}`;
            const describedBy = [field.help && `${id}-help`, errors[name] && `${id}-error`].filter(Boolean).join(" ");
            return (
              <div className="field" key={name}>
                <label className="field-label" htmlFor={id}>
                  {field.label}
                  {field.required && <span className="required">اجباری</span>}
                </label>
                <select
                  id={id}
                  className="select"
                  value={value(name)}
                  required={field.required}
                  aria-invalid={errors[name] ? true : undefined}
                  aria-describedby={describedBy || undefined}
                  onChange={(event) => setValues({ ...values, [name]: event.target.value })}
                >
                  <option value="">{name === "service" ? "بدون خدمت، کل واحد" : "انتخاب کنید"}</option>
                  {field.choices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
                {field.help && (
                  <p className="field-help" id={`${id}-help`}>
                    {field.help}
                  </p>
                )}
                <FieldError id={`${id}-error`} messages={errors[name]} />
              </div>
            );
          })}
        </div>
        <div className="actions">
          <button type="submit" className="button button-primary" disabled={start.isPending}>
            {start.isPending ? "در حال ساختن پاسخ" : "شروع پاسخ"}
          </button>
          <Link className="button" to="/questionnaires">
            انصراف
          </Link>
        </div>
      </form>
    </div>
  );
}
