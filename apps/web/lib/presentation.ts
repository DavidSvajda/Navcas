import type { Status } from "../../../packages/contracts/index";
export const labels: Record<Status, string> = {
  stock: "Pokryto skladem",
  incoming: "Čeká na dodávku",
  shortage: "Chybí materiál",
  unknown: "Nelze ověřit",
  excluded: "Mimo plán",
};
export const dateText = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat("cs-CZ", {
        day: "numeric",
        month: "short",
      }).format(new Date(v + "T12:00:00"))
    : "Bez termínu";
/** Format decimal strings without conversion through an imprecise JS Number. */
export function numberText(v: string): string {
  const [whole, fraction] = v.split(".");
  return (
    whole.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0") +
    (fraction ? "," + fraction : "")
  );
}
export const orderCount = (n: number) =>
  n === 1 ? "zakázka" : n >= 2 && n <= 4 ? "zakázky" : "zakázek";
