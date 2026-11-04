import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { get } from "../api";
import { ClassicLink, DeadlineText, ErrorNotice, LevelChip, Loading, useTitle } from "../components/bits";
import { dateTime, fa, fileSize, longDate } from "../format";
import type { RiskDetail as Risk } from "../types";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === "" || children === false) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}

/** سربرگ نامه: عنوان در شروع خط، بلوک «شماره / تاریخ / پیوست» در پایان خط، و مهر بنفش وضعیت. */
function Letterhead({ risk }: { risk: Risk }) {
  const attachments = risk.attachments.length + risk.evidence.length;
  return (
    <header className="letterhead">
      <div>
        <nav className="crumbs" aria-label="مسیر">
          <Link to="/risks">رجیستر ریسک</Link>
          <span aria-hidden="true">/</span>
          <bdi className="code">{risk.code}</bdi>
        </nav>
        <h1 className="dossier-title">{risk.title}</h1>
        <p className="dossier-sub">
          دسته‌ی {risk.category.name}، واحد {risk.org_unit}، {risk.owner ? `مالک ${risk.owner.name}` : "هنوز بی‌مالک"}
        </p>
      </div>
      <dl className="letter-block">
        <dt>شماره</dt>
        <dd>
          <bdi className="code">{risk.code}</bdi>
        </dd>
        <dt>تاریخ</dt>
        <dd>
          <time dateTime={risk.created_at.iso}>{longDate(risk.created_at)}</time>
        </dd>
        <dt>پیوست</dt>
        <dd>{attachments ? `${fa(attachments)} برگ` : "ندارد"}</dd>
      </dl>
      <p className={risk.is_active ? "stamp" : "stamp is-archived"} aria-label={`وضعیت: ${risk.status.label}`}>
        {risk.status.label}
        {risk.needs_completion && <small>نیازمند تکمیل</small>}
      </p>
    </header>
  );
}

function DossierActions({ risk }: { risk: Risk }) {
  const { transitions } = risk.workflow;
  const extra = [
    { href: risk.actions.edit, label: "ویرایش ریسک" },
    { href: risk.actions.add_assessment, label: "ارزیابی تازه" },
    { href: risk.actions.add_plan, label: "طرح مواجهه‌ی تازه" },
    { href: risk.actions.add_evidence, label: "شاهد تازه" },
  ].filter((action): action is { href: string; label: string } => Boolean(action.href));
  return (
    <div className="dossier-actions">
      {transitions.length > 0 && (
        <div className="actions" aria-label="مرحله‌ی بعد">
          {transitions.map((transition) => (
            <ClassicLink key={transition.name} href={transition.href} className="button button-primary classic-link">
              {transition.label}
            </ClassicLink>
          ))}
        </div>
      )}
      <div className="actions">
        {extra.map((action) => (
          <ClassicLink key={action.label} href={action.href} className="button button-small classic-link">
            {action.label}
          </ClassicLink>
        ))}
        <ClassicLink href={risk.actions.classic} className="button button-small classic-link">
          پرونده در صفحه‌های فعلی
        </ClassicLink>
      </div>
      {risk.workflow.pending_change && (
        <p className="notice notice-stamp">
          درخواست <a href={risk.workflow.pending_change.href}>{risk.workflow.pending_change.label}</a> برای این ریسک
          منتظر تصمیم است.
        </p>
      )}
    </div>
  );
}

function Questions({ risk }: { risk: Risk }) {
  const questions = risk.workflow.questions;
  if (!questions.length) return null;
  return (
    <Block id="questions" title="پرسش‌های ارزیابی">
      <ul className="ledger sheet">
        {questions.map((question, index) => (
          <li key={index} className="question-card">
            <blockquote className="prose">{question.text}</blockquote>
            {question.is_open ? (
              <p className="work-sub">
                <span>پرسش {question.asked_by?.name}</span>
                <DeadlineText value={question.due} label="مهلت جواب" />
              </p>
            ) : (
              <>
                <p className="prose">{question.answer}</p>
                <p className="work-sub">جواب {question.answered_by?.name}</p>
              </>
            )}
          </li>
        ))}
      </ul>
      {questions.some((question) => question.is_open) && (
        <p className="hint">
          مدیر واحد این پرسش‌ها را در <Link to="/questionnaires/risk-questions">پرسش‌های ریسک</Link> جواب می‌دهد.
        </p>
      )}
    </Block>
  );
}

