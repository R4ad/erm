import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useBlocker } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/states";
import { put } from "@/lib/api";
import type { ResponseDetail } from "@/lib/types";

type Answers = Record<string, string>;
type Node = { key: string; answers: Answers; _sources?: Record<string, { question: string; answer: string }> };
type Path = Node;
type Control = Node & { paths: string[] };
type Consequence = Node & { path: string };
type Evidence = Node & { target: string };
type Event = Node & { paths: Path[]; controls: Control[]; consequences: Consequence[]; evidence: Evidence[] };
type Service = Node & { objectives: Node[]; events: Event[] };
type Q = { id: number; text: string; stage: string; required: boolean; help: string };
function at<T>(items: T[], index: number): T {
  const value = items[index];
  if (!value) throw new Error("بخش پرسشنامه پیدا نشد.");
  return value;
}
const node = (): Node => ({
  key:
    crypto.randomUUID?.() ??
    Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join(""),
  answers: {},
});
const eventNode = (): Event => {
  const path = node();
  return {
    ...node(),
    paths: [path],
    controls: [{ ...node(), paths: [path.key] }],
    consequences: [{ ...node(), path: path.key }],
    evidence: [{ ...node(), target: "event" }],
  };
};
const serviceNode = (): Service => ({ ...node(), objectives: [node()], events: [eventNode()] });

