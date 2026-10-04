import { PGlite } from "@electric-sql/pglite";
import { PostgresDatabase, type Sql } from "../../apps/api/database";
export function testDatabase() {
  if (process.env.PG_TEST_HOST) {
    const url = new URL(
      `postgresql://${process.env.PG_TEST_HOST}:5432/navcas_test`,
    );
    url.username = "test_owner";
    url.password = process.env.PG_TEST_PASSWORD ?? "";
    process.env.TEST_DATABASE_URL = url.href;
  }
  if (!process.env.TEST_DATABASE_URL) {
    const db = new PGlite();
    return {
      query: async (text: string, values?: unknown[]) =>
        db.query<Record<string, any>>(text, values),
      exec: (text: string) => db.exec(text),
      close: () => db.close(),
      transaction: <T>(
        fn: (
          sql: Sql & { exec: (text: string) => Promise<unknown> },
        ) => Promise<T>,
      ) =>
        db.transaction((tx) =>
          fn({
            query: async (text, values) => tx.query<any>(text, values),
            exec: (text) => tx.exec(text),
          }),
        ),
    };
  }
  const db = new PostgresDatabase(process.env.TEST_DATABASE_URL);
  return {
    query: (text: string, values?: unknown[]) => db.query(text, values),
    exec: (text: string) => db.query(text),
    close: () => db.close(),
    transaction: <T>(
      fn: (
        sql: Sql & { exec: (text: string) => Promise<unknown> },
      ) => Promise<T>,
    ) =>
      db.transaction((sql) =>
        fn({
          ...sql,
          query: sql.query.bind(sql),
          exec: (text) => sql.query(text),
        }),
      ),
  };
}
