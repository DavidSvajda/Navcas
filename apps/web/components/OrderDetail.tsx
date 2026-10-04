import { useRef, useEffect } from "react";
import { X } from "lucide-react";
import type {
  Workspace,
  OrderResult,
  PlanInput,
} from "../../../packages/contracts/index";
import { Badge } from "./Badge";
import { numberText, dateText } from "../lib/presentation";
type Props = {
  detail: OrderResult | undefined;
  detailOrder: PlanInput["orders"][number] | undefined;
  workspace: Workspace;
  view: "baseline" | "scenario";
  previewReady: boolean;
  previewError: string;
  closeDetail: () => void;
};
export function OrderDetail({
  detail,
  detailOrder,
  workspace,
  view,
  previewReady,
  previewError,
  closeDetail,
}: Props) {
  const modalRef = useRef<HTMLDialogElement>(null);
  const modalClose = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (detail) {
      modalRef.current?.showModal();
      modalClose.current?.focus();
    } else modalRef.current?.close();
  }, [detail?.id]);
  return (
    <dialog
      aria-labelledby="detail-title"
      ref={modalRef}
      className="detail-dialog"
      onCancel={(e) => {
        e.preventDefault();
        closeDetail();
      }}
      onClick={(e) => {
        if (e.target === modalRef.current) closeDetail();
      }}
    >
      {detail && detailOrder && (
        <div className="detail-content">
          <div className="detail-heading">
            <div>
              <span className="eyebrow">DETAIL MATERIÁLOVÉHO POKRYTÍ</span>
              <h2 id="detail-title">{detailOrder.code}</h2>
              <p>
                {detailOrder.customer} ·{" "}
                {view === "baseline" ? "Výchozí plán" : "Pracovní scénář"}
              </p>
            </div>
            <button
              ref={modalClose}
              className="icon-button"
              aria-label="Zavřít detail"
              onClick={closeDetail}
            >
              <X />
            </button>
          </div>
          {view === "scenario" && !previewReady ? (
            <p role="status">
              {previewError || "Přepočítávám aktuální změny…"}
            </p>
          ) : (
            <>
              <Badge status={detail.status} />
              <p className="detail-description">
                Potřeba {dateText(detailOrder.needDate)} · zbývá{" "}
                {numberText(detailOrder.remaining)} ks. Vyhrazený materiál se
                odečítá právě jednou.
              </p>
              {detail.reasons.map((reason) => (
                <div className="banner warning" key={reason}>
                  {reason}
                </div>
              ))}
              <div className="component-list">
                {detail.components.map((c) => {
                  const item = workspace.input.items.find(
                    (i) => i.id === c.itemId,
                  )!;
                  return (
                    <article className="component" key={c.itemId}>
                      <div>
                        <strong>{item.name}</strong>
                        <span className="muted">{item.code}</span>
                        <span
                          className={`component-qty ${c.shortage !== "0" ? "text-danger" : "text-success"}`}
                        >
                          {c.shortage !== "0"
                            ? `Chybí ${numberText(c.shortage)}`
                            : "Pokryto"}{" "}
                          {item.unit}
                        </span>
                      </div>
                      <dl>
                        <dt>Potřeba</dt>
                        <dd>
                          {numberText(c.required)} {item.unit}
                        </dd>
                        <dt>Přiděleno ze skladu</dt>
                        <dd>
                          {numberText(c.physical)} {item.unit}
                        </dd>
                        <dt>Včetně včasných dodávek</dt>
                        <dd>
                          {numberText(c.expected)} {item.unit}
                        </dd>
                      </dl>
                      <div className="allocation-sources">
                        <span>Zdroje očekávaného pokrytí:</span>
                        {c.expectedSources.length ? (
                          c.expectedSources.map((s, i) => (
                            <small key={i}>
                              {s.kind === "reserved"
                                ? "Vlastní fyzická rezervace"
                                : s.source}{" "}
                              · {numberText(s.quantity)} {item.unit}
                            </small>
                          ))
                        ) : (
                          <small>Žádné dostupné přidělení.</small>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="inline-note">
                Alokace chrání pořadí i u částečně nepokryté zakázky. Změnu
                ověřte ve scénáři.
              </div>
            </>
          )}
        </div>
      )}
    </dialog>
  );
}
