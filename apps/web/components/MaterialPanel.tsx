import { ArrowDownToLine, Search } from "lucide-react";
import type {
  Workspace,
  MaterialResult,
} from "../../../packages/contracts/index";
import { Badge } from "./Badge";
import { numberText } from "../lib/presentation";
type Props = {
  view: "baseline" | "scenario";
  previewReady: boolean;
  workspace: Workspace;
  materialRows: MaterialResult[];
  query: string;
  setQuery: (value: string) => void;
  dirty: boolean;
  exporting: boolean;
  exportMaterials: () => Promise<void>;
};
export function MaterialPanel({
  view,
  previewReady,
  workspace,
  materialRows,
  query,
  setQuery,
  dirty,
  exporting,
  exportMaterials,
}: Props) {
  return (
    <section
      className={`card ${view === "scenario" && !previewReady ? "pending" : ""}`}
    >
      <div className="card-heading">
        <div>
          <h2>Nákupní přehled</h2>
          <p>
            Pozdní dodávka může snížit nákupní deficit, ale nevyřeší termín.
          </p>
        </div>
        <div className="table-tools">
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Hledat materiál"
              placeholder="Najít materiál"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button
            className="secondary"
            disabled={
              exporting || (view === "scenario" && (dirty || !previewReady))
            }
            onClick={() => void exportMaterials()}
          >
            <ArrowDownToLine size={16} />
            {exporting ? "Připravuji export…" : "Export CSV"}
          </button>
        </div>
      </div>
      {view === "scenario" && dirty && (
        <div className="inline-note">
          Pro export nejdřív uložte scénář. Export odpovídá uložené verzi.
        </div>
      )}
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Posuvná tabulka"
      >
        <table>
          <thead>
            <tr>
              <th>Materiál</th>
              <th>Skladem</th>
              <th>Potřeba</th>
              <th>Chybí v termínu</th>
              <th>Pokryto později</th>
              <th>Čistý deficit</th>
            </tr>
          </thead>
          <tbody>
            {materialRows.map((m) => {
              const item = workspace.input.items.find(
                (i) => i.id === m.itemId,
              )!;
              return (
                <tr key={m.itemId}>
                  <td>
                    <strong>{item.name}</strong>
                    <small>
                      {item.code} · {item.unit}
                    </small>
                  </td>
                  <td>{numberText(m.stock)}</td>
                  <td>{numberText(m.demand)}</td>
                  <td className={m.onTimeShortage !== "0" ? "text-danger" : ""}>
                    {numberText(m.onTimeShortage)}
                  </td>
                  <td>{numberText(m.lateCoverage)}</td>
                  <td>
                    {m.unknown ? (
                      <Badge status="unknown" />
                    ) : (
                      <strong
                        className={
                          m.netDeficit !== "0" ? "text-danger" : "text-success"
                        }
                      >
                        {numberText(m.netDeficit)} {item.unit}
                      </strong>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {materialRows.length === 0 && (
        <div className="empty">Žádný materiál neodpovídá hledání.</div>
      )}
      <div className="card-footer">
        Návrh k ruční kontrole. Nevytváří nákupní objednávky a nezohledňuje
        objednací balení.
      </div>
    </section>
  );
}
