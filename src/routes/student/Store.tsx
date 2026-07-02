import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../auth/AuthProvider";
import { Confetti } from "../../components/Confetti";
import { Icon } from "../../components/Icon";
import type { StoreItem } from "../../types/db";

export function Store() {
  const { profile, refreshProfile } = useAuth();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [confetti, setConfetti] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("store_items").select("*").eq("is_active", true).order("token_cost");
    setItems(data ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  const points = profile?.points ?? 0;

  async function redeem(item: StoreItem) {
    setMsg(null);
    setBusyId(item.id);
    const { error } = await supabase.rpc("redeem_item", { p_item_id: item.id });
    setBusyId(null);
    if (error) {
      setMsg({ kind: "err", text: error.message });
      return;
    }
    setConfetti((c) => c + 1);
    setMsg({ kind: "ok", text: `Redeemed ${item.name}! Check "My Orders" for pickup status.` });
    await refreshProfile();
    await load();
  }

  return (
    <>
      <Confetti fire={confetti} />
      <div className="card spread">
        <div>
          <h2>Reward Store</h2>
          <p className="hint" style={{ margin: 0 }}>Spend your points. Redeemed items show up under My Orders.</p>
        </div>
        <span className="points-badge"><Icon name="coin" size={15} /> {points}</span>
      </div>

      {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}

      {loading ? (
        <div className="card muted">Loading store…</div>
      ) : (
        <div className="store-grid">
          {items.map((item) => {
            const soldOut = item.stock !== null && item.stock <= 0;
            const cantAfford = points < item.token_cost;
            const locked = soldOut || cantAfford;
            return (
              <div key={item.id} className={`store-card${locked ? " locked" : ""}`}>
                <div className="spread">
                  <span className="name">{item.name}</span>
                  <span className="cost"><Icon name="coin" size={14} /> {item.token_cost}</span>
                </div>
                <div className="desc">{item.description}</div>
                {item.stock !== null && (
                  <div className="muted mono" style={{ fontSize: 11 }}>{soldOut ? "SOLD OUT" : `${item.stock} left`}</div>
                )}
                <button
                  className="btn btn-primary"
                  disabled={locked || busyId === item.id}
                  onClick={() => redeem(item)}
                >
                  {soldOut ? "Sold out" : cantAfford ? `Need ${item.token_cost - points} more` : busyId === item.id ? "Redeeming…" : "Redeem"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
