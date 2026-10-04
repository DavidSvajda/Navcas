import type {
  PlanInput,
  PlanResult,
  Scenario,
  Workspace,
} from "../../packages/contracts/index.js";
type MaybePromise<T> = T | Promise<T>;
export interface WorkspaceBackend {
  create(): MaybePromise<string>;
  has(id: unknown): MaybePromise<boolean>;
  csrf(id: string): MaybePromise<string>;
  read(id: string): MaybePromise<Workspace>;
  preview(id: string, scenario: Scenario): MaybePromise<PlanResult>;
  save(
    id: string,
    version: number,
    scenario: Scenario,
  ): MaybePromise<Workspace>;
  revoke?(id: string): MaybePromise<void>;
  import?(
    id: string,
    version: number,
    input: PlanInput,
  ): MaybePromise<Workspace>;
}
