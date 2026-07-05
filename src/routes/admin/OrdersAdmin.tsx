import { useEffect, useState } from "react";
import { studentPublicId } from "../../lib/studentIdentity";
import { supabase } from "../../lib/supabase";
import type { Order } from "../../types/db";

type OrderWithStudent = Order & { profiles: { id: string } | null };

const NEXT: Record<string, { label: string; status: string } | null> = {
  pending: { label: "Mark ready", status: "ready" },
  ready: { label: "Mark collected", status: "collected" },
  collected: null,
  cancelled: null,
};

export function OrdersAdmin() {
  const [orders, setOrders] = useState<OrderWithStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  async function load() {
    const { data } = await supabase
      .from("orders")
      .select("*, profiles(id)")
      .order("created_at", { ascending: false });
    setOrders((data ?? []) as unknown as OrderWithStudent[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function setStatus(o: Order, status: string) {
    await supabase.from("orders").update({ status, updated_at: new Date().toISOString() }).eq("id", o.id);
    load();
  }

  const shown = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  return (
    <>
      <div className="card">
        <div className="spread">
          <h2>Orders</h2>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: "auto" }}>
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="ready">Ready</option>
            <option value="collected">Collected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <p className="hint">Mark an item ready when it is prepared. The student sees it update live.</p>
      </div>

      {loading ? (
        <div className="card muted">Loading...</div>
      ) : shown.length === 0 ? (
        <div className="card muted">No orders.</div>
      ) : (
        <div className="card">
          {shown.map((o) => {
            const next = NEXT[o.status];
            return (
              <div key={o.id} className="item-row">
                <div className="item-name">
                  {o.item_name}
                  <small>
                    {studentPublicId(o.profiles?.id ?? o.student_id)} &middot; {o.token_cost} pts &middot;{" "}
                    {new Date(o.created_at).toLocaleString()}
                  </small>
                </div>
                <div className="stack" style={{ alignItems: "flex-end" }}>
                  <span className={`pill ${o.status}`}>{o.status}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {next && (
                      <button
                        className="btn btn-solid"
                        style={{ fontSize: 12, padding: "5px 10px" }}
                        onClick={() => setStatus(o, next.status)}
                      >
                        {next.label}
                      </button>
                    )}
                    {o.status !== "cancelled" && o.status !== "collected" && (
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 12, padding: "5px 10px" }}
                        onClick={() => setStatus(o, "cancelled")}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
