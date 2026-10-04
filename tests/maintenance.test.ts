import { describe, it, expect, vi } from "vitest";
import { activityMaintenance } from "../apps/api/maintenance";
describe("activity-driven maintenance", () => {
  it("never polls idle databases and coalesces concurrent requests", async () => {
    let time = 0;
    let finish!: () => void;
    const cleanup = vi.fn(
      () =>
        new Promise<void>((r) => {
          finish = r;
        }),
    );
    const task = activityMaintenance(cleanup, vi.fn(), 100, () => time);
    expect(cleanup).not.toHaveBeenCalled();
    task.touch();
    task.touch();
    time = 200;
    task.touch();
    expect(cleanup).toHaveBeenCalledTimes(1);
    finish();
    await task.drain();
    task.touch();
    expect(cleanup).toHaveBeenCalledTimes(2);
    finish();
    await task.drain();
    time = 299;
    task.touch();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
  it("backs off after a failed cleanup without an unhandled rejection", async () => {
    let time = 0;
    const cleanup = vi.fn(async () => {
      throw new Error("unavailable");
    });
    const report = vi.fn();
    const task = activityMaintenance(cleanup, report, 100, () => time);
    task.touch();
    await task.drain();
    task.touch();
    expect(report).toHaveBeenCalledTimes(1);
    time = 100;
    task.touch();
    await task.drain();
    expect(report).toHaveBeenCalledTimes(2);
  });
});
