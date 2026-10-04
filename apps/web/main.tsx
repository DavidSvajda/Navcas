import { OrderList } from "./components/OrderList";
import { OrderDetail } from "./components/OrderDetail";
import { MaterialPanel } from "./components/MaterialPanel";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  Box,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Layers3,
  LayoutDashboard,
  Menu,
  Package,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  X,
} from "lucide-react";
import type {
  PlanResult,
  Scenario,
  Status,
  Workspace,
} from "../../packages/contracts/index";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./styles.css";
import "./audit.css";

import { api, ApiError, loadWorkspace, downloadMaterials } from "./lib/api";
import { brand, type ServiceInfo } from "./lib/brand";
import { DataImport } from "./components/DataImport";
import { labels, dateText, numberText, orderCount } from "./lib/presentation";
import { Badge } from "./components/Badge";
import { LegalDialog, type LegalSection } from "./components/LegalDialog";
import { PilotGuide } from "./components/PilotGuide";
function App() {
  const [serviceInfo, setServiceInfo] = useState<ServiceInfo>();
  const [loginRequired, setLoginRequired] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace>();
  const [draft, setDraft] = useState<Scenario>();
  const [preview, setPreview] = useState<{ key: string; result: PlanResult }>();
  const [tab, setTab] = useState("overview");
  const [view, setView] = useState<"baseline" | "scenario">("baseline");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [menu, setMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [legalSection, setLegalSection] = useState<LegalSection | null>(null);
  useEffect(() => {
    const syncHash = () => {
      const value = location.hash.slice(1);
      setLegalSection(
        ["privacy", "cookies", "terms"].includes(value)
          ? (value as LegalSection)
          : null,
      );
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);
  const closeLegal = () => {
    setLegalSection(null);
    history.replaceState(null, "", location.pathname + location.search);
  };
  const opener = useRef<HTMLElement | null>(null);
  const draftKey = JSON.stringify(draft);
  const dirty = !!workspace && draftKey !== JSON.stringify(workspace.scenario);
  const previewReady = !!preview && preview.key === draftKey;
  async function load(initial = false) {
    setLoading(true);
    setError("");
    try {
      setServiceInfo(await api<ServiceInfo>("/api/v1/service"));
      const data = await loadWorkspace();
      setLoginRequired(false);
      setWorkspace(data);
      if (initial) {
        setDraft(data.scenario);
        setPreview({
          key: JSON.stringify(data.scenario),
          result: data.scenarioResult,
        });
      } else
        setNotice(
          "Aktuální uložená verze načtena. Rozepsaný scénář zůstal zachovaný.",
        );
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setLoginRequired(true);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load(true);
  }, []);
  useEffect(() => {
    if (!draft) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setPreviewError("");
      void api<{ result: PlanResult }>("/api/v1/scenarios/preview", {
        method: "POST",
        body: JSON.stringify(draft),
        signal: controller.signal,
      })
        .then((data) => setPreview({ key: draftKey, result: data.result }))
        .catch((e) => {
          if (!controller.signal.aborted) setPreviewError(e.message);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [draftKey, previewAttempt]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);
  function closeDetail() {
    setSelected(undefined);
    opener.current?.focus();
  }
  function openDetail(id: string) {
    opener.current = document.activeElement as HTMLElement;
    setSelected(id);
  }
  const scenarioPlan = previewReady
    ? preview!.result
    : workspace?.scenarioResult;
  const plan = view === "baseline" ? workspace?.baseline : scenarioPlan;
  const effectiveInput = useMemo(
    () =>
      workspace && {
        ...workspace.input,
        orders: workspace.input.orders.map((o) => ({
          ...o,
          ...draft?.orders.find((x) => x.id === o.id),
        })),
        receipts: workspace.input.receipts.map((r) => ({
          ...r,
          ...draft?.receipts.find((x) => x.id === r.id),
        })),
      },
    [workspace, draftKey],
  );
  const orders = (plan?.orders ?? [])
    .filter((result) => {
      const o = effectiveInput!.orders.find((o) => o.id === result.id)!;
      const product = workspace!.input.products.find(
        (p) => p.id === o.productId,
      );
      const match = `${o.code} ${o.customer} ${product?.name}`
        .toLocaleLowerCase("cs")
        .includes(query.toLocaleLowerCase("cs"));
      return (
        match &&
        (filter === "all" ||
          (filter === "risk" &&
            ["shortage", "unknown"].includes(result.status)) ||
          result.status === filter)
      );
    })
    .sort((a, b) => {
      const rows =
        view === "baseline" ? workspace!.input.orders : effectiveInput!.orders;
      return (
        rows.find((o) => o.id === a.id)!.needDate ?? "9999"
      ).localeCompare(rows.find((o) => o.id === b.id)!.needDate ?? "9999");
    });
  function navigate(next: string) {
    setTab(next);
    setQuery("");
    setFilter("all");
    setMenu(false);
    if (next === "scenarios") setView("scenario");
  }
  function changeOrder(
    id: string,
    fields: Partial<Scenario["orders"][number]>,
  ) {
    if (!workspace || !draft || saving) return;
    const base = workspace.input.orders.find((o) => o.id === id)!;
    const previous = draft.orders.find((o) => o.id === id);
    const changed = {
      id,
      needDate: previous?.needDate ?? base.needDate ?? workspace.input.asOf,
      priority: previous?.priority ?? base.priority,
      ...fields,
    };
    setDraft({
      ...draft,
      orders: [
        ...draft.orders.filter((o) => o.id !== id),
        ...(changed.needDate === base.needDate &&
        changed.priority === base.priority
          ? []
          : [changed]),
      ],
    });
    setNotice("");
  }
  function changeReceipt(id: string, dueDate: string | null) {
    if (!workspace || !draft || saving) return;
    const base = workspace.input.receipts.find((r) => r.id === id)!;
    setDraft({
      ...draft,
      receipts: [
        ...draft.receipts.filter((r) => r.id !== id),
        ...(dueDate === base.dueDate ? [] : [{ id, dueDate }]),
      ],
    });
    setNotice("");
  }
  async function save() {
    if (!workspace || !draft || saving || !dirty || !previewReady) return;
    setSaving(true);
    setError("");
    try {
      const data = await api<Workspace>("/api/v1/scenario", {
        method: "PUT",
        body: JSON.stringify({
          expectedVersion: workspace.version,
          scenario: draft,
        }),
      });
      setWorkspace(data);
      setDraft(data.scenario);
      setPreview({
        key: JSON.stringify(data.scenario),
        result: data.scenarioResult,
      });
      setNotice("Scénář uložen. Výchozí plán zůstal beze změny.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function exportMaterials() {
    if (!workspace || exporting) return;
    setExporting(true);
    setError("");
    try {
      await downloadMaterials(view, workspace.version);
      setNotice(
        "CSV bylo připraveno ke stažení. Odpovídá vybranému uloženému plánu.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  if (!workspace || !draft || !plan || !effectiveInput)
    return (
      <main className="boot">
        <Box size={40} />
        <h1>{brand.name}</h1>
        <p>{brand.descriptor}</p>
        {loginRequired && serviceInfo?.loginUrl ? (
          <>
            <p>
              Přihlaste se účtem, kterému správce udělil přístup do vaší firmy.
            </p>
            <a className="primary" href={serviceInfo.loginUrl}>
              Přihlásit se firemním účtem
            </a>
            {serviceInfo.operator && (
              <p>
                <a href={serviceInfo.operator.privacyUrl}>Soukromí</a> ·{" "}
                <a href={serviceInfo.operator.termsUrl}>Podmínky služby</a>
              </p>
            )}
          </>
        ) : error ? (
          <>
            <p role="alert">{error}</p>
            <button className="primary" onClick={() => void load(true)}>
              Zkusit znovu
            </button>
          </>
        ) : (
          <p>Načítám výrobní plán…</p>
        )}
      </main>
    );
  const counts = (status: Status) =>
    plan.orders.filter((o) => o.status === status).length;
  const materialRows = plan.materials.filter(
    (m) =>
      m.demand !== "0" &&
      `${workspace.input.items.find((i) => i.id === m.itemId)!.name} ${workspace.input.items.find((i) => i.id === m.itemId)!.code}`
        .toLocaleLowerCase("cs")
        .includes(query.toLocaleLowerCase("cs")),
  );
  const currentOrders =
    view === "baseline" ? workspace.input.orders : effectiveInput.orders;
  const detail = plan.orders.find((o) => o.id === selected);
  const detailOrder = currentOrders.find((o) => o.id === selected);
  const title: Record<string, string> = {
    overview: "Výroba pod kontrolou.",
    orders: "Výrobní zakázky",
    materials: "Materiál a nákup",
    scenarios: "Dopad změn na zakázky",
    quality: "Co v evidenci chybí",
    pilot: "Ověření ve vaší firmě",
    data: "Data výrobního plánu",
  };
  const subtitle: Record<string, string> = {
    overview: "Víte, co můžete vyrábět. A co je potřeba vyřešit.",
    orders: "Pokrytí každé zakázky s dohledatelným důvodem.",
    materials: "Rozlišujte problém v termínu od skutečné potřeby dokoupit.",
    scenarios: "Ověřte dopad termínů a priorit bez zásahu do výchozího plánu.",
    quality: "Neúplná evidence se nikdy nesmí tvářit jako dostupný materiál.",
    pilot: "Krátký průchod ukázkou a jasné podmínky pro ověření ve firmě.",
    data: "Nahrajte nový stav evidence a zkontrolujte výsledek před potvrzením.",
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Přejít na obsah
      </a>
      {menu && (
        <button
          className="menu-backdrop"
          aria-label="Zavřít navigaci"
          onClick={() => setMenu(false)}
        />
      )}
      <aside id="main-navigation" className={`sidebar ${menu ? "open" : ""}`}>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
        >
          <span className="brand-symbol">
            <Box size={25} />
          </span>
          <span>
            {brand.name}
            <span className="brand-second brand-descriptor">
              {brand.descriptor}
            </span>
          </span>
        </a>
        <div className="company">
          <div className="company-avatar">M</div>
          <div>
            <strong>{workspace.organizationName ?? "Ukázková výroba"}</strong>
            <small>
              {workspace.mode === "demo"
                ? "Modelová data · jeden sklad"
                : "Firemní materiálový plán"}
            </small>
          </div>
        </div>
        <span className="nav-caption">PRACOVNÍ PROSTOR</span>
        <nav aria-label="Hlavní navigace">
          {[
            ["overview", "Přehled", LayoutDashboard],
            ["orders", "Zakázky", Layers3],
            ["materials", "Materiál", Package],
            ["scenarios", "Scénáře", SlidersHorizontal],
            ["quality", "Kvalita dat", ShieldCheck],
            ["pilot", "Ověření pro vaši firmu", Check],
            ...(workspace.mode === "live" && workspace.role === "admin"
              ? [["data", "Import dat", Package]]
              : []),
          ].map(([id, label, Icon]) => {
            const NavIcon = Icon as typeof Box;
            return (
              <button
                key={id as string}
                className={tab === id ? "active" : ""}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => navigate(id as string)}
              >
                <NavIcon size={19} />
                {label as string}
                {id === "orders" && (
                  <span className="nav-count">
                    {workspace.input.orders.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <div>
            <span className="live-dot" />
            {workspace.mode === "demo"
              ? "Ukázka na modelových datech"
              : "Firemní pracovní prostor"}
          </div>
          <p>
            {workspace.mode === "demo"
              ? "Projděte zakázky a vyzkoušejte změnu termínu dodávky."
              : "Výpočet vychází z posledního potvrzeného importu."}
          </p>
          <span className="version">{workspace.input.revision}</span>
        </div>
        <div className="sidebar-bottom">
          <span className="avatar">V</span>
          <div>
            <strong>
              {workspace.mode === "demo"
                ? "Ukázkový prostor"
                : workspace.role === "admin"
                  ? "Správce firmy"
                  : workspace.role === "planner"
                    ? "Plánovač"
                    : "Pouze čtení"}
            </strong>
            {workspace.mode === "live" ? (
              <button
                onClick={() => {
                  if (
                    !dirty ||
                    window.confirm("Máte neuložené změny. Opravdu se odhlásit?")
                  )
                    void api("/api/v1/logout", { method: "POST" })
                      .then(() => location.reload())
                      .catch((e) => setError(e.message));
                }}
              >
                Odhlásit
              </button>
            ) : (
              <small>Bez připojení k ERP</small>
            )}
          </div>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="Otevřít navigaci"
              aria-expanded={menu}
              aria-controls="main-navigation"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={20} />
            </button>
            <span>Pracovní prostor</span>
            <ChevronRight size={14} />
            <strong>
              {tab === "overview"
                ? "Přehled"
                : tab === "quality"
                  ? "Kvalita dat"
                  : tab === "scenarios"
                    ? "Scénáře"
                    : tab === "orders"
                      ? "Zakázky"
                      : tab === "data"
                        ? "Import dat"
                        : tab === "pilot"
                          ? "Ověření ve firmě"
                          : "Materiál"}
            </strong>
          </div>
          <div className="top-meta">
            <span className="demo-tag">
              {workspace.mode === "demo" ? "DEMO" : "IMPORT"}
            </span>
            <span>
              {workspace.mode === "demo"
                ? "Modelová firma"
                : workspace.organizationName}
            </span>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {error && (
            <div role="alert" className="banner error">
              <CircleAlert size={18} />
              <span>{error}</span>
              <button onClick={() => void load(false)} disabled={loading}>
                Načíst aktuální verzi
              </button>
              <button
                className="icon-button"
                aria-label="Zavřít chybu"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="banner success">
              <Check size={18} />
              <span>{notice}</span>
              <button
                className="icon-button"
                aria-label="Zavřít oznámení"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">MATERIÁLOVÝ PLÁN</div>
              <h1>{title[tab]}</h1>
              <p>{subtitle[tab]}</p>
            </div>
            <button className="secondary" onClick={() => navigate("scenarios")}>
              <SlidersHorizontal size={17} />
              Vyzkoušet scénář
            </button>
          </div>
          <div className="plan-toolbar">
            <div className="segmented" aria-label="Zobrazený plán">
              <button
                className={view === "baseline" ? "chosen" : ""}
                aria-pressed={view === "baseline"}
                onClick={() => setView("baseline")}
              >
                Výchozí plán
              </button>
              <button
                className={view === "scenario" ? "chosen" : ""}
                aria-pressed={view === "scenario"}
                onClick={() => setView("scenario")}
              >
                Pracovní scénář{dirty && <span className="unsaved-dot" />}
              </button>
            </div>
            <div className="plan-date">
              <Clock3 size={15} />
              <span>
                {workspace.mode === "demo" ? "Modelový stav" : "Stav evidence"}{" "}
                k {dateText(workspace.input.asOf)} · do{" "}
                {dateText(workspace.input.horizonEnd)}
              </span>
            </div>
          </div>
          {view === "scenario" && (
            <div className="scenario-strip">
              <SlidersHorizontal size={17} />
              <span>
                <strong>{draft.name || "Scénář"}</strong> ·{" "}
                {dirty ? "neuložené změny" : "uložená verze"} · výchozí plán
                beze změny
              </span>
              {!previewReady && (
                <span role="status">
                  {previewError || "Přepočítávám…"}
                  {previewError && (
                    <button
                      className="secondary"
                      onClick={() => setPreviewAttempt((n) => n + 1)}
                    >
                      Zkusit přepočet znovu
                    </button>
                  )}
                </span>
              )}
            </div>
          )}
          {plan.issues.length > 0 && (
            <div className="banner warning">
              <CircleAlert size={18} />
              <span>
                {plan.issues.length} problémů s daty. Dotčené výsledky jsou
                neověřené.
              </span>
              <button onClick={() => navigate("quality")}>Zkontrolovat</button>
            </div>
          )}
          {(tab === "overview" || tab === "orders") && (
            <>
              <div
                className={`metrics ${view === "scenario" && !previewReady ? "pending" : ""}`}
              >
                {[
                  ["stock", "Pokryto skladem", "Materiál je dostupný", Package],
                  [
                    "incoming",
                    "Závisí na dodávce",
                    "Sledujte termín příjmu",
                    Truck,
                  ],
                  [
                    "shortage",
                    "Chybí materiál",
                    "Vyžaduje vaše rozhodnutí",
                    CircleAlert,
                  ],
                  [
                    "unknown",
                    "Neověřené zakázky",
                    "Nejdřív doplňte evidenci",
                    ShieldCheck,
                  ],
                ].map(([status, label, hint, Icon]) => {
                  const MetricIcon = Icon as typeof Box;
                  return (
                    <button
                      className={`metric metric-${status}`}
                      key={status as string}
                      onClick={() => {
                        setFilter(status as string);
                        if (tab !== "orders") setTab("orders");
                      }}
                    >
                      <div className="metric-top">
                        <span>{label as string}</span>
                        <MetricIcon size={18} />
                      </div>
                      <strong>
                        {counts(status as Status)}
                        <small>{orderCount(counts(status as Status))}</small>
                      </strong>
                      <p>
                        {hint as string}
                        <ArrowRight size={14} />
                      </p>
                    </button>
                  );
                })}
              </div>
              {tab === "overview" && (
                <div className="insight">
                  <span className="insight-icon">
                    <Layers3 size={23} />
                  </span>
                  <div>
                    <strong>
                      {counts("shortage")
                        ? `${counts("shortage")} zakázky potřebují vaši pozornost`
                        : "Plán nemá známý materiálový nedostatek"}
                    </strong>
                    <p>
                      Výsledek vychází ze zásob a termínů. Kapacitu výroby ani
                      spolehlivost dodavatelů nepotvrzuje.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setFilter("risk");
                      setTab("orders");
                    }}
                  >
                    Projít rizika
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
              <section
                className={`card ${view === "scenario" && !previewReady ? "pending" : ""}`}
                aria-busy={view === "scenario" && !previewReady}
              >
                <div className="card-heading">
                  <div>
                    <h2>
                      Zakázky v plánu{" "}
                      <span className="count-pill">{orders.length}</span>
                    </h2>
                    <p>
                      Materiál se přiděluje podle data potřeby, potom priority.
                    </p>
                  </div>
                  <div className="table-tools">
                    <label className="search">
                      <Search size={17} />
                      <input
                        aria-label="Hledat zakázku"
                        placeholder="Najít zakázku nebo zákazníka"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Filtrovat stav zakázky"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">Všechny stavy</option>
                      <option value="risk">Pouze rizika</option>
                      {Object.entries(labels).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <OrderList
                  orders={orders}
                  input={{ ...workspace.input, orders: currentOrders }}
                  openDetail={openDetail}
                />
                {orders.length === 0 && (
                  <div className="empty">
                    <Search size={28} />
                    <strong>Žádné zakázky neodpovídají filtru.</strong>
                    <button
                      className="secondary"
                      onClick={() => {
                        setFilter("all");
                        setQuery("");
                      }}
                    >
                      Zrušit filtry
                    </button>
                  </div>
                )}
                <div className="card-footer">
                  <span>
                    <span className="live-dot" />
                    Výpočet {plan.engineVersion} · {plan.revision}
                  </span>
                  <span>1 sklad · jednoduché kusovníky</span>
                </div>
              </section>
            </>
          )}
          {tab === "materials" && (
            <MaterialPanel
              view={view}
              previewReady={previewReady}
              workspace={workspace}
              materialRows={materialRows}
              query={query}
              setQuery={setQuery}
              dirty={dirty}
              exporting={exporting}
              exportMaterials={exportMaterials}
            />
          )}
          {tab === "scenarios" && (
            <>
              <section className="scenario-summary">
                <div>
                  <span className="eyebrow">DOPAD OPROTI VÝCHOZÍMU PLÁNU</span>
                  <h2>
                    {previewReady
                      ? `${scenarioPlan!.orders.filter((o) => o.status === "shortage").length} zakázky s nedostatkem`
                      : "Přepočítávám scénář…"}
                  </h2>
                  <p>
                    Výchozí plán:{" "}
                    {
                      workspace.baseline.orders.filter(
                        (o) => o.status === "shortage",
                      ).length
                    }{" "}
                    · změněné termíny a priority:{" "}
                    {draft.orders.length + draft.receipts.length}
                  </p>
                </div>
                <div className="scenario-actions">
                  <button
                    className="secondary"
                    disabled={
                      saving || (!draft.orders.length && !draft.receipts.length)
                    }
                    onClick={() => {
                      setDraft({ name: draft.name, orders: [], receipts: [] });
                      setNotice(
                        "Změny scénáře vráceny k výchozím datům. Pro uložení klikněte na Uložit scénář.",
                      );
                    }}
                  >
                    Vrátit změny
                  </button>
                  <button
                    className="primary"
                    disabled={
                      !dirty ||
                      !previewReady ||
                      saving ||
                      !draft.name.trim() ||
                      workspace.role === "viewer"
                    }
                    onClick={() => void save()}
                  >
                    {saving ? "Ukládám…" : "Uložit scénář"}
                    <Check size={17} />
                  </button>
                </div>
              </section>
              <div className="inline-note">
                <ShieldCheck size={16} />
                Simulace neprovádí rezervace ani zápisy do ERP.{" "}
                {workspace.mode === "demo"
                  ? "Ukázkový scénář je dočasný; vypršení relace nebo restart ho znepřístupní."
                  : "Uložený scénář zůstane v pracovním prostoru firmy. Nový import ho nahradí."}
              </div>
              <section className="card scenario-card">
                <div className="card-heading">
                  <div>
                    <h2>Termíny dodávek</h2>
                    <p>
                      Posuňte dodávku a sledujte, kterým zakázkám začne chybět
                      materiál.
                    </p>
                  </div>
                  <label className="scenario-name">
                    Název scénáře
                    <input
                      disabled={saving}
                      maxLength={80}
                      value={draft.name}
                      onChange={(e) =>
                        setDraft({ ...draft, name: e.target.value })
                      }
                    />
                  </label>
                </div>
                <div className="receipt-grid">
                  {effectiveInput.receipts.map((r) => {
                    const item = workspace.input.items.find(
                      (i) => i.id === r.itemId,
                    )!;
                    const original = workspace.input.receipts.find(
                      (x) => x.id === r.id,
                    )!;
                    return (
                      <div
                        className={`receipt-card ${r.dueDate !== original.dueDate ? "modified" : ""}`}
                        key={r.id}
                      >
                        <div className="receipt-heading">
                          <Truck size={19} />
                          <span>{r.code}</span>
                          {r.dueDate !== original.dueDate && (
                            <span className="changed-label">Změněno</span>
                          )}
                        </div>
                        <strong>{item.name}</strong>
                        <p>
                          {r.supplier} · {numberText(r.remaining)} {item.unit}
                        </p>
                        <label>
                          Očekávaný příjem
                          <input
                            disabled={saving}
                            type="date"
                            aria-label={`Termín ${r.code}`}
                            value={r.dueDate ?? ""}
                            onChange={(e) =>
                              changeReceipt(r.id, e.target.value || null)
                            }
                          />
                        </label>
                        <small>
                          Výchozí: {dateText(original.dueDate)} ·{" "}
                          {r.dueDate
                            ? "Očekávaná dodávka není fyzická zásoba."
                            : "Bez data se dodávka do pokrytí nepočítá."}
                        </small>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="card">
                <div className="card-heading">
                  <div>
                    <h2>Termíny a priority zakázek</h2>
                    <p>
                      Vyšší priorita rozhoduje mezi zakázkami se stejným datem
                      potřeby.
                    </p>
                  </div>
                </div>
                <div
                  className="table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Posuvná tabulka"
                >
                  <table>
                    <thead>
                      <tr>
                        <th>Zakázka</th>
                        <th>Datum potřeby</th>
                        <th>Priorita 0–100</th>
                        <th>Výchozí stav</th>
                        <th>Ve scénáři</th>
                        <th>Dopad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {effectiveInput.orders
                        .filter((o) => !o.excludedReason)
                        .map((o) => {
                          const a = workspace.baseline.orders.find(
                            (r) => r.id === o.id,
                          )!;
                          const b = scenarioPlan!.orders.find(
                            (r) => r.id === o.id,
                          )!;
                          return (
                            <tr key={o.id}>
                              <td>
                                <button
                                  className="order-link"
                                  onClick={() => {
                                    setView("scenario");
                                    openDetail(o.id);
                                  }}
                                >
                                  {o.code}
                                </button>
                                <small>{o.customer}</small>
                              </td>
                              <td>
                                <input
                                  disabled={saving}
                                  type="date"
                                  aria-label={`Datum potřeby ${o.code}`}
                                  value={o.needDate ?? ""}
                                  onChange={(e) => {
                                    if (e.target.value)
                                      changeOrder(o.id, {
                                        needDate: e.target.value,
                                      });
                                  }}
                                />
                              </td>
                              <td>
                                <select
                                  disabled={saving}
                                  aria-label={`Priorita ${o.code}`}
                                  value={o.priority}
                                  onChange={(e) =>
                                    changeOrder(o.id, {
                                      priority: Number(e.target.value),
                                    })
                                  }
                                >
                                  {Array.from({ length: 101 }, (_, i) => (
                                    <option key={i} value={i}>
                                      {i}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <Badge status={a.status} />
                              </td>
                              <td>
                                {previewReady ? (
                                  <Badge status={b.status} />
                                ) : (
                                  <span className="muted">Přepočítávám…</span>
                                )}
                              </td>
                              <td>
                                {previewReady && a.status !== b.status ? (
                                  <span className="changed-label">
                                    Změna pokrytí
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {tab === "quality" && (
            <div className="quality-grid">
              <section className="card">
                <div className="card-heading">
                  <div>
                    <h2>Kontrola vstupních dat</h2>
                    <p>Kontroly spuštěné při aktuálním výpočtu.</p>
                  </div>
                  <span className="badge">
                    {plan.issues.length
                      ? "Je potřeba kontrola"
                      : "Kontroly splněny"}
                  </span>
                </div>
                {plan.issues.length ? (
                  <ul className="issue-list">
                    {plan.issues.map((issue, i) => (
                      <li key={i}>
                        <CircleAlert size={18} />
                        {issue}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="quality-ok">
                    <ShieldCheck size={38} />
                    <h3>Podporované vstupy prošly kontrolou.</h3>
                    <p>
                      To potvrzuje strukturu vstupní evidence. Fyzický stav
                      skutečného skladu tím ověřený není.
                    </p>
                  </div>
                )}
              </section>
              <section className="card">
                <div className="card-heading">
                  <div>
                    <h2>Rozsah a vyloučení</h2>
                    <p>Úplnost plánu musí být viditelná.</p>
                  </div>
                </div>
                <div className="quality-content">
                  <dl>
                    <dt>Zdroj</dt>
                    <dd>Syntetická ukázková firma</dd>
                    <dt>Horizont</dt>
                    <dd>5.–31. října 2026</dd>
                    <dt>Podporovaný rozsah</dt>
                    <dd>Jeden sklad, přímé komponenty</dd>
                    <dt>Vyloučené zakázky</dt>
                    <dd>
                      {
                        plan.orders.filter((o) => o.status === "excluded")
                          .length
                      }
                    </dd>
                  </dl>
                  {plan.orders
                    .filter((o) => o.status === "excluded")
                    .map((r) => (
                      <div className="excluded-note" key={r.id}>
                        <strong>
                          {
                            workspace.input.orders.find((o) => o.id === r.id)!
                              .code
                          }
                        </strong>
                        <p>{r.reasons.join(" ")}</p>
                      </div>
                    ))}
                </div>
              </section>
            </div>
          )}
          {tab === "pilot" && (
            <PilotGuide tryScenario={() => navigate("scenarios")} />
          )}
          {workspace.mode === "live" &&
            workspace.input.revision === "empty" && (
              <div className="banner" role="status">
                Zatím nejsou nahraná výrobní data.{" "}
                {workspace.role === "admin" ? (
                  <button onClick={() => navigate("data")}>
                    Nahrát první plán
                  </button>
                ) : (
                  "Požádejte správce firmy o první import."
                )}
              </div>
            )}
          {tab === "data" && (
            <DataImport
              workspace={workspace}
              dirty={dirty}
              onImported={(w) => {
                setWorkspace(w);
                setDraft(w.scenario);
                setPreview({
                  key: JSON.stringify(w.scenario),
                  result: w.scenarioResult,
                });
                setView("baseline");
                setTab("overview");
                setNotice(
                  "Nová data jsou načtená. Zkontrolujte kvalitu evidence před rozhodnutím.",
                );
              }}
            />
          )}
          <footer className="page-footer">
            <span>
              {brand.name} · {brand.descriptor}
            </span>
            <span>
              {workspace.mode === "demo"
                ? "Modelová data · bez připojení k ABRA Flexi"
                : "Potvrzený import · bez zápisů do ERP"}
            </span>
            <nav aria-label="Právní informace">
              <a href={serviceInfo?.operator?.privacyUrl ?? "#privacy"}>
                Soukromí
              </a>
              <a href="#cookies">Cookies</a>
              <a href={serviceInfo?.operator?.termsUrl ?? "#terms"}>
                {workspace.mode === "demo"
                  ? "Podmínky ukázky"
                  : "Podmínky služby"}
              </a>
            </nav>
          </footer>
        </main>
      </div>
      <OrderDetail
        detail={detail}
        detailOrder={detailOrder}
        workspace={workspace}
        view={view}
        previewReady={previewReady}
        previewError={previewError}
        closeDetail={closeDetail}
      />
      <LegalDialog
        section={legalSection}
        close={closeLegal}
        operator={serviceInfo?.operator}
        secureDemo={serviceInfo?.secureDemo}
      />
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  // Waiting workers activate after all windows close; never replace an unsaved editor.
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/sw.js")
      .catch((error) =>
        console.warn("Instalace offline stránky se nepodařila:", error),
      );
  });
}
