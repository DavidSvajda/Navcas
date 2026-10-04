import { Worker } from "node:worker_threads";
import type {
  PlanInput,
  PlanResult,
  Scenario,
} from "../../packages/contracts/index.js";
import { HttpError } from "./errors.js";
export type Calculator = (
  input: PlanInput,
  scenario?: Scenario,
) => Promise<PlanResult>;
/** One bounded worker keeps expensive plans out of the HTTP event loop. */
export class CalculationQueue {
  private jobs: {
    input: PlanInput;
    scenario?: Scenario;
    resolve: (r: PlanResult) => void;
    reject: (e: Error) => void;
  }[] = [];
  private active = false;
  private stopped = false;
  private worker: Worker | undefined;
  readonly calculate: Calculator = (input, scenario) => {
    if (this.stopped || this.jobs.length >= 8)
      return Promise.reject(
        new HttpError(
          503,
          "CALCULATION_BUSY",
          "Výpočet je vytížený. Zkuste to za chvíli.",
        ),
      );
    return new Promise((resolve, reject) => {
      this.jobs.push({ input, scenario, resolve, reject });
      this.next();
    });
  };
  private next() {
    if (this.active || !this.jobs.length || this.stopped) return;
    this.active = true;
    const job = this.jobs[0];
    const worker = new Worker(
      new URL("./calculation-worker.js", import.meta.url),
      { resourceLimits: { maxOldGenerationSizeMb: 256 } },
    );
    this.worker = worker;
    let finished = false;
    const finish = (error?: Error, result?: PlanResult) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      void worker.terminate();
      this.worker = undefined;
      this.jobs.shift();
      this.active = false;
      if (error) job.reject(error);
      else job.resolve(result!);
      this.next();
    };
    const timer = setTimeout(
      () =>
        finish(
          new HttpError(
            503,
            "CALCULATION_TIMEOUT",
            "Výpočet překročil limit. Omezte rozsah plánu a zkuste to znovu.",
          ),
        ),
      15000,
    );
    worker.once("message", (message) =>
      finish(
        message.error
          ? new HttpError(400, "INVALID_PLAN", message.error)
          : undefined,
        message.result,
      ),
    );
    worker.once("error", () =>
      finish(
        new HttpError(
          503,
          "CALCULATION_FAILED",
          "Výpočet se nezdařil. Zkuste to znovu.",
        ),
      ),
    );
    worker.once("exit", (code) => {
      if (!finished)
        finish(
          new HttpError(
            503,
            "CALCULATION_FAILED",
            `Výpočet nebyl dokončen (${code}).`,
          ),
        );
    });
    worker.postMessage({ input: job.input, scenario: job.scenario });
  }
  async close() {
    this.stopped = true;
    for (const job of this.jobs.splice(0))
      job.reject(
        new HttpError(
          503,
          "SERVER_STOPPING",
          "Server se restartuje. Zkuste to znovu.",
        ),
      );
    await this.worker?.terminate();
  }
}
