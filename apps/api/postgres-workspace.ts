import { createHash, randomBytes } from "node:crypto";
import type { Database, Sql } from "./database.js";
import type { WorkspaceBackend } from "./workspace-backend.js";
import type {
  PlanInput,
  Scenario,
  Workspace,
} from "../../packages/contracts/index.js";
import { calculatePlan, applyScenario } from "../../packages/domain/engine.js";
import { HttpError } from "./errors.js";
import { SESSION_TTL_MS } from "./workspace-service.js";
import type { Calculator } from "./calculator.js";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
type Actor = {
  organization_id: string;
  name: string;
  role: "viewer" | "planner" | "admin";
  subject: string;
  csrf: string;
  expires_at: Date | string;
};
export function emptyInput(): PlanInput {
  const today = new Date().toISOString().slice(0, 10);
  return {
    revision: "empty",
    asOf: today,
    horizonEnd: today,
    items: [],
    products: [],
    stock: [],
    reservations: [],
    orders: [],
    receipts: [],
  };
}
const blankScenario = () => ({
  name: "Pracovní scénář",
  orders: [],
  receipts: [],
});
export class PostgresWorkspace implements WorkspaceBackend {
  constructor(
    readonly db: Database,
    readonly calculate: Calculator = async (input, scenario) =>
      calculatePlan(scenario ? applyScenario(input, scenario) : input),
  ) {}
  create(): never {
    throw new HttpError(401, "LOGIN_REQUIRED", "Přihlaste se firemním účtem.");
  }
  async authenticate(issuer: string, subject: string) {
    const token = randomBytes(32).toString("base64url");
    const result = await this.db.query(
      `INSERT INTO sessions(token_hash,issuer,subject,csrf,expires_at)
      SELECT $1,issuer,subject,$4,now()+interval '2 hours' FROM memberships WHERE issuer=$2 AND subject=$3 AND active RETURNING token_hash`,
      [hash(token), issuer, subject, randomBytes(32).toString("hex")],
    );
    if (!result.rows.length)
      throw new HttpError(
        403,
        "NOT_INVITED",
        "Tento účet nemá přístup. Požádejte správce firmy o pozvánku.",
      );
    return token;
  }
  private async actor(sql: Sql, token: string): Promise<Actor> {
    const { rows } = await sql.query<Actor>(
      `SELECT m.organization_id,o.name,m.role,m.subject,s.csrf,s.expires_at FROM sessions s
      JOIN memberships m USING(issuer,subject) JOIN organizations o ON o.id=m.organization_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND m.active`,
      [hash(token)],
    );
    if (!rows[0])
      throw new HttpError(
        401,
        "LOGIN_REQUIRED",
        "Relace vypršela. Přihlaste se znovu.",
      );
    return rows[0];
  }
  async has(id: unknown) {
    if (typeof id !== "string") return false;
    try {
      await this.actor(this.db, id);
      return true;
    } catch (e) {
      if (e instanceof HttpError && e.statusCode === 401) return false;
      throw e;
    }
  }
  async csrf(id: string) {
    return (await this.actor(this.db, id)).csrf;
  }
  private async tenant<T>(
    id: string,
    fn: (sql: Sql, actor: Actor) => Promise<T>,
  ) {
    return this.db.transaction(async (sql) => {
      const actor = await this.actor(sql, id);
      await sql.query("SELECT set_config('app.tenant',$1,true)", [
        actor.organization_id,
      ]);
      return fn(sql, actor);
    });
  }
  private async workspace(sql: Sql, actor: Actor): Promise<Workspace> {
    const { rows } = await sql.query(
      "SELECT * FROM workspaces WHERE organization_id=$1",
      [actor.organization_id],
    );
    const w = rows[0];
    if (!w)
      throw new HttpError(
        503,
        "WORKSPACE_NOT_READY",
        "Pracovní prostor ještě není připravený. Kontaktujte správce.",
      );
    return {
      csrfToken: actor.csrf,
      sessionExpiresAt: new Date(actor.expires_at).toISOString(),
      input: w.input,
      baseline: w.baseline,
      scenario: w.scenario,
      scenarioResult: w.result,
      version: w.version,
      savedAt: w.saved_at ? new Date(w.saved_at).toISOString() : null,
      mode: "live",
      organizationName: actor.name,
      role: actor.role,
      importedAt: w.imported_at ? new Date(w.imported_at).toISOString() : null,
    };
  }
  read(id: string) {
    return this.tenant(id, (sql, actor) => this.workspace(sql, actor));
  }
  async preview(id: string, scenario: Scenario) {
    const workspace = await this.read(id);
    return this.calculate(workspace.input, scenario);
  }
  async save(id: string, version: number, scenario: Scenario) {
    const initial = await this.read(id);
    if (initial.role === "viewer")
      throw new HttpError(403, "READ_ONLY", "Máte přístup pouze ke čtení.");
    if (initial.version !== version)
      throw new HttpError(
        409,
        "VERSION_CONFLICT",
        "Plán se změnil. Načtěte aktuální verzi.",
      );
    const result = await this.calculate(initial.input, scenario);
    return this.tenant(id, async (sql, actor) => {
      if (actor.role === "viewer")
        throw new HttpError(403, "READ_ONLY", "Máte přístup pouze ke čtení.");
      await sql.query(
        "SELECT organization_id FROM workspaces WHERE organization_id=$1 FOR UPDATE",
        [actor.organization_id],
      );
      const w = await this.workspace(sql, actor);
      if (w.version !== version)
        throw new HttpError(
          409,
          "VERSION_CONFLICT",
          "Plán se změnil. Načtěte aktuální verzi; rozepsané změny zůstanou zachované.",
        );
      await sql.query(
        "UPDATE workspaces SET scenario=$2,result=$3,version=version+1,saved_at=now() WHERE organization_id=$1",
        [
          actor.organization_id,
          JSON.stringify(scenario),
          JSON.stringify(result),
        ],
      );
      await this.audit(sql, actor, "scenario.saved", version + 1);
      return this.workspace(sql, actor);
    });
  }
  async import(id: string, version: number, input: PlanInput) {
    const initial = await this.read(id);
    if (initial.role !== "admin")
      throw new HttpError(
        403,
        "ADMIN_REQUIRED",
        "Data může nahrát pouze správce firmy.",
      );
    if (initial.version !== version)
      throw new HttpError(
        409,
        "VERSION_CONFLICT",
        "Plán se změnil. Zkontrolujte import proti aktuálnímu plánu.",
      );
    let result;
    try {
      result = await this.calculate(input);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        400,
        "INVALID_PLAN",
        "Vstupní plán má neplatné vazby nebo duplicitní identifikátory.",
      );
    }
    return this.tenant(id, async (sql, actor) => {
      if (actor.role !== "admin")
        throw new HttpError(
          403,
          "ADMIN_REQUIRED",
          "Data může nahrát pouze správce firmy.",
        );
      await sql.query(
        "SELECT organization_id FROM workspaces WHERE organization_id=$1 FOR UPDATE",
        [actor.organization_id],
      );
      const w = await this.workspace(sql, actor);
      if (w.version !== version)
        throw new HttpError(
          409,
          "VERSION_CONFLICT",
          "Plán se změnil. Zkontrolujte import proti aktuálnímu plánu.",
        );
      if (input.revision === "empty")
        throw new HttpError(
          400,
          "REVISION_RESERVED",
          "Použijte vlastní jedinečné označení importu.",
        );
      const old = await sql.query(
        "SELECT revision FROM dataset_revisions WHERE organization_id=$1 AND revision=$2",
        [actor.organization_id, input.revision],
      );
      if (old.rows.length)
        throw new HttpError(
          409,
          "REVISION_EXISTS",
          "Tato revize už byla importována. Použijte nové označení.",
        );
      await sql.query(
        "INSERT INTO dataset_revisions(organization_id,revision,input) VALUES($1,$2,$3)",
        [actor.organization_id, input.revision, JSON.stringify(input)],
      );
      await sql.query(
        "UPDATE workspaces SET input=$2,baseline=$3,scenario=$4,result=$3,version=version+1,saved_at=null,imported_at=now() WHERE organization_id=$1",
        [
          actor.organization_id,
          JSON.stringify(input),
          JSON.stringify(result),
          JSON.stringify(blankScenario()),
        ],
      );
      await this.audit(sql, actor, "dataset.imported", version + 1);
      return this.workspace(sql, actor);
    });
  }
  private async audit(sql: Sql, actor: Actor, action: string, version: number) {
    await sql.query(
      "INSERT INTO audit_events(organization_id,subject,action,version) VALUES($1,$2,$3,$4)",
      [actor.organization_id, actor.subject, action, version],
    );
  }
  async revoke(id: string) {
    await this.db.query("DELETE FROM sessions WHERE token_hash=$1", [hash(id)]);
  }
  async cleanup() {
    await this.db.query("DELETE FROM sessions WHERE expires_at <= now()");
    await this.db.query("DELETE FROM login_flows WHERE expires_at <= now()");
    await this.db.query("DELETE FROM rate_buckets WHERE expires_at <= now()");
  }
}
