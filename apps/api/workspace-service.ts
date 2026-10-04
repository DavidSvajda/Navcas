import { randomBytes } from "node:crypto";
import type { Scenario, Workspace } from "../../packages/contracts/index.js";
import { demoInput, emptyScenario } from "../../fixtures/demo.js";
import { applyScenario, calculatePlan } from "../../packages/domain/engine.js";
import { HttpError } from "./errors.js";
export const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
type DemoState = Omit<Workspace, "csrfToken" | "sessionExpiresAt">;
type Entry = { state: DemoState; csrfToken: string; expiresAt: number };
/** Bounded, expiring demo repository. Customer persistence belongs in PostgreSQL. */
export class WorkspaceService {
  private readonly sessions = new Map<string, Entry>();
  private readonly input = structuredClone(demoInput);
  private readonly baseline = calculatePlan(this.input);
  constructor(
    private readonly now = Date.now,
    private readonly capacity = 500,
  ) {}
  create() {
    for (const [id, entry] of this.sessions)
      if (entry.expiresAt <= this.now()) this.sessions.delete(id);
    if (this.sessions.size >= this.capacity)
      throw new HttpError(
        503,
        "DEMO_CAPACITY",
        "Ukázka je právě vytížená. Zkuste to později.",
      );
    const id = randomBytes(32).toString("base64url");
    this.sessions.set(id, {
      csrfToken: randomBytes(32).toString("hex"),
      expiresAt: this.now() + SESSION_TTL_MS,
      state: {
        input: this.input,
        baseline: this.baseline,
        scenario: emptyScenario(),
        scenarioResult: this.baseline,
        version: 0,
        savedAt: null,
        mode: "demo",
      },
    });
    return id;
  }
  has(id: unknown): id is string {
    return (
      typeof id === "string" &&
      this.sessions.has(id) &&
      this.sessions.get(id)!.expiresAt > this.now()
    );
  }
  private entry(id: string) {
    const entry = this.sessions.get(id);
    if (!entry || entry.expiresAt <= this.now()) {
      this.sessions.delete(id);
      throw new HttpError(
        401,
        "SESSION_EXPIRED",
        "Pracovní relace vypršela. Načtěte aktuální verzi a znovu uložte své rozepsané změny.",
      );
    }
    return entry;
  }
  read(id: string): Workspace {
    const entry = this.entry(id);
    return structuredClone({
      ...entry.state,
      csrfToken: entry.csrfToken,
      sessionExpiresAt: new Date(entry.expiresAt).toISOString(),
    });
  }
  csrf(id: string) {
    return this.entry(id).csrfToken;
  }
  preview(id: string, scenario: Scenario) {
    this.entry(id);
    return calculatePlan(applyScenario(this.input, scenario));
  }
  save(id: string, expectedVersion: number, scenario: Scenario) {
    const entry = this.entry(id);
    if (entry.state.version !== expectedVersion)
      throw new HttpError(
        409,
        "VERSION_CONFLICT",
        "Scénář mezitím změnilo jiné okno. Načtěte aktuální verzi; rozepsané změny zůstanou zachované.",
      );
    const result = this.preview(id, scenario);
    entry.state = {
      ...entry.state,
      scenario: structuredClone(scenario),
      scenarioResult: result,
      version: entry.state.version + 1,
      savedAt: new Date(this.now()).toISOString(),
    };
    return this.read(id);
  }
}
