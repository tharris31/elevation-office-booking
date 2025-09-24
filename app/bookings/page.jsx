"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// ---------- Helpers
const fmt = (d) => d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});

function mondayOf(d){
  const x = new Date(d);
  const day = x.getDay(); // 0 Sun ... 6 Sat
  const diff = (day===0? -6 : 1 - day); // back to Monday
  x.setDate(x.getDate()+diff);
  x.setHours(0,0,0,0);
  return x;
}

function daysMonSat(start, weeks=2){
  const out=[];
  let d=new Date(start);
  for(let w=0;w<weeks;w++){
    for(let i=0;i<6;i++){ // Mon..Sat
      const dd=new Date(d); dd.setDate(d.getDate()+i + w*7);
      out.push(dd);
    }
  }
  return out;
}

// Hours: 9–8 (Mon–Thu), 9–4 (Fri/Sat)
function hoursFor(d){
  const dow=d.getDay(); // 1 Mon ... 6 Sat
  const start=9, end=(dow>=1&&dow<=4)?20:16;
  return {start,end};
}
function slotsForDay(d, stepMins=30){
  const {start,end}=hoursFor(d);
  const list=[];
  for(let h=start;h<=end;h++){
    const base=new Date(d); base.setHours(h,0,0,0);
    list.push(new Date(base));
    if(h<end){
      const base30=new Date(base); base30.setMinutes(30);
      list.push(base30);
    }
  }
  return list;
}

function rangeOverlap(aStart,aEnd,bStart,bEnd){
  return aEnd>bStart && aStart<bEnd;
}

function RowCard({children}){return <div className="bg-white border rounded-2xl p-4">{children}</div>}

