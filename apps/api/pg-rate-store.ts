import { createHash } from "node:crypto";
import type { Database } from "./database.js";
export function postgresRateStore(db: Database) {
  return class Store {
    private namespace = "global";
    constructor(_options: object = {}) {}
    incr(
      key: string,
      callback: (
        error: Error | null,
        result?: { current: number; ttl: number },
      ) => void,
      timeWindow: number,
    ) {
      const digest = createHash("sha256")
        .update(this.namespace + ":" + key)
        .digest("hex");
      void db
        .query(
          `INSERT INTO rate_buckets(key,count,expires_at) VALUES($1,1,now()+($2*interval '1 millisecond'))
      ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_buckets.expires_at<=now() THEN 1 ELSE rate_buckets.count+1 END,
      expires_at=CASE WHEN rate_buckets.expires_at<=now() THEN now()+($2*interval '1 millisecond') ELSE rate_buckets.expires_at END
      RETURNING count AS current, GREATEST(1,ceil(extract(epoch from (expires_at-now()))*1000)) AS ttl`,
          [digest, timeWindow],
        )
        .then((r) =>
          callback(null, {
            current: Number(r.rows[0].current),
            ttl: Number(r.rows[0].ttl),
          }),
        )
        .catch((e) => callback(e));
    }
    child(route: { method?: unknown; path: string; prefix: string }) {
      const store = new Store();
      store.namespace = `${String(route.method)}:${route.prefix}:${route.path}`;
      return store;
    }
  };
}
