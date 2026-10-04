import { describe, it, expect } from "vitest";
import {
  connectionEnvironment,
  dumpArguments,
  safeRestoreTarget,
} from "../scripts/backup";
describe("backup safety", () => {
  it("keeps credentials out of arguments and rejects unverified remote TLS", () => {
    const url = new URL(
      "postgresql://db.example/postgres?sslmode=verify-full&sslrootcert=/run/secrets/db-ca.crt",
    );
    url.username = "backup";
    url.password = "fixture:@ pass";
    const env = connectionEnvironment(url.href, {
      PGHOSTADDR: "evil",
      PGOPTIONS: "unsafe",
      PATH: "path",
    });
    expect(env.PGPASSWORD).toBe("fixture:@ pass");
    expect(env.PGHOST).toBe("db.example");
    expect(env.PGHOSTADDR).toBeUndefined();
    expect(env.PGOPTIONS).toBeUndefined();
    expect(env.PGSSLROOTCERT).toBe("/run/secrets/db-ca.crt");
    expect(dumpArguments("/tmp/dump").join(" ")).not.toContain("fixture");
    expect(() =>
      connectionEnvironment(
        "postgresql://db.example/postgres?sslmode=require",
        {},
      ),
    ).toThrow();
    expect(() =>
      connectionEnvironment(
        "postgresql://db.example/postgres?sslmode=verify-full&options=unsafe",
        {},
      ),
    ).toThrow();
  });
  it("backs up all tenant data but excludes sessions and one-time codes", () => {
    const args = dumpArguments("file");
    expect(args).toContain("--table=public.dataset_revisions");
    expect(args).toContain("--table=public.audit_events");
    for (const name of ["sessions", "login_flows", "rate_buckets"])
      expect(args).toContain("--exclude-table-data=public." + name);
  });
  it("refuses source overwrite even with a different user or encoded database name", () => {
    expect(() =>
      safeRestoreTarget(
        "postgresql://localhost/navcas_restore_test",
        "postgresql://localhost:5432/navcas_restore_test",
        "navcas_restore_test",
      ),
    ).toThrow();
    expect(() =>
      safeRestoreTarget(
        "postgresql://localhost/live",
        "postgresql://localhost/live",
        "live",
      ),
    ).toThrow();
    expect(() =>
      safeRestoreTarget(
        "postgresql://localhost/live",
        "postgresql://localhost/other",
        "other",
      ),
    ).toThrow();
    expect(() =>
      safeRestoreTarget(
        "postgresql://localhost/live",
        "postgresql://localhost/navcas_restore_test",
        undefined,
      ),
    ).toThrow();
    expect(() =>
      safeRestoreTarget(
        "postgresql://localhost/live",
        "postgresql://localhost/navcas_restore_test",
        "navcas_restore_test",
      ),
    ).not.toThrow();
  });
});
