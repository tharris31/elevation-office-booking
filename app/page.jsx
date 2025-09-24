"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

function TextField(props){return(
  <input {...props}
    className={"w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring " + (props.className||"")}
  />
);}

export default function TherapistsPage(){
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [form,setForm]=useState({display_name:"",email:"",color:"#6366F1",active:true});

  useEffect(()=>{ (async()=>{
    const {data,error}=await supabase.from("profiles")
      .select("id,display_name,email,color,active")
      .order("display_name",{ascending:true});
    if(error) alert(error.message); else setRows(data||[]);
    setLoading(false);
  })(); },[]);

  async function addOrUpdate(){
    if(!form.display_name) return alert("Name required");
    if(!form.email) return alert("Email required (must exist in Auth → Users)");
    setSaving(true);
    const {error}=await supabase.from("profiles").upsert([form],{onConflict:"email"});
    setSaving(false);
    if(error) return alert(error.message);
    setForm({display_name:"",email:"",color:"#6366F1",active:true});
    const {data}=await supabase.from("profiles").select("id,display_name,email,color,active").order("display_name");
    setRows(data||[]);
  }

  async function update(id,patch){
    const {error}=await supabase.from("profiles").update(patch).eq("id",id);
    if(error) return alert(error.message);
    setRows(prev=>prev.map(r=>r.id===id?{...r,...patch}:r));
  }

  async function remove(id){
    if(!confirm("Delete this therapist profile? Bookings will keep their history.")) return;
    const {error}=await supabase.from("profiles").delete().eq("id",id);
    if(error) return alert(error.message);
    setRows(prev=>prev.filter(r=>r.id!==id));
  }

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Therapists</h1>

      <div className="bg-white border rounded-2xl p-4">
        <div className="font-medium mb-3">Add / Update Therapist</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <TextField placeholder="Display name" value={form.display_name}
            onChange={e=>setForm(f=>({...f,display_name:e.target.value}))}/>
          <TextField placeholder="name@domain.com" type="email" value={form.email}
            onChange={e=>setForm(f=>({...f,email:e.target.value}))}/>
          <input type="color" value={form.color}
            onChange={e=>setForm(f=>({...f,color:e.target.value}))}
            className="h-[42px] w-full rounded-lg border"/>
          <button onClick={addOrUpdate} disabled={saving}
            className="px-3 py-2 rounded-lg bg-indigo-600 text-white">
            {saving?"Saving…":"Save"}
          </button>
        </div>
        <p className="text-sm text-gray-600 mt-2">
          Invite the therapist first in <strong>Supabase → Authentication → Users</strong>, then set their name & color here.
        </p>
      </div>

      <div className="bg-white border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 font-medium">All therapists</div>
        {loading? <div className="p-6">Loading…</div> :
        <table className="min-w-full">
          <thead>
            <tr className="text-left text-sm text-gray-600">
              <th className="px-4 py-2">Color</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {rows.map(t=>(
              <tr key={t.id} className="border-t">
                <td className="px-4 py-2">
                  <input type="color" value={t.color||"#6366F1"}
                    onChange={e=>update(t.id,{color:e.target.value})}/>
                </td>
                <td className="px-4 py-2">
                  <TextField value={t.display_name||""}
                    onChange={e=>update(t.id,{display_name:e.target.value})}/>
                </td>
                <td className="px-4 py-2">
                  <TextField value={t.email||""}
                    onChange={e=>update(t.id,{email:e.target.value})}/>
                </td>
                <td className="px-4 py-2">
                  <span className={"px-2 py-1 rounded-lg "+(t.active?"bg-green-100 text-green-800":"bg-gray-100")}>
                    {t.active?"Active":"Inactive"}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    <button onClick={()=>update(t.id,{active:!t.active})} className="px-2 py-1 border rounded-lg hover:bg-gray-50">
                      {t.active?"Deactivate":"Activate"}
                    </button>
                    <button onClick={()=>remove(t.id)} className="px-2 py-1 border rounded-lg border-red-300 text-red-700 hover:bg-red-50">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length===0 && <tr><td className="px-4 py-6 text-gray-500" colSpan={5}>No therapists yet.</td></tr>}
          </tbody>
        </table>}
      </div>
    </div>
  );
}
