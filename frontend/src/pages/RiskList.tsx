import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { get } from "../api";
import { ClassicLink, ErrorNotice, LevelChip, Loading, ShortDate, useTitle } from "../components/bits";
import { count, fa } from "../format";
import type { RiskFilters, RiskPage } from "../types";

const MAIN_FILTERS = ["status", "unit", "category"];
const MORE_FILTERS = ["service", "tag", "channel", "needs_completion"];
const FILTER_NAMES = ["q", ...MAIN_FILTERS, ...MORE_FILTERS];

function FilterSelect({
  name,
  filters,
  value,
  onChange,
}: {
  name: string;
  filters: RiskFilters;
  value: string;
  onChange: (name: string, value: string) => void;
}) {
  const filter = filters[name];
  if (!filter) return null;
  const id = `filter-${name}`;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {filter.label}
      </label>
      <select id={id} className="select" value={value} onChange={(event) => onChange(name, event.target.value)}>
        <option value="">همه</option>
        {filter.choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function RiskList() {
  useTitle("رجیستر ریسک");
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const hasMore = MORE_FILTERS.some((name) => params.get(name));
  const [showMore, setShowMore] = useState(hasMore);

  const search = params.toString();
  const filters = useQuery({
    queryKey: ["risk-filters"],
    queryFn: () => get<RiskFilters>("risks/filters/"),
    staleTime: 10 * 60_000,
  });
  const risks = useQuery({
    queryKey: ["risks", search],
    queryFn: () => get<RiskPage>(`risks/${search ? `?${search}` : ""}`),
    placeholderData: keepPreviousData,
  });

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [name, value] of Object.entries(changes)) {
      if (value) next.set(name, value);
      else next.delete(name);
    }
    if (!("page" in changes)) next.delete("page");
    setParams(next);
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    update({ q: query.trim() });
  }

  function clear() {
    setQuery("");
    setParams(new URLSearchParams());
  }

  const filtered = FILTER_NAMES.some((name) => params.get(name));
  const page = risks.data;

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-head-text">
          <h1>رجیستر ریسک</h1>
          {page && (
            <p className="page-lead">
              {filtered ? `${count(page.count, "ریسک")} با این فیلترها` : count(page.count, "ریسک")}
            </p>
          )}
        </div>
        {page?.can_create && (
          <ClassicLink href={page.create_url} className="button button-primary classic-link">
            ثبت ریسک تازه
          </ClassicLink>
        )}
      </header>

      <form className="sheet filters" onSubmit={submitSearch} role="search" aria-label="فیلتر رجیستر">
        <div className="filters-row">
          <div className="field">
            <label className="field-label" htmlFor="filter-q">
              جست‌وجو
            </label>
            <input
              id="filter-q"
              className="input"
              type="search"
              value={query}
              placeholder="کد، عنوان یا شرح"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {filters.data &&
            MAIN_FILTERS.map((name) => (
              <FilterSelect
                key={name}
                name={name}
                filters={filters.data}
                value={params.get(name) ?? ""}
                onChange={(field, value) => update({ [field]: value })}
              />
            ))}
        </div>
        {showMore && filters.data && (
          <div className="filters-more" id="more-filters">
            {MORE_FILTERS.map((name) => (
              <FilterSelect
                key={name}
                name={name}
                filters={filters.data}
                value={params.get(name) ?? ""}
                onChange={(field, value) => update({ [field]: value })}
              />
            ))}
          </div>
        )}
        <div className="filters-foot">
          <div className="actions">
            <button type="submit" className="button button-small">
              جست‌وجو
            </button>
            <button
              type="button"
              className="link-button"
              aria-expanded={showMore}
              aria-controls="more-filters"
              onClick={() => setShowMore((open) => !open)}
            >
              {showMore ? "فیلترهای کمتر" : "خدمت، برچسب، کانال ورود و تکمیل"}
            </button>
          </div>
          {filtered && (
            <button type="button" className="link-button" onClick={clear}>
              پاک کردن فیلترها
            </button>
          )}
        </div>
      </form>

      {risks.isPending && <Loading />}
      {risks.isError && <ErrorNotice error={risks.error} retry={() => risks.refetch()} />}

      {page && page.results.length === 0 && (
        <div className="sheet empty">
          <h2>{filtered ? "ریسکی با این فیلترها پیدا نشد" : "هنوز ریسکی در رجیستر نیست"}</h2>
          <p className="hint">
            {filtered
              ? "فیلترها را کم کنید یا عبارت جست‌وجو را کوتاه‌تر بنویسید."
              : "ریسک‌ها از مصاحبه، پرسشنامه، رخداد و ممیزی وارد رجیستر می‌شوند."}
          </p>
          {filtered && (
            <button type="button" className="button" onClick={clear}>
              پاک کردن فیلترها
            </button>
          )}
        </div>
      )}

      {page && page.results.length > 0 && (
        <div className="sheet table-wrap" aria-busy={risks.isFetching}>
          <table className="table">
            <caption className="visually-hidden">ریسک‌ها، تازه‌ترین بالا</caption>
            <thead>
              <tr>
                <th scope="col">شماره</th>
                <th scope="col">عنوان</th>
                <th scope="col">سطح فعلی</th>
                <th scope="col">وضعیت</th>
                <th scope="col">مالک</th>
                <th scope="col">ثبت</th>
              </tr>
            </thead>
            <tbody>
              {page.results.map((risk) => (
                <tr key={risk.id}>
                  <td data-label="شماره">
                    <bdi className="code">{risk.code}</bdi>
                  </td>
                  <td className="title-cell">
                    <Link to={`/risks/${risk.id}`}>{risk.title}</Link>
                    <span className="cell-sub">
                      {risk.org_unit}
                      {risk.service ? `، خدمت ${risk.service.name}` : ""}
                      {risk.needs_completion ? "، نیازمند تکمیل" : ""}
                    </span>
                  </td>
                  <td data-label="سطح">
                    <LevelChip level={risk.level} />
                  </td>
                  <td data-label="وضعیت">
                    <span className="status">{risk.status.label}</span>
                  </td>
                  <td data-label="مالک">{risk.owner?.name ?? <span className="status">بی‌مالک</span>}</td>
                  <td data-label="ثبت">
                    <ShortDate value={risk.created_at} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {page && page.pages > 1 && (
        <nav className="pager" aria-label="صفحه‌های رجیستر">
          <span>
            صفحه‌ی {fa(page.page)} از {fa(page.pages)}
          </span>
          <div className="actions">
            <button
              type="button"
              className="button button-small"
              disabled={page.page <= 1}
              onClick={() => update({ page: String(page.page - 1) })}
            >
              صفحه‌ی قبل
            </button>
            <button
              type="button"
              className="button button-small"
              disabled={page.page >= page.pages}
              onClick={() => update({ page: String(page.page + 1) })}
            >
              صفحه‌ی بعد
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
