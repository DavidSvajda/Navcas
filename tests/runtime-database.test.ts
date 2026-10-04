import { describe, it, expect } from "vitest";
import { assertRuntimeDatabase } from "../apps/api/runtime-database";
import type { Database } from "../apps/api/database";
function fixture(
  role: Record<string, boolean> = {},
  tables?: Record<string, unknown>[],
) {
  let i = 0;
  const rows = [
    [
      {
        rolsuper: false,
        rolbypassrls: false,
        can_create: false,
        privileged_membership: false,
        ...role,
      },
    ],
    tables ??
      ["workspaces", "dataset_revisions", "audit_events"].map((relname) => ({
        relname,
        relrowsecurity: true,
        relforcerowsecurity: true,
        owns_table: false,
      })),
    [{ version: 1 }],
  ];
  return {
    query: async () => ({ rows: rows[i++] }),
    close: async () => {},
  } as unknown as Database;
}
describe("runtime database preflight", () => {
  it("accepts a separate restricted role", async () => {
    await expect(assertRuntimeDatabase(fixture())).resolves.toBeUndefined();
  });
  it.each(["rolsuper", "rolbypassrls", "can_create", "privileged_membership"])(
    "refuses %s",
    async (flag) => {
      await expect(
        assertRuntimeDatabase(fixture({ [flag]: true })),
      ).rejects.toThrow();
    },
  );
  it.each(["owns_table", "missing_rls", "missing_force"])(
    "refuses unsafe tenant ownership/policy: %s",
    async (fault) => {
      const tables = ["workspaces", "dataset_revisions", "audit_events"].map(
        (relname) => ({
          relname,
          relrowsecurity: fault !== "missing_rls",
          relforcerowsecurity: fault !== "missing_force",
          owns_table: fault === "owns_table",
        }),
      );
      await expect(
        assertRuntimeDatabase(fixture({}, tables)),
      ).rejects.toThrow();
    },
  );
});
