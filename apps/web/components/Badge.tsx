import type { Status } from "../../../packages/contracts/index";
import { labels } from "../lib/presentation";
export function Badge({ status }: { status: Status }) {
  return (
    <span className={`badge ${status}`}>
      <span />
      {labels[status]}
    </span>
  );
}
