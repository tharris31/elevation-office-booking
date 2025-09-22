"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function TherapistsPage() {
  const [therapists, setTherapists] = useState([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = "/login"; return; }
      await load();
    })();
  }, []);

  async function load() {
    const { data, error } = await supabase
      .from("therapists")
      .select("id,name,email,active,created_at")
      .order("name");
    if (error) return alert(error.message);
    setTherapists(data ?? []);
  }

  async function addTherapist(e) {
    e.preventDefault();
    if (!name.trim()) return alert("Enter a name");
    const { error } = await supabase
      .from("therapists")
      .insert({ name: name.trim(), email: email.trim() || null, active: true });
    if (error) return alert(error.message);
    setName(""); setEmail(""); await load();
  }

  async function toggleActive(id, active) {
    const { error } = await supabase.from("therapists").update({ active: !active }).eq("id", id);
    if (error) return alert(error.message);
    await load();
  }

  return (
    <div className="container">
      <h1 className="h1">Therapists</h1>

      <div className="card">
        <form onSubmit={addTherapist} className="grid2">
          <div>
            <label>Name</label>
            <input className="input mt8" value={name} onChange={e=>setName(e.target.value)} placeholder="Therapist name" />
          </div>
          <div>
            <label>Email (optional)</label>
            <input className="input mt8" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@domain.com" />
          </div>
          <div style={{ gridColumn:"1 / -1", textAlign:"right" }}>
            <button className="btn primary" type="submit">Add therapist</button>
          </div>
        </form>
      </div>

      <div className="card mt16">
        <h2 className="h2">All therapists</h2>
        <table className="table mt8">
          <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {therapists.map(t => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{t.email || <span className="muted">—</span>}</td>
                <td>{t.active ? "Active" : "Inactive"}</td>
                <td><button className="btn" onClick={()=>toggleActive(t.id, t.active)}>{t.active ? "Deactivate" : "Activate"}</button></td>
              </tr>
            ))}
            {!therapists.length && <tr><td colSpan={4} className="muted">No therapists yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
