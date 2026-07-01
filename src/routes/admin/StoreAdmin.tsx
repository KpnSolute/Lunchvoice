import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { StoreItem } from "../../types/db";

export function StoreAdmin() {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState(100);
  const [stock, setStock] = useState<number | "">("");
  const [err, setErr] = useState("");

  async function load() {
    const { data } = await supabase.from("store_items").select("*").order("created_at", { ascending: false });
    setItems(data ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!name.trim()) {
      setErr("Name is required.");
      return;
    }
    const { error } = await supabase.from("store_items").insert({
      name: name.trim(),
      description: description.trim() || null,
      token_cost: cost,
      stock: stock === "" ? null : Number(stock),
    });
    if (error) {
      setErr(error.message);
      return;
    }
    setName("");
    setDescription("");
    setCost(100);
    setStock("");
    load();
  }

  async function toggle(item: StoreItem) {
    await supabase.from("store_items").update({ is_active: !item.is_active }).eq("id", item.id);
    load();
  }

  return (
    <>
      <div className="card">
        <h2>New store item</h2>
        <p className="hint">Students redeem these with points. Leave stock blank for unlimited.</p>
        <form onSubmit={create}>
          <div className="field-block">
            <label className="field">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Snack Voucher" />
          </div>
          <div className="field-block">
            <label className="field">Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="row2">
            <div className="field-block">
              <label className="field">Token cost</label>
              <input type="number" min={0} value={cost} onChange={(e) => setCost(Number(e.target.value))} />
            </div>
            <div className="field-block">
              <label className="field">Stock (blank = ∞)</label>
              <input type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
          </div>
          {err && <div className="notice err">{err}</div>}
          <button className="btn-primary btn-block">Add item</button>
        </form>
      </div>

      <div className="card">
        <h2>Store items</h2>
        {items.length === 0 ? (
          <p className="muted">No items yet.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="item-row">
              <div className="item-name">
                {item.name}
                <small>🍴 {item.token_cost} · {item.stock === null ? "∞ stock" : `${item.stock} left`}</small>
              </div>
              <div className="stack" style={{ alignItems: "flex-end" }}>
                <span className={`pill ${item.is_active ? "ready" : "collected"}`}>{item.is_active ? "live" : "hidden"}</span>
                <button className="btn-ghost" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => toggle(item)}>
                  {item.is_active ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
