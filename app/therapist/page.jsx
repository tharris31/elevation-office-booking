'use client';
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function TherapistsPage() {
  const [rows, setRows] = useState([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#4f46e5");

  async function load() {
    const { data, error } = await supabase.from("profiles")
      .select("id, email, display_name, color")
      .order("display_name", { ascending: true });
    if (!error) setRows(data || []);
  }
  useEffect(() => { load(); }, []);

  async function saveNew() {
    if (!email) return alert("Email required (must match their Supabase auth email).");
    const { error } = await supabase.from("profiles").upsert({
      id: undefined, email, display_name: name || email, color
    }, { onConflict: "email" });
    if (error) return alert(error.message);
    setEmail(""); setName(""); setColor("#4f46e5");
    load();
  }

  async function updateRow(id, patch) {
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) return alert(error.message);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="card-hd"><h2 className="font-medium">Add / Update Therapist</h2></div>
        <div className="card-bd grid md:grid-cols-4 gap-3">
          <input className="px-3 py-2 rounded-xl border border-slate-300" placeholder="email@example.com"
                 value={email} onChange={e=>setEmail(e.target.value)} />
          <input className="px-3 py-2 rounded-xl border border-slate-300" placeholder="Display name"
                 value={name} onChange={e=>setName(e.target.value)} />
          <input type="color" className="h-[42px] rounded-xl border border-slate-300" value={color}
                 onChange={e=>setColor(e.target.value)} />
          <button className="px-3 py-2 rounded-xl bg-brand text-white" onClick={saveNew}>Save</button>
        </div>
      </div>

      <div className="card">
        <div className="card-hd"><h2 className="font-medium">Therapists</h2></div>
        <div className="card-bd">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">Color</th><th>Email</th><th>Name</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r=>(
                <tr key={r.id} className="border-t">
                  <td className="py-2">
                    <input type="color" value={r.color || "#4f46e5"}
                           onChange={e=>updateRow(r.id,{color:e.target.value})}/>
                  </td>
                  <td>{r.email}</td>
                  <td>
                    <input className="px-2 py-1 rounded border border-slate-300"
                       defaultValue={r.display_name || r.email}
                       onBlur={e=>updateRow(r.id, {display_name: e.target.value})}/>
                  </td>
                  <td></td>
                </tr>
              ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
