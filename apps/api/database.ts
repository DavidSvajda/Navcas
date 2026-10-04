import pg from "pg";
export interface Sql {
  query<T extends Record<string, any> = Record<string, any>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}
export interface Database extends Sql {
  transaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export class PostgresDatabase implements Database {
  private readonly pool: pg.Pool;
  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      max: 8,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 10000,
    });
    this.pool.on("error", () =>
      console.error("Database pool connection failed"),
    );
  }
  async query<T extends Record<string, any>>(text: string, values?: unknown[]) {
    return this.pool.query<T>(text, values);
  }
  async transaction<T>(fn: (sql: Sql) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async close() {
    await this.pool.end();
  }
}
