import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useOrg } from "../../org/OrgProvider";
import type { StoreItem } from "../../types/db";

export function StoreAdmin() {
  const { org } = useOrg();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState(100);
  const [stock, setStock] = useState<number | "">("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCost, setEditCost] = useState(0);
  const [editStock, setEditStock] = useState<number | "">("");
  const [editActive, setEditActive] = useState(true);

  async function load() {
    const { data, error } = await supabase.from("store_items").select("*").order("created_at", { ascending: false });
    if (error) setErr(error.message);
    else setItems(data ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setOk("");
    if (!name.trim()) return setErr("Name is required.");
    const { error } = await supabase.from("store_items").insert({
      name: name.trim(),
      description: description.trim() || null,
      token_cost: cost,
      stock: stock === "" ? null : Number(stock),
      org_id: org.id,
    });
    if (error) return setErr(error.message);
    setName("");
    setDescription("");
    setCost(100);
    setStock("");
    setOk("Store item added.");
    await load();
  }

  async function toggle(item: StoreItem) {
    setErr("");
    setOk("");
    const { error } = await supabase.from("store_items").update({ is_active: !item.is_active }).eq("id", item.id).eq("org_id", org.id);
    if (error) return setErr(error.message);
    setOk(`${item.name} is now ${item.is_active ? "hidden" : "live"}.`);
    await load();
  }

  function beginEdit(item: StoreItem) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditDescription(item.description ?? "");
    setEditCost(item.token_cost);
    setEditStock(item.stock ?? "");
    setEditActive(item.is_active);
    setErr("");
    setOk("");
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId || !editName.trim()) return setErr("Name is required.");
    setErr("");
    setOk("");
    const { error } = await supabase
      .from("store_items")
      .update({
        name: editName.trim(),
        description: editDescription.trim() || null,
        token_cost: editCost,
        stock: editStock === "" ? null : Number(editStock),
        is_active: editActive,
      })
      .eq("id", editingId)
      .eq("org_id", org.id);
    if (error) return setErr(error.message);
    setEditingId(null);
    setOk("Store item updated.");
    await load();
  }

  async function deleteItem(item: StoreItem) {
    if (!window.confirm(`Permanently delete "${item.name}"? This cannot be undone.`)) return;
    setErr("");
    setOk("");
    const { error } = await supabase.from("store_items").delete().eq("id", item.id).eq("org_id", org.id);
    if (error) {
      if (error.code === "23503") return setErr(`"${item.name}" has order history and cannot be deleted. Hide it instead.`);
      return setErr(error.message);
    }
    if (editingId === item.id) setEditingId(null);
    setOk(`${item.name} deleted.`);
    await load();
  }

  return (
    <>
      <div className="card">
        <h2>New store item</h2>
        <p className="hint">Students redeem these with points. Leave stock blank for unlimited.</p>
        <form onSubmit={create}>
          <div className="field-block"><label className="field">Name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Snack Voucher" /></div>
          <div className="field-block"><label className="field">Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="row2">
            <div className="field-block"><label className="field">Token cost</label><input type="number" min={0} value={cost} onChange={(e) => setCost(Number(e.target.value))} /></div>
            <div className="field-block"><label className="field">Stock (blank = unlimited)</label><input type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value === "" ? "" : Number(e.target.value))} /></div>
          </div>
          <button className="btn btn-primary btn-block">Add item</button>
        </form>
      </div>

      <div className="card">
        <h2>Store items</h2>
        {err && <div className="notice err">{err}</div>}
        {ok && <div className="notice ok">{ok}</div>}
        {items.length === 0 ? <p className="muted">No items yet.</p> : items.map((item) => editingId === item.id ? (
          <form key={item.id} className="stack" onSubmit={saveEdit} style={{ padding: "16px 0", borderBottom: "1px solid var(--line)" }}>
            <div className="row2">
              <div className="field-block"><label className="field">Name</label><input value={editName} onChange={(e) => setEditName(e.target.value)} required /></div>
              <div className="field-block"><label className="field">Description</label><input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} /></div>
            </div>
            <div className="row2">
              <div className="field-block"><label className="field">Token cost</label><input type="number" min={0} value={editCost} onChange={(e) => setEditCost(Number(e.target.value))} /></div>
              <div className="field-block"><label className="field">Stock (blank = unlimited)</label><input type="number" min={0} value={editStock} onChange={(e) => setEditStock(e.target.value === "" ? "" : Number(e.target.value))} /></div>
            </div>
            <label className="check-row"><input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} /> Visible to students</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-primary" type="submit">Save changes</button>
              <button className="btn btn-ghost" type="button" onClick={() => setEditingId(null)}>Cancel</button>
            </div>
          </form>
        ) : (
          <div key={item.id} className="item-row">
            <div className="item-name">
              {item.name}
              <small>{item.description || "No description"} · {item.token_cost} pts · {item.stock === null ? "unlimited stock" : `${item.stock} left`}</small>
            </div>
            <div className="stack" style={{ alignItems: "flex-end" }}>
              <span className={`pill ${item.is_active ? "ready" : "collected"}`}>{item.is_active ? "live" : "hidden"}</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => beginEdit(item)}>Edit</button>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => toggle(item)}>{item.is_active ? "Hide" : "Show"}</button>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: "5px 10px", color: "var(--danger)" }} onClick={() => deleteItem(item)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
