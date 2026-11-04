import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { get } from "../api";
import { ClassicLink, DeadlineText, ErrorNotice, LevelChip, Loading, RiskCode, useTitle } from "../components/bits";
import { fa, faText, longDate } from "../format";
import type { MyWork as MyWorkData, WorkItem, WorkSection } from "../types";

function ItemLabel({ item }: { item: WorkItem }) {
  if (item.route) {
    return (
      <Link className="work-label" to={item.route}>
        {faText(item.label)}
      </Link>
    );
  }
  return (
    <ClassicLink href={item.href} className="work-label classic-link">
      {faText(item.label)}
    </ClassicLink>
  );
}

function Row({ item }: { item: WorkItem }) {
  return (
    <li className={item.level ? "work-row" : "work-row without-level"}>
      <div>
        <ItemLabel item={item} />
        <div className="work-sub">
          {item.risk && (
            <span>
              <RiskCode risk={item.risk} /> {item.risk.title}
            </span>
          )}
          {item.status && <span>{item.status}</span>}
          {item.meta && <span>{faText(item.meta)}</span>}
        </div>
      </div>
      {item.level && <LevelChip level={item.level} />}
      <DeadlineText value={item.due} />
    </li>
  );
}

function Section({ section }: { section: WorkSection }) {
  const headingId = `section-${section.key}`;
  return (
    <section className="section" aria-labelledby={headingId}>
      <div className="section-head">
        <h2 id={headingId}>{section.title}</h2>
        <span className="tally">{fa(section.items.length)}</span>
        {section.hint && <p className="hint">{section.hint}</p>}
      </div>
      <ul className="ledger sheet">
        {section.items.map((item) => (
          <Row key={item.key} item={item} />
        ))}
      </ul>
    </section>
  );
}

/** جمله‌ی خلاصه‌ی بالای صفحه: چند کار، و چندتا مهلتشان گذشته. */
function summary(sections: WorkSection[]) {
  const items = sections.flatMap((section) => section.items);
  const late = items.filter((item) => item.due?.overdue).length;
  const total = `${fa(items.length)} کار منتظر شماست`;
  return late ? `${total}؛ مهلت ${fa(late)} تا گذشته است.` : `${total}.`;
}

export function MyWork() {
  useTitle("کارهای من");
  const work = useQuery({ queryKey: ["my-work"], queryFn: () => get<MyWorkData>("my-work/") });

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-head-text">
          <h1>کارهای من</h1>
          {work.data && work.data.sections.length > 0 && <p className="page-lead">{summary(work.data.sections)}</p>}
        </div>
        {work.data && (
          <p className="today">
            <time dateTime={work.data.today.iso}>
              {work.data.today.weekday} {longDate(work.data.today)}
            </time>
          </p>
        )}
      </header>

      {work.isPending && <Loading />}
      {work.isError && <ErrorNotice error={work.error} retry={() => work.refetch()} />}
      {work.data && work.data.sections.length === 0 && (
        <div className="sheet empty">
          <h2>امروز کاری منتظر شما نیست</h2>
          <p className="hint">
            اقدام، تأیید، امضا یا پرسشی که به شما مربوط باشد این‌جا می‌آید. تا آن موقع می‌توانید رجیستر را ببینید یا به
            پرسشنامه‌ها جواب دهید.
          </p>
          <div className="actions">
            <Link className="button" to="/risks">
              رجیستر ریسک
            </Link>
            <Link className="button" to="/questionnaires">
              پاسخ به سؤال‌ها
            </Link>
          </div>
        </div>
      )}
      {work.data?.sections.map((section) => (
        <Section key={section.key} section={section} />
      ))}
    </div>
  );
}
