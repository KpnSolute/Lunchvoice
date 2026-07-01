import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { Order } from "../../types/db";

const STATUS_LABEL: Record<string, string> = {
  pending: "Preparing",
  ready: "Ready for pickup 🎉",
  collected: "Collected",
  cancelled: "Cancelled",
};

export function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    setOrders(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // Realtime: flip status live when admin marks an order ready.
    const ch = supabase
      .channel("my-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  return (
    <>
      <div className="card">
        <h2>My Orders</h2>
        <p className="hint" style={{ margin: 0 }}>When staff marks an item ready, it updates here automatically.</p>
      </div>

      {loading ? (
        <div className="card muted">Loading…</div>
      ) : orders.length === 0 ? (
        <div className="card muted">No orders yet. Redeem something in the store!</div>
      ) : (
        <div className="card">
          {orders.map((o) => (
            <div key={o.id} className="item-row">
              <div className="item-name">
                {o.item_name}
                <small>{new Date(o.created_at).toLocaleDateString()} · 🍴 {o.token_cost}</small>
              </div>
              <span className={`pill ${o.status}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
