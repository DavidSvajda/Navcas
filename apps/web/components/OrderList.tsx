import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import type { OrderResult, PlanInput } from "../../../packages/contracts/index";
import { Badge } from "./Badge";
import { dateText, numberText } from "../lib/presentation";
export function OrderList({
  orders,
  input,
  openDetail,
}: {
  orders: OrderResult[];
  input: PlanInput;
  openDetail: (id: string) => void;
}) {
  const rows = useMemo(() => {
    const byId = new Map(input.orders.map((o) => [o.id, o]));
    const products = new Map(input.products.map((p) => [p.id, p]));
    return orders.map((result) => ({
      result,
      order: byId.get(result.id)!,
      productName: products.get(byId.get(result.id)!.productId)?.name,
    }));
  }, [orders, input]);
  return (
    <>
      <div className="mobile-order-list">
        {rows.map(({ result, order: o, productName }) => (
          <article className="mobile-order" key={o.id}>
            <div>
              <button className="order-link" onClick={() => openDetail(o.id)}>
                {o.code}
              </button>
              <Badge status={result.status} />
            </div>
            <p>{productName}</p>
            <small>{o.customer}</small>
            <div className="mobile-order-bottom">
              <span>
                Potřeba {dateText(o.needDate)} · {numberText(o.remaining)} ks
              </span>
              <button
                className="icon-button"
                aria-label={`Detail ${o.code}`}
                onClick={() => openDetail(o.id)}
              >
                <ChevronRight size={19} />
              </button>
            </div>
          </article>
        ))}
      </div>
      <div className="table-scroll orders-table">
        <table>
          <thead>
            <tr>
              <th>Zakázka / výrobek</th>
              <th>Zákazník</th>
              <th>Potřeba materiálu</th>
              <th>Zbývá vyrobit</th>
              <th>Materiálové pokrytí</th>
              <th>
                <span className="sr-only">Detail</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ result, order: o, productName }) => (
              <tr key={o.id}>
                <td>
                  <button
                    className="order-link"
                    onClick={() => openDetail(o.id)}
                  >
                    {o.code}
                  </button>
                  <small>{productName}</small>
                </td>
                <td>{o.customer}</td>
                <td>
                  <span className="date-cell">{dateText(o.needDate)}</span>
                  <small>Priorita {o.priority}</small>
                </td>
                <td>
                  {numberText(o.remaining)} <span className="muted">ks</span>
                </td>
                <td>
                  <Badge status={result.status} />
                </td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={`Detail ${o.code}`}
                    onClick={() => openDetail(o.id)}
                  >
                    <ChevronRight size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
