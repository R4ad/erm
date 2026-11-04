import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { get } from "../api";
import { ErrorNotice, Loading, ShortDate, useTitle } from "../components/bits";
import { fa } from "../format";
import type { AnswerHome as Home, ResponseRow } from "../types";

function ResponseStatus({ row }: { row: ResponseRow }) {
  if (row.is_overdue) return <span className="status is-alert">{row.status.label}، مهلت گذشته</span>;
  if (row.status.value === "returned") return <span className="status is-alert">{row.status.label}</span>;
  return <span className="status">{row.status.label}</span>;
}

export function AnswerHome() {
  useTitle("پاسخ به سؤال‌ها");
  const home = useQuery({ queryKey: ["answer-home"], queryFn: () => get<Home>("questionnaires/") });

  if (home.isPending) return <Loading />;
  if (home.isError) return <ErrorNotice error={home.error} retry={() => home.refetch()} />;
  const data = home.data;

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-head-text">
          <h1>پاسخ به سؤال‌ها</h1>
          <p className="page-lead">
            پرسشنامه‌ی شناسایی ریسک را برای واحد یا خدمت خود پر کنید. جواب‌ها تا ارسال، پیش‌نویس می‌مانند.
          </p>
        </div>
      </header>

      {data.risk_question_count > 0 && (
        <p className="notice notice-stamp">
          {fa(data.risk_question_count)} پرسش ریسک منتظر جواب شماست.{" "}
          <Link to="/questionnaires/risk-questions">جواب دادن به پرسش‌های ریسک</Link>
        </p>
      )}

      <section className="section" aria-labelledby="active">
        <div className="section-head">
          <h2 id="active">پرسشنامه‌های فعال</h2>
          {!data.can_answer && (
            <p className="hint">
              پاسخ تازه را مدیر واحد برای واحدهای خودش و عضو GRC در مصاحبه می‌سازد. شما واحدی برای پاسخ ندارید.
            </p>
          )}
        </div>
        {data.questionnaires.length === 0 ? (
          <div className="sheet empty">
            <h2>پرسشنامه‌ی فعالی نیست</h2>
            <p className="hint">عضو GRC پرسشنامه را بعد از آماده شدن سؤال‌ها فعال می‌کند.</p>
          </div>
        ) : (
          <ul className="ledger sheet">
            {data.questionnaires.map((questionnaire) => (
              <li key={questionnaire.id} className="list-row">
                <div>
                  <h3>{questionnaire.title}</h3>
                  {questionnaire.description && <p className="hint">{questionnaire.description}</p>}
                  <p className="hint">{fa(questionnaire.question_count)} سؤال</p>
                </div>
                {data.can_answer && (
                  <Link className="button button-primary" to={`/questionnaires/${questionnaire.id}/start`}>
                    شروع پاسخ
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="mine">
        <div className="section-head">
          <h2 id="mine">پاسخ‌های من</h2>
          <span className="tally">{fa(data.my_responses.length)}</span>
          <p className="hint">پاسخ‌هایی که داده‌اید یا در مصاحبه ثبت کرده‌اید.</p>
        </div>
        {data.my_responses.length === 0 ? (
          <p className="hint">هنوز پاسخی نداده‌اید.</p>
        ) : (
          <div className="sheet table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">پرسشنامه</th>
                  <th scope="col">وضعیت</th>
                  <th scope="col">پاسخ‌دهنده</th>
                  <th scope="col">آخرین تغییر</th>
                  <th scope="col">
                    <span className="visually-hidden">کار</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.my_responses.map((row) => (
                  <tr key={row.id}>
                    <td className="title-cell">
                      <Link to={`/responses/${row.id}`}>{row.questionnaire}</Link>
                      <span className="cell-sub">
                        {row.org_unit}
                        {row.service && (
                          <>
                            ، خدمت <bdi className="code">{row.service}</bdi>
                          </>
                        )}
                      </span>
                    </td>
                    <td data-label="وضعیت">
                      <ResponseStatus row={row} />
                    </td>
                    <td data-label="پاسخ‌دهنده">
                      {row.respondent?.name}
                      {row.channel.value === "interview" && <span className="cell-sub">مصاحبه</span>}
                    </td>
                    <td data-label="آخرین تغییر">
                      <ShortDate value={row.updated_at} />
                    </td>
                    <td>
                      {row.is_editable && (
                        <Link className="button button-small" to={`/responses/${row.id}`}>
                          ادامه‌ی پاسخ
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