export function StructuredResponse({ response, id }: { response: ResponseDetail; id: string }) {
  const queryClient = useQueryClient();
  const [data, setData] = useState<Service[]>(() =>
    response.structured_data.length
      ? (response.structured_data as Service[])
      : response.can_edit
        ? [serviceNode()]
        : [],
  );
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(() => response.can_edit && response.structured_data.length === 0);
  const editable = response.can_edit;
  const questions = response.structured_questions;
  const save = useMutation({
    mutationFn: (submit: boolean) =>
      put<{ response: ResponseDetail }>(`responses/${id}/`, { structured_data: data, submit }),
    onSuccess: (result) => {
      setError("");
      setDirty(false);
      queryClient.setQueryData(["response", id], result.response);
      void queryClient.invalidateQueries({ queryKey: ["answer-home"] });
    },
    onError: (err) => setError(err.message),
  });
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !save.isPending && currentLocation.pathname !== nextLocation.pathname,
  );
  function change(fn: (draft: Service[]) => void) {
    setData((previous) => {
      const draft = structuredClone(previous);
      fn(draft);
      return draft;
    });
    setDirty(true);
  }
  function fields(
    target: Node,
    stages: string[],
    apply: (draft: Service[], key: string, value: string) => void,
    context?: string,
  ) {
    return questions
      .filter((q: Q) => stages.includes(q.stage))
      .map((q: Q) => (
        <Field
          key={q.id}
          label={
            context && q.stage === "path"
              ? `درباره «${context}» توضیح بدهید: ${!editable ? (target._sources?.[String(q.id)]?.question ?? q.text) : q.text}`
              : !editable
                ? (target._sources?.[String(q.id)]?.question ?? q.text)
                : q.text
          }
          hint={q.help || undefined}
          required={q.required}
        >
          <Textarea
            rows={2}
            value={target.answers[String(q.id)] ?? ""}
            readOnly={!editable}
            onChange={(e) => {
              const value = e.target.value;
              change((draft) => apply(draft, String(q.id), value));
            }}
          />
        </Field>
      ));
  }
  const label = (n: Node, fallback: string) => Object.values(n.answers).find((v) => v.trim()) || fallback;
  return (
    <fieldset disabled={save.isPending} className="flex min-w-0 flex-col gap-5">
      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}
      {data.map((service, si) => (
        <Card key={service.key}>
          <CardHeader title={`خدمت ${si + 1}`} />
          <CardContent className="flex flex-col gap-4">
            {fields(service, ["service", "purpose"], (d, k, v) => {
              at(d, si).answers[k] = v;
            })}
            {service.objectives.map((objective, oi) => (
              <div key={objective.key} className="rounded-lg border border-line p-4 flex flex-col gap-3">
                {fields(objective, ["objective"], (d, k, v) => {
                  at(at(d, si).objectives, oi).answers[k] = v;
                })}
                {editable && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      change((d) => {
                        at(d, si).objectives.splice(oi, 1);
                      })
                    }
                  >
                    حذف انتظار
                  </Button>
                )}
              </div>
            ))}
            {editable && (
              <Button
                variant="secondary"
                onClick={() =>
                  change((d) => {
                    at(d, si).objectives.push(node());
                  })
                }
              >
                افزودن انتظار
              </Button>
            )}
            {service.events.map((event, ei) => (
              <section key={event.key} className="rounded-xl border border-line p-4 flex flex-col gap-4">
                <h3 className="font-semibold">اتفاق {ei + 1}</h3>
                {fields(event, ["event"], (d, k, v) => {
                  at(at(d, si).events, ei).answers[k] = v;
                })}
                {event.paths.map((path, pi) => (
                  <div key={path.key} className="rounded-lg bg-surface p-4 flex flex-col gap-3">
                    <h4 className="font-medium">راه {pi + 1}</h4>
                    {fields(
                      path,
                      ["path", "recovery"],
                      (d, k, v) => {
                        at(at(at(d, si).events, ei).paths, pi).answers[k] = v;
                      },
                      label(event, "این اتفاق"),
                    )}
                    {editable && (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          change((d) => {
                            const e = at(at(d, si).events, ei);
                            e.paths.splice(pi, 1);
                            at(d, si).events.forEach((other) => {
                              other.controls.forEach((c) => {
                                c.paths = c.paths.filter((p) => p !== path.key);
                              });
                            });
                            e.consequences.forEach((c) => {
                              if (c.path === path.key) c.path = "";
                            });
                            e.evidence = e.evidence.filter((ev) => ev.target !== `path:${path.key}`);
                          })
                        }
                      >
                        حذف راه
                      </Button>
                    )}
                  </div>
                ))}
                {editable && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      change((d) => {
                        at(at(d, si).events, ei).paths.push(node());
                      })
                    }
                  >
                    افزودن راه دیگر
                  </Button>
                )}
                {event.controls.map((control, ci) => (
                  <div key={control.key} className="rounded-lg border border-line p-4 flex flex-col gap-3">
                    <h4 className="font-medium">تمهید {ci + 1}</h4>
                    {fields(control, ["control"], (d, k, v) => {
                      at(at(at(d, si).events, ei).controls, ci).answers[k] = v;
                    })}
                    <p>این تمهید کدام راه‌ها را پوشش می‌دهد؟</p>
                    {service.events.flatMap((other, eventIndex) =>
                      other.paths.map((path, pi) => (
                        <label key={path.key} className="flex gap-2">
                          <input
                            type="checkbox"
                            disabled={!editable}
                            checked={control.paths.includes(path.key)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              change((d) => {
                                const c = at(at(at(d, si).events, ei).controls, ci);
                                c.paths = checked ? [...c.paths, path.key] : c.paths.filter((p) => p !== path.key);
                              });
                            }}
                          />
                          {label(other, `اتفاق ${eventIndex + 1}`)}: {label(path, `راه ${pi + 1}`)}
                        </label>
                      )),
                    )}
                    {editable && (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          change((d) => {
                            const e = at(at(d, si).events, ei);
                            e.controls.splice(ci, 1);
                            e.evidence = e.evidence.filter((ev) => ev.target !== `control:${control.key}`);
                          })
                        }
                      >
                        حذف تمهید
                      </Button>
                    )}
                  </div>
                ))}
                {editable && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      change((d) => {
                        at(at(d, si).events, ei).controls.push({ ...node(), paths: [] });
                      })
                    }
                  >
                    افزودن تمهید
                  </Button>
                )}
                {event.consequences.map((consequence, ci) => (
                  <div key={consequence.key} className="rounded-lg border border-line p-4 flex flex-col gap-3">
                    {fields(consequence, ["consequence"], (d, k, v) => {
                      at(at(at(d, si).events, ei).consequences, ci).answers[k] = v;
                    })}
                    <label>
                      راه مرتبط{" "}
                      <select
                        className="form-control"
                        disabled={!editable}
                        value={consequence.path}
                        onChange={(e) => {
                          const value = e.target.value;
                          change((d) => {
                            at(at(at(d, si).events, ei).consequences, ci).path = value;
                          });
                        }}
                      >
                        <option value="">کل اتفاق</option>
                        {event.paths.map((p, i) => (
                          <option key={p.key} value={p.key}>
                            {label(p, `راه ${i + 1}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {editable && (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          change((d) => {
                            const e = at(at(d, si).events, ei);
                            e.consequences.splice(ci, 1);
                            e.evidence = e.evidence.filter((ev) => ev.target !== `consequence:${consequence.key}`);
                          })
                        }
                      >
                        حذف پیامد
                      </Button>
                    )}
                  </div>
                ))}
                {editable && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      change((d) => {
                        at(at(d, si).events, ei).consequences.push({ ...node(), path: "" });
                      })
                    }
                  >
                    افزودن پیامد
                  </Button>
                )}
                {event.evidence.map((evidence, vi) => (
                  <div key={evidence.key} className="rounded-lg border border-line p-4 flex flex-col gap-3">
                    {fields(evidence, ["evidence"], (d, k, v) => {
                      at(at(at(d, si).events, ei).evidence, vi).answers[k] = v;
                    })}
                    <label>
                      شاهد مربوط به{" "}
                      <select
                        className="form-control"
                        disabled={!editable}
                        value={evidence.target}
                        onChange={(e) => {
                          const value = e.target.value;
                          change((d) => {
                            at(at(at(d, si).events, ei).evidence, vi).target = value;
                          });
                        }}
                      >
                        <option value="event">اتفاق</option>
                        {event.paths.map((p, i) => (
                          <option key={p.key} value={`path:${p.key}`}>
                            راه: {label(p, String(i + 1))}
                          </option>
                        ))}
                        {event.controls.map((c, i) => (
                          <option key={c.key} value={`control:${c.key}`}>
                            تمهید: {label(c, String(i + 1))}
                          </option>
                        ))}
                        {event.consequences.map((c, i) => (
                          <option key={c.key} value={`consequence:${c.key}`}>
                            پیامد: {label(c, String(i + 1))}
                          </option>
                        ))}
                      </select>
                    </label>
                    {editable && (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          change((d) => {
                            at(at(d, si).events, ei).evidence.splice(vi, 1);
                          })
                        }
                      >
                        حذف شاهد
                      </Button>
                    )}
                  </div>
                ))}
                {editable && (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        change((d) => {
                          at(at(d, si).events, ei).evidence.push({ ...node(), target: "event" });
                        })
                      }
                    >
                      افزودن شاهد
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        change((d) => {
                          const serviceDraft = at(d, si);
                          const removed = new Set(at(serviceDraft.events, ei).paths.map((path) => path.key));
                          serviceDraft.events.splice(ei, 1);
                          serviceDraft.events.forEach((other) =>
                            other.controls.forEach((control) => {
                              control.paths = control.paths.filter((path) => !removed.has(path));
                            }),
                          );
                        })
                      }
                    >
                      حذف اتفاق
                    </Button>
                  </>
                )}
              </section>
            ))}
            {editable && (
              <>
                <Button
                  variant="secondary"
                  onClick={() =>
                    change((d) => {
                      at(d, si).events.push(eventNode());
                    })
                  }
                >
                  افزودن اتفاق دیگر
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    change((d) => {
                      d.splice(si, 1);
                    })
                  }
                >
                  حذف خدمت
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ))}
      {editable && (
        <>
          <Button
            variant="secondary"
            onClick={() =>
              change((d) => {
                d.push(serviceNode());
              })
            }
          >
            افزودن خدمت
          </Button>
          <div className="flex gap-3">
            <Button variant="secondary" disabled={save.isPending} onClick={() => save.mutate(false)}>
              ذخیره پیش‌نویس
            </Button>
            <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate(true)}>
              ارسال برای بررسی
            </Button>
            <span>{dirty ? "تغییرات ذخیره نشده است" : "ذخیره شده"}</span>
          </div>
        </>
      )}
      <ConfirmDialog
        open={blocker.state === "blocked"}
        onOpenChange={(open) => !open && blocker.reset?.()}
        title="تغییرات ذخیره نشده است"
        description="اگر از این صفحه بروید، تغییرات ذخیره‌نشده از دست می‌رود."
        cancelLabel="ماندن در صفحه"
        confirmLabel="رفتن بدون ذخیره"
        tone="danger"
        onConfirm={() => blocker.proceed?.()}
      />
    </fieldset>
  );
}
