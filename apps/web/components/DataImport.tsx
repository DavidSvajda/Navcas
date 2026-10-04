import { useRef, useState } from "react";
import type {
  PlanInput,
  PlanResult,
  Workspace,
} from "../../../packages/contracts/index";
import { api } from "../lib/api";
type Candidate = { input: PlanInput; result: PlanResult; version: number };
export function DataImport({
  workspace,
  dirty,
  onImported,
}: {
  workspace: Workspace;
  dirty: boolean;
  onImported: (w: Workspace) => void;
}) {
  const [candidate, setCandidate] = useState<Candidate>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const generation = useRef(0);
  async function inspect(file: File | undefined) {
    const attempt = ++generation.current;
    setCandidate(undefined);
    setError("");
    setConfirmed(false);
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("Soubor je příliš velký. Limit je 2 MB.");
      return;
    }
    setBusy(true);
    try {
      const input = JSON.parse(await file.text()) as PlanInput;
      const response = await api<{ result: PlanResult }>(
        "/api/v1/imports/preview",
        {
          method: "POST",
          body: JSON.stringify({ expectedVersion: workspace.version, input }),
        },
      );
      if (attempt === generation.current)
        setCandidate({
          input,
          result: response.result,
          version: workspace.version,
        });
    } catch (e) {
      if (attempt === generation.current)
        setError(
          e instanceof SyntaxError
            ? "Soubor není platný JSON. Použijte normalizovaný export podle specifikace."
            : (e as Error).message,
        );
    } finally {
      if (attempt === generation.current) setBusy(false);
    }
  }
  async function commit() {
    if (
      !candidate ||
      !confirmed ||
      busy ||
      dirty ||
      candidate.version !== workspace.version
    )
      return;
    setBusy(true);
    setError("");
    try {
      const w = await api<Workspace>("/api/v1/input", {
        method: "PUT",
        body: JSON.stringify({
          expectedVersion: candidate.version,
          input: candidate.input,
        }),
      });
      setCandidate(undefined);
      setConfirmed(false);
      onImported(w);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card import-panel">
      <div className="card-heading">
        <div>
          <h2>Nahrát ověřená data</h2>
          <p>Nejdřív kontrola souboru. Plán se změní až po vašem potvrzení.</p>
        </div>
      </div>
      <div className="import-body">
        <p>
          První verze přijímá normalizovaný JSON: sklad, kusovníky, zbývající
          množství zakázek, rezervace a očekávané příjmy. Běžný export z ERP je
          potřeba převést podle datového formátu. Automatické napojení není
          aktivní.
        </p>
        <label className="import-file">
          Soubor plánu (JSON, nejvýše 2 MB)
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy || workspace.role !== "admin"}
            onChange={(e) => void inspect(e.target.files?.[0])}
          />
        </label>
        {busy && <p role="status">Kontroluji a přepočítávám…</p>}
        {error && (
          <p role="alert" className="import-error">
            {error}
          </p>
        )}
        {candidate && (
          <div className="import-summary">
            <h3>Výsledek kontroly</h3>
            <dl>
              <div>
                <dt>Revize</dt>
                <dd>{candidate.input.revision}</dd>
              </div>
              <div>
                <dt>Zakázky</dt>
                <dd>{candidate.input.orders.length}</dd>
              </div>
              <div>
                <dt>Materiály</dt>
                <dd>{candidate.input.items.length}</dd>
              </div>
              <div>
                <dt>Neověřené zakázky</dt>
                <dd>
                  {
                    candidate.result.orders.filter(
                      (o) => o.status === "unknown",
                    ).length
                  }
                </dd>
              </div>
            </dl>
            {candidate.result.issues.length > 0 && (
              <>
                <p>
                  Výpočet našel {candidate.result.issues.length} upozornění.
                  Import je neodstraní; výsledek je označí jako nejistý.
                </p>
                <ul>
                  {candidate.result.issues.slice(0, 10).map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </>
            )}
            <label className="import-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{" "}
              Potvrzuji zdroj a datum dat. Nový import nahradí aktuální plán a
              vymaže jeho pracovní scénář.
            </label>
            {dirty && (
              <p role="alert">
                Máte rozepsané změny. Nejdřív scénář uložte nebo změny vraťte.
              </p>
            )}
            {candidate.version !== workspace.version && (
              <p role="alert">
                Plán se změnil. Vyberte soubor znovu a zopakujte kontrolu.
              </p>
            )}
            <button
              className="primary"
              disabled={
                !confirmed ||
                busy ||
                dirty ||
                candidate.version !== workspace.version
              }
              onClick={() => void commit()}
            >
              Nahradit plán těmito daty
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