function Timeline({ risk }: { risk: Risk }) {
  const entries = risk.workflow.timeline;
  if (!entries.length) return null;
  return (
    <Block id="timeline" title="گردش کار">
      {/* تازه‌ترین بالاست؛ reversed شماره‌ها را از قدیمی‌ترین (۱) نگه می‌دارد. */}
      <ol className="timeline" reversed>
        {entries.map((entry, index) => (
          <li key={index}>
            از «{entry.from}» به «{entry.to}»{entry.reason && <span className="prose"> {entry.reason}</span>}
            <span className="timeline-meta">
              {entry.by?.name}، {dateTime(entry.at)}
              {entry.meeting_date && `، جلسه‌ی ${longDate(entry.meeting_date)}`}
            </span>
          </li>
        ))}
      </ol>
    </Block>
  );
}

function Assessments({ risk }: { risk: Risk }) {
  if (!risk.assessments.length) return null;
  return (
    <Block id="assessments" title="ارزیابی‌ها">
      <div className="sheet table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">کد</th>
              <th scope="col">نوع</th>
              <th scope="col">وضعیت</th>
              <th scope="col">سطح</th>
              <th scope="col">امتیاز</th>
              <th scope="col">تأیید</th>
            </tr>
          </thead>
          <tbody>
            {risk.assessments.map((assessment) => (
              <tr key={assessment.id}>
                <td data-label="کد">
                  <ClassicLink href={assessment.href}>
                    <bdi className="code">{assessment.code}</bdi>
                  </ClassicLink>
                </td>
                <td data-label="نوع">{assessment.kind.label}</td>
                <td data-label="وضعیت">{assessment.status.label}</td>
                <td data-label="سطح">
                  <LevelChip level={assessment.level} />
                </td>
                <td data-label="امتیاز">
                  {assessment.score ? `${fa(assessment.score[0])} تا ${fa(assessment.score[1])}` : ""}
                </td>
                <td data-label="تأیید">{assessment.approved_at ? longDate(assessment.approved_at) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Block>
  );
}

function Treatment({ risk }: { risk: Risk }) {
  const { current_plan: plan, plan_due: due, acceptances } = risk.treatment;
  if (!plan && !due && !acceptances.length) return null;
  return (
    <Block id="treatment" title="مواجهه">
      {due && !plan && (
        <p className="notice">
          طرح مواجهه هنوز ثبت نشده است. <DeadlineText value={due} label="مهلت ثبت طرح" />
        </p>
      )}
      {plan && (
        <div className="sheet">
          <div className="list-row">
            <div>
              <h3>
                <ClassicLink href={plan.href}>{plan.label}</ClassicLink>
              </h3>
              <p className="hint">
                گزینه‌ی {plan.option}، {plan.owner_approved ? "تأییدشده‌ی مالک ریسک" : "منتظر تأیید مالک ریسک"}
              </p>
            </div>
          </div>
          {plan.actions.length > 0 && (
            <ul className="ledger divided">
              {plan.actions.map((action) => (
                <li key={action.code} className="work-row without-level">
                  <div>
                    <ClassicLink href={action.href} className="work-label classic-link">
                      <bdi className="code">{action.code}</bdi> {action.title}
                    </ClassicLink>
                    <div className="work-sub">{action.status}</div>
                  </div>
                  <DeadlineText value={action.due} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {acceptances.length > 0 && (
        <ul className="ledger sheet">
          {acceptances.map((acceptance) => (
            <li key={acceptance.code} className="work-row">
              <div>
                <ClassicLink href={acceptance.href} className="work-label classic-link">
                  پذیرش {acceptance.code}
                </ClassicLink>
                <div className="work-sub">
                  <span>{acceptance.status}</span>
                  {acceptance.start && acceptance.end && (
                    <span>
                      از {longDate(acceptance.start)} تا {longDate(acceptance.end)}
                    </span>
                  )}
                </div>
              </div>
              <LevelChip level={acceptance.level} />
              <span />
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}

function Evidence({ risk }: { risk: Risk }) {
  if (!risk.evidence.length && !risk.attachments.length) return null;
  return (
    <Block id="evidence" title="شواهد و پیوست‌ها">
      <ul className="ledger sheet">
        {risk.evidence.map((item) => (
          <li key={item.code} className="question-card">
            <ClassicLink href={item.href} className="work-label classic-link">
              {item.title}
            </ClassicLink>
            <p className="work-sub">
              <bdi className="code">{item.code}</bdi>
              <span>{item.kind}</span>
              <span>اعتبار {item.reliability}</span>
              {item.observed_on && <span>مشاهده {longDate(item.observed_on)}</span>}
              {item.expired && <span className="status is-alert">منقضی</span>}
              {item.confidential && <span>محرمانه</span>}
            </p>
          </li>
        ))}
        {risk.attachments.map((attachment) => (
          <li key={attachment.href} className="question-card">
            <a href={attachment.href} className="work-label">
              {attachment.name}
            </a>
            <p className="work-sub">
              <span>{fileSize(attachment.size)}</span>
              {attachment.description && <span>{attachment.description}</span>}
              <span>
                {attachment.by?.name}، {longDate(attachment.at)}
              </span>
            </p>
          </li>
        ))}
      </ul>
    </Block>
  );
}

function Comments({ risk }: { risk: Risk }) {
  if (!risk.comments.length) return null;
  return (
    <Block id="comments" title="یادداشت‌ها">
      <ul className="ledger sheet">
        {risk.comments.map((comment, index) => (
          <li key={index} className="question-card">
            <p className="prose">{comment.text}</p>
            <p className="work-sub">
              {comment.by?.name}، {dateTime(comment.at)}
              {comment.edited && "، ویرایش‌شده"}
            </p>
          </li>
        ))}
      </ul>
    </Block>
  );
}

function Aside({ risk }: { risk: Risk }) {
  return (
    <aside className="aside" aria-label="مشخصات ریسک">
      <section className="section" aria-labelledby="level">
        <h2 id="level">سطح فعلی</h2>
        <div>
          <LevelChip level={risk.level} large />
        </div>
        {risk.score && (
          <p className="hint">
            امتیاز {fa(risk.score[0])} تا {fa(risk.score[1])}، از آخرین ارزیابی جاری تأییدشده
          </p>
        )}
      </section>
      <dl className="facts">
        <Fact label="خدمت">
          {risk.service &&
            (risk.service.href ? (
              <ClassicLink href={risk.service.href}>{risk.service.name}</ClassicLink>
            ) : (
              risk.service.name
            ))}
        </Fact>
        <Fact label="سناریو">
          {risk.scenario && (
            <>
              <ClassicLink href={risk.scenario.href}>{risk.scenario.title}</ClassicLink>
              {risk.scenario.changed && <span className="status is-alert"> نسخه‌ی تازه‌تری دارد</span>}
            </>
          )}
        </Fact>
        <Fact label="کانال ورود">{risk.channel.label}</Fact>
        <Fact label="عامل آغازگر">{risk.initiator && <span className="prose">{risk.initiator}</span>}</Fact>
        <Fact label="دامنه">{risk.scope && <span className="prose">{risk.scope}</span>}</Fact>
        <Fact label="واحد شمارش">{risk.count_unit}</Fact>
        <Fact label="طبقه‌ی اطلاعات">{risk.data_class?.label}</Fact>
        <Fact label="برچسب CIA">{risk.cia}</Fact>
        <Fact label="بانک‌ها">{risk.customers.length > 0 && risk.customers.join("، ")}</Fact>
        <Fact label="برچسب‌ها">
          {risk.tags.length > 0 && (
            <ul className="tags">
              {risk.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          )}
        </Fact>
        <Fact label="کنترل‌ها">
          {risk.controls.length > 0 && (
            <ul className="ledger">
              {risk.controls.map((control) => (
                <li key={control.code}>
                  {control.href ? <ClassicLink href={control.href}>{control.title}</ClassicLink> : control.title}
                </li>
              ))}
            </ul>
          )}
        </Fact>
        <Fact label="پیوندها">
          {risk.links.length > 0 && (
            <ul className="ledger">
              {risk.links.map((link) => (
                <li key={`${link.kind}-${link.ref}`}>
                  {link.kind}:{" "}
                  {link.url ? (
                    <a href={link.url} rel="noreferrer" target="_blank">
                      <bdi>{link.ref}</bdi>
                    </a>
                  ) : (
                    <bdi>{link.ref}</bdi>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Fact>
        <Fact label="آخرین تغییر">{dateTime(risk.updated_at)}</Fact>
      </dl>
    </aside>
  );
}

export function RiskDetail() {
  const { id } = useParams();
  const risk = useQuery({ queryKey: ["risk", id], queryFn: () => get<Risk>(`risks/${id}/`) });
  useTitle(risk.data ? `${risk.data.code} ${risk.data.title}` : "پرونده‌ی ریسک");

  if (risk.isPending) return <Loading />;
  if (risk.isError) {
    return (
      <div className="page">
        <ErrorNotice error={risk.error} retry={() => risk.refetch()} />
        <p>
          <Link to="/risks">برگشت به رجیستر</Link>
        </p>
      </div>
    );
  }

  const data = risk.data;
  return (
    <article className="page">
      <div className="sheet">
        <Letterhead risk={data} />
        <DossierActions risk={data} />
        <div className="dossier-body">
          <div className="dossier-main">
            <Block id="description" title="شرح">
              <p className="prose">{data.description}</p>
              {data.count_exclusions && <p className="hint">موارد خارج از شمارش: {data.count_exclusions}</p>}
            </Block>
            <Questions risk={data} />
            <Timeline risk={data} />
            <Assessments risk={data} />
            <Treatment risk={data} />
            <Evidence risk={data} />
            <Comments risk={data} />
          </div>
          <Aside risk={data} />
        </div>
      </div>
    </article>
  );
}