// ---------- Page
export default function BookingsPage(){
  const [loading,setLoading]=useState(true);
  const [locations,setLocations]=useState([]);
  const [rooms,setRooms]=useState([]);
  const [therapists,setTherapists]=useState([]);
  const [bookings,setBookings]=useState([]);

  const [startMonday,setStartMonday]=useState(()=>mondayOf(new Date()));
  const [groupBy,setGroupBy]=useState("room"); // room|therapist|location
  const [filters,setFilters]=useState({locationId:"",roomId:"",therapistId:""});

  const days=useMemo(()=>daysMonSat(startMonday,2),[startMonday]);

  useEffect(()=>{ (async()=>{
    const [loc,rm,th,bk] = await Promise.all([
      supabase.from("locations").select("id,name").order("name"),
      supabase.from("rooms").select("id,name,location_id").order("name"),
      supabase.from("profiles").select("id,display_name,color,active").order("display_name"),
      supabase.from("bookings").select("id,room_id,user_id,start_time,end_time,series_id")
    ]);
    if(loc.error) alert(loc.error.message); else setLocations(loc.data||[]);
    if(rm.error) alert(rm.error.message); else setRooms(rm.data||[]);
    if(th.error) alert(th.error.message); else setTherapists((th.data||[]).filter(t=>t.active!==false));
    if(bk.error) alert(bk.error.message); else setBookings(bk.data||[]);
    setLoading(false);
  })(); },[]);

  const roomById = useMemo(()=>Object.fromEntries(rooms.map(r=>[r.id,r])),[rooms]);
  const therapistById = useMemo(()=>Object.fromEntries(therapists.map(t=>[t.id,t])),[therapists]);

  // Utilization
  const utilization = useMemo(()=>{
    const mapLoc={}; const openLoc={};
    locations.forEach(l=>{mapLoc[l.id]=0; openLoc[l.id]=0;});
    days.forEach(d=>{
      const {start,end}=hoursFor(d);
      const openMins=(end-start)*60;
      rooms.forEach(r=>{
        if(filters.locationId && r.location_id!==filters.locationId) return;
        openLoc[r.location_id]+=openMins;
      });
      bookings.forEach(b=>{
        const s=new Date(b.start_time), e=new Date(b.end_time);
        if(s.toDateString()!==d.toDateString()) return;
        const r=roomById[b.room_id]; if(!r) return;
        if(filters.locationId && r.location_id!==filters.locationId) return;
        mapLoc[r.location_id]+=Math.max(0, (e-s)/60000);
      });
    });
    return {mapLoc, openLoc};
  },[days,rooms,bookings,locations,filters.locationId,roomById]);

  async function createBookingModal(){
    const name = prompt("Therapist name (must exist in Therapists list)");
    if(!name) return;
    const therapist = therapists.find(t=>t.display_name?.toLowerCase()===name.toLowerCase());
    if(!therapist) return alert("Therapist not found. Add them on the Therapists page.");

    const roomName = prompt("Room name (exact)");
    const room = rooms.find(r=>r.name?.toLowerCase()===roomName?.toLowerCase());
    if(!room) return alert("Room not found.");

    const when = prompt("Start (YYYY-MM-DD HH:MM, 24h)");
    const dur = prompt("Duration minutes (e.g. 60)");
    const recur = confirm("Repeat weekly for 8 weeks?");
    const start = new Date(when.replace(" ","T"));
    const end = new Date(start.getTime() + (Number(dur)||60)*60000);

    const series_id = crypto.randomUUID();
    let count = recur ? 8 : 1;
    let successes=0, skips=0;

    for(let i=0;i<count;i++){
      const s=new Date(start); s.setDate(s.getDate()+i*7);
      const e=new Date(end);   e.setDate(e.getDate()+i*7);

      // conflict check (room overlap)
      const { data: sameDay } = await supabase
        .from("bookings")
        .select("id,start_time,end_time")
        .eq("room_id", room.id);

      const conflict = (sameDay||[]).some(b=>{
        const bs=new Date(b.start_time), be=new Date(b.end_time);
        return rangeOverlap(s,e,bs,be);
      });
      if(conflict){ skips++; continue; }

      const { error } = await supabase.from("bookings").insert([{
        room_id: room.id,
        user_id: therapist.id,
        start_time: s.toISOString(),
        end_time: e.toISOString(),
        series_id: recur?series_id:null
      }]);
      if(error){ skips++; }
      else { successes++; }
    }

    alert(`${successes} added, ${skips} skipped due to conflicts.`);
    const refresh = await supabase.from("bookings").select("id,room_id,user_id,start_time,end_time,series_id");
    if(!refresh.error) setBookings(refresh.data||[]);
  }

  async function deleteBooking(b, all=false){
    if(all && b.series_id){
      if(!confirm("Delete ALL in this series?")) return;
      const {error}=await supabase.from("bookings").delete().eq("series_id",b.series_id);
      if(error) return alert(error.message);
    }else{
      if(!confirm("Delete this booking?")) return;
      const {error}=await supabase.from("bookings").delete().eq("id",b.id);
      if(error) return alert(error.message);
    }
    const refresh = await supabase.from("bookings").select("id,room_id,user_id,start_time,end_time,series_id");
    if(!refresh.error) setBookings(refresh.data||[]);
  }

  function entityList(){
    if(groupBy==="room"){
      let list = rooms;
      if(filters.locationId) list = list.filter(r=>r.location_id===filters.locationId);
      if(filters.roomId) list = list.filter(r=>r.id===filters.roomId);
      return list;
    }
    if(groupBy==="therapist"){
      let list = therapists;
      if(filters.therapistId) list = list.filter(t=>t.id===filters.therapistId);
      return list;
    }
    if(groupBy==="location"){
      return locations;
    }
    return [];
  }

  function labelFor(entity){
    if(groupBy==="room") return entity.name;
    if(groupBy==="therapist") return entity.display_name || "—";
    if(groupBy==="location") return entity.name;
  }

  // bookings keyed by day + entity
  function bookingsFor(day,entity){
    return bookings.filter(b=>{
      const s=new Date(b.start_time);
      if(s.toDateString()!==day.toDateString()) return false;
      if(groupBy==="room") return b.room_id===entity.id;
      if(groupBy==="therapist") return b.user_id===entity.id;
      if(groupBy==="location"){
        const r=roomById[b.room_id]; return r && r.location_id===entity.id;
      }
      return false;
    });
  }

  const timeHeader = (d)=>{
    const slots = slotsForDay(d);
    return (
      <div className="text-xs text-gray-600 flex gap-6 overflow-x-auto whitespace-nowrap">
        {slots.map((s,i)=><div key={i}>{fmt(s)}</div>)}
      </div>
    );
  };

  if(loading) return <div>Loading…</div>;

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Bookings</h1>
        <div className="flex gap-2">
          <button onClick={()=>setStartMonday(m=>{
            const x=new Date(m); x.setDate(x.getDate()-7); return x;
          })} className="px-3 py-2 border rounded-lg hover:bg-gray-50">◀ Prev</button>
          <button onClick={()=>setStartMonday(mondayOf(new Date()))} className="px-3 py-2 border rounded-lg hover:bg-gray-50">Today</button>
          <button onClick={()=>setStartMonday(m=>{
            const x=new Date(m); x.setDate(x.getDate()+7); return x;
          })} className="px-3 py-2 border rounded-lg hover:bg-gray-50">Next ▶</button>
          <button onClick={createBookingModal} className="px-3 py-2 rounded-lg bg-indigo-600 text-white">Create booking</button>
        </div>
      </div>

      {/* Filters */}
      <RowCard>
        <div className="grid md:grid-cols-5 grid-cols-2 gap-3 items-end">
          <div>
            <div className="text-xs text-gray-600 mb-1">Group by</div>
            <select value={groupBy} onChange={e=>setGroupBy(e.target.value)} className="w-full">
              <option value="room">Room</option>
              <option value="therapist">Therapist</option>
              <option value="location">Location</option>
            </select>
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">Location</div>
            <select value={filters.locationId} onChange={e=>setFilters(f=>({...f,locationId:e.target.value,roomId:""}))} className="w-full">
              <option value="">All locations</option>
              {locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">Room</div>
            <select value={filters.roomId} onChange={e=>setFilters(f=>({...f,roomId:e.target.value}))} className="w-full">
              <option value="">All rooms</option>
              {rooms.filter(r=>!filters.locationId || r.location_id===filters.locationId)
                .map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <div className="text-xs text-gray-600 mb-1">Therapist</div>
            <select value={filters.therapistId} onChange={e=>setFilters(f=>({...f,therapistId:e.target.value}))} className="w-full">
              <option value="">All therapists</option>
              {therapists.map(t=><option key={t.id} value={t.id}>{t.display_name||"—"}</option>)}
            </select>
          </div>
        </div>
      </RowCard>

      {/* Utilization */}
      <RowCard>
        <div className="font-medium mb-2">Utilization (current 2 weeks)</div>
        <div className="grid md:grid-cols-2 gap-3">
          {locations.map(l=>{
            const used=utilization.mapLoc[l.id]||0;
            const open=utilization.openLoc[l.id]||1;
            const pct=Math.round((used/open)*100);
            return (
              <div key={l.id}>
                <div className="flex justify-between text-sm">
                  <span>{l.name}</span><span>{isNaN(pct)?0:pct}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-lg overflow-hidden">
                  <div className="h-2" style={{width:`${Math.min(100,Math.max(0,pct))}%`,background:"#4f46e5"}}/>
                </div>
              </div>
            );
          })}
        </div>
      </RowCard>

      {/* Schedule */}
      <RowCard>
        <div className="font-medium mb-2">
          Schedule — {startMonday.toLocaleDateString()} to {new Date(startMonday.getTime()+11*86400000).toLocaleDateString()}
        </div>

        {days.map((d,idx)=>(
          <div key={idx} className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">{d.toLocaleDateString(undefined,{weekday:"long", month:"short", day:"numeric"})}</div>
              {timeHeader(d)}
            </div>

            <div className="grid gap-2">
              {entityList().map(entity=>{
                const dayBookings = bookingsFor(d,entity);
                return (
                  <div key={labelFor(entity)} className="border rounded-lg p-2 bg-white">
                    <div className="text-sm font-medium mb-2">{labelFor(entity)}</div>
                    <div className="flex flex-wrap gap-2">
                      {dayBookings.length===0 && <span className="text-xs text-gray-600">No bookings</span>}
                      {dayBookings.map(b=>{
                        const t = therapistById[b.user_id];
                        const color = t?.color || "#6366F1";
                        const s=new Date(b.start_time), e=new Date(b.end_time);
                        return (
                          <div key={b.id} className="px-2 py-1 rounded-lg shadow-sm text-xs"
                               style={{background: color+"20", border:`1px solid ${color}55`}}>
                            <span className="font-medium" style={{color}}>
                              {t?.display_name || "—"}
                            </span>{" "}
                            {fmt(s)}–{fmt(e)}
                            <span className="ml-2">
                              <button onClick={()=>deleteBooking(b,false)} className="text-gray-600 hover:text-indigo-600">Delete</button>
                              {b.series_id && <button onClick={()=>deleteBooking(b,true)} className="ml-2 text-red-700 hover:underline">Delete series</button>}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </RowCard>
    </div>
  );
}
