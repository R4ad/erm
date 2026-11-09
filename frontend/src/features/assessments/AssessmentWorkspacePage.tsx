import { useMutation, useQuery } from "@tanstack/react-query";
import { ClipboardList, Plus } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LevelBadge } from "@/components/ui/level-badge";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Alert, EmptyState, ErrorState } from "@/components/ui/states";
import { errorMessage, get, post } from "@/lib/api";
import { band, formatNumber } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { Choice, Level, Person } from "@/lib/types";

type Page<T> = { results: T[]; count: number; page: number; pages: number };
type ResultRow = {
  id: number;
  code: string;
  risk: { id: number; code: string; title: string };
  service: string;
  kind: Choice;
  status: Choice;
  likelihood: [number, number] | null;
  impact: [number, number] | null;
  score: [number, number] | null;
  level: Level | null;
  provisional: boolean;
  incomplete: boolean;
  href: string;
};
type Candidate = {
  id: number;
  code: string;
  title: string;
  service: string;
  unit: string;
  category: string;
  owner: Person | null;
  status: Choice;
};

function Pages({ data }: { data: Page<unknown> }) {
  const [params, setParams] = useSearchParams();
  if (data.pages <= 1) return null;
  function go(page: number) {
    const next = new URLSearchParams(params);
    next.set("page", String(page));
    setParams(next);
  }
  return (
    <nav aria-label="صفحه‌بندی" className="flex items-center gap-3">
      <Button variant="secondary" disabled={data.page <= 1} onClick={() => go(data.page - 1)}>
        قبلی
      </Button>
      <span>
        صفحه {formatNumber(data.page)} از {formatNumber(data.pages)}
      </span>
      <Button variant="secondary" disabled={data.page >= data.pages} onClick={() => go(data.page + 1)}>
        بعدی
      </Button>
    </nav>
  );
}

export function AssessmentWorkspacePage() {
  useTitle("ارزیابی ریسک");
  const [params] = useSearchParams();
  const query = useQuery({
    queryKey: ["assessment-workspace", params.get("page")],
    queryFn: ({ signal }) =>
      get<Page<ResultRow> & { can_start: boolean }>(
        `assessments/?page=${encodeURIComponent(params.get("page") ?? "1")}`,
        signal,
      ),
  });
  if (query.isPending) return <PageSkeleton rows={5} />;
  if (query.isError) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  const data = query.data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="ارزیابی ریسک"
        description="نتایج ارزیابی‌ها و پیش‌نویس‌های در حال تکمیل"
        actions={
          data.can_start && (
            <Button asChild variant="primary">
              <Link to="/assessments/new">
                <Plus aria-hidden />
                ارزیابی جدید ریسک
              </Link>
            </Button>
          )
        }
      />
      {data.results.length === 0 ? (
        <EmptyState icon={<ClipboardList />} title="هنوز ارزیابی‌ای ثبت نشده است" />
      ) : (
        <Card className="table-shell table-scroll">
          <table className="data-table">
            <caption className="sr-only">ارزیابی ریسک‌ها</caption>
            <thead>
              <tr>
                <th scope="col">ریسک</th>
                <th scope="col">ارزیابی</th>
                <th scope="col">وضعیت</th>
                <th scope="col">احتمال (L)</th>
                <th scope="col">اثر (I)</th>
                <th scope="col">امتیاز</th>
                <th scope="col">سطح ریسک</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((row) => (
                <tr key={row.id}>
                  <td data-primary>
                    <Link className="font-medium text-fg hover:underline" to={`/risks/${row.risk.id}`}>
                      {row.risk.code} — {row.risk.title}
                    </Link>
                    <div className="text-xs text-muted">{row.service}</div>
                  </td>
                  <td data-label="ارزیابی">
                    <AppLink href={row.href}>{row.code}</AppLink>
                    <div className="text-xs text-muted">{row.kind.label}</div>
                  </td>
                  <td data-label="وضعیت">
                    <Badge>{row.status.label}</Badge>
                    {row.provisional && <div className="text-xs text-muted">نتیجه موقت</div>}
                    {row.incomplete && <div className="text-xs text-warning">ناقص</div>}
                  </td>
                  <td data-label="احتمال (L)">{band(row.likelihood) || "—"}</td>
                  <td data-label="اثر (I)">{band(row.impact) || "—"}</td>
                  <td data-label="امتیاز">{band(row.score) || "—"}</td>
                  <td data-label="سطح ریسک">
                    <LevelBadge level={row.level} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Pages data={data} />
    </div>
  );
}

export function AssessmentCandidatesPage() {
  useTitle("ریسک‌های نیازمند ارزیابی");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["assessment-candidates", params.get("page")],
    queryFn: ({ signal }) =>
      get<Page<Candidate>>(`assessments/candidates/?page=${encodeURIComponent(params.get("page") ?? "1")}`, signal),
  });
  const start = useMutation({
    mutationFn: (id: number) => post<{ id: number }>(`assessments/risks/${id}/start/`, {}),
    onSuccess: (result) => navigate(`/assessments/${result.id}`, { viewTransition: true }),
  });
  if (query.isPending) return <PageSkeleton rows={5} />;
  if (query.isError) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  const data = query.data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="ریسک‌های نیازمند ارزیابی"
        breadcrumb={[{ label: "ارزیابی ریسک", to: "/assessments" }, { label: "ارزیابی جدید" }]}
        description="ریسک‌های ارسال‌شده را برای شروع ارزیابی انتخاب کنید."
      />
      {start.error && (
        <Alert role="alert" tone="danger">
          {errorMessage(start.error)}
        </Alert>
      )}
      {data.results.length === 0 ? (
        <EmptyState icon={<ClipboardList />} title="ریسکی در انتظار ارزیابی نیست" />
      ) : (
        <Card className="table-shell table-scroll">
          <table className="data-table">
            <caption className="sr-only">ریسک‌های ارسالی</caption>
            <thead>
              <tr>
                <th scope="col">ریسک</th>
                <th scope="col">خدمت</th>
                <th scope="col">واحد</th>
                <th scope="col">دسته</th>
                <th scope="col">مالک</th>
                <th scope="col">
                  <span className="sr-only">اقدام</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((risk) => (
                <tr key={risk.id}>
                  <td data-primary>
                    <button
                      type="button"
                      disabled={start.isPending}
                      onClick={() => start.mutate(risk.id)}
                      className="text-start font-medium hover:underline"
                    >
                      {risk.code} — {risk.title}
                    </button>
                  </td>
                  <td data-label="خدمت">{risk.service || "—"}</td>
                  <td data-label="واحد">{risk.unit}</td>
                  <td data-label="دسته">{risk.category}</td>
                  <td data-label="مالک">{risk.owner?.name ?? "—"}</td>
                  <td data-label="اقدام">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={start.isPending}
                      loading={start.isPending && start.variables === risk.id}
                      onClick={() => start.mutate(risk.id)}
                    >
                      شروع ارزیابی
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Pages data={data} />
    </div>
  );
}
