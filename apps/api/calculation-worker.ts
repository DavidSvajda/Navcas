import { parentPort } from "node:worker_threads";
import { applyScenario, calculatePlan } from "../../packages/domain/engine.js";
parentPort!.on("message", ({ input, scenario }) => {
  try {
    parentPort!.postMessage({
      result: calculatePlan(scenario ? applyScenario(input, scenario) : input),
    });
  } catch (error) {
    parentPort!.postMessage({
      error: error instanceof Error ? error.message : "Neplatný plán.",
    });
  }
});
