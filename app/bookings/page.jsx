"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { format, addMinutes, startOfWeek, endOfWeek, addDays, isSameDay, parseISO } from "date-fns";
import { motion } from "framer-motion";
import { Download, Plus, Trash2, Filter, Group, CalendarClock, Building2, X } from "lucide-react";
import { Card, CardHeader, CardContent, Button, PrimaryButton, DangerButton, Label, Input, Select, Textarea } from "../../components/ui/primitives";

// Business hours (Mon–Thu 9–20, Fri–Sat 9–16, Sun closed)
const HOURS = { 0:null, 1:[9,20], 2:[9,20], 3:[9,20], 4:[9,20], 5:[9,16], 6:[9,16] };

const colorForId = (id) => {
  let h=0; for (let i=0;i<(id?.length||0);i++) h=(h*31+id.charCodeAt(i))%360;
  return `hsl(${h} 70% 45%)`;
};

function exportCSV(bookings, therapists, rooms, locations) {
  const tmap = Object.fromEntries(therapists.map(t=>[t.id, t.name || t.email || "Therapist"]));
  const rmap = Object.fromEntries(rooms.map(r=>[r.id, r.name]));
  const lmap = Object.fromEntries(locations.map(l=>[l.id, l.name]));
  const rows = [
    ["Booking ID","Therapist","Room","Location","Start","End","Minutes","Notes"],
    ...bookings.map(b=>{
      const s=parseISO(b.start_time), e=parseISO(b.end_time);
      const mins=Math.max(0,(e-s)/60000);
      const room = rooms.find(r=>r.id===b.room_id);
      return [b.id, tmap[b.therapist_id]||"", rmap[b.room_id]||"", room? lmap[room.location_id]||"": "", b.start_time, b.end_time, mins, (b.notes||"").replace(/\n/g," ")];
    })
  ].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([rows], {type:"text/csv;charset=utf-8;"}); const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=`bookings-${format(new Date(),"yyyyMMdd-HHmm")}.csv`; a.click(); URL.revokeObjectURL(url);
}

export default function BookingsPage() {
  // master data
  const [locations, setLocations] = useState([]);
  const [roomsAll, setRoomsAll] = useState([]);
  const [therapists, setTherapists] = useState([]);

  // filters/state
  const [date, setDate] = useState(()=>format(new Date(),"yyyy-MM-dd"));
  const [locationId, setLocationId] = useState(null);
  const [roomId, setRoomId] = useState("");
  const [therapistFilterId, setTherapistFilterId] = useState("");
  const [groupBy, setGroupBy] = useState("room");
  const [range, setRange] = useState("week");

  // list data
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // modal
  const [open, setOpen] = useState(false);
  const [mTherapistId, setMTherapistId] = useState("");
  const [mRoomId, setMRoomId] = useState("");
  const [mStart, setMStart] = useState("");
  const [mEnd, setMEnd] = useState("");
  const [mNotes, setMNotes] = useState("");

  useEffect(() => {
    (async ()=>{
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href="/login"; return; }

      const [locs, rms, ths] = await Promise.all([
        supabase.from("locations").select("id,name").order("name"),
        supabase.from("rooms").select("id,name,location_id").order("name"),
        supabase.from("therapists").select("id,name,email,active").order("name")
      ]);

      setLocations(locs.data ?? []);
      setRoomsAll(rms.data ?? []);
      setTherapists((ths.data ?? []).filter(t=>t.active!==false));

      if (locs.data?.length) setLocationId(locs.data[0].id);
      setLoading(false);
    })();
  }, []);

  const day = useMemo(()=> new Date(date+"T00:00"), [date]);
  const weekDays = useMemo(()=>{
    if (range==="day") return [day];
    const start = startOfWeek(day,{weekStartsOn:1}); const end = endOfWeek(day,{weekStartsOn:1});
    const xs=[]; let d=start; while(d<=end){ xs.push(d); d=addDays(d,1) } return xs;
  },[range,day]);

  const roomsForLocation = useMemo(
    ()=>roomsAll.filter(r=> locationId ? r.location_id===Number(locationId) : true),
    [roomsAll,locationId]
  );
  useEffect(()=>{ if(!roomId && roomsForLocation.length) setRoomId(String(roomsForLocation[0].id)); },[roomsForLocation,roomId]);

  useEffect(()=>{
    (async()=>{
      if(!locationId){ setBookings([]); return; }
      const start = startOfWeek(day,{weekStartsOn:1});
      const end   = endOfWeek(day,{weekStartsOn:1}); end.setHours(23,59,59,999);
      const ids = roomsForLocation.map(r=>r.id);
      if(!ids.length){ setBookings([]); return; }
      const { data, error } = await supabase
        .from("bookings")
        .select("id,room_id,therapist_id,start_time,end_time,notes")
        .in("room_id", ids)
        .gte("start_time", start.toISOString())
        .lte("end_time", end.toISOString())
        .order("start_time");
      if(error) setErr(error.message); else setErr("");
      setBookings(data ?? []);
    })();
  },[locationId, roomsForLocation, day]);

  const therapistById = useMemo(()=>Object.fromEntries(therapists.map(t=>[t.id,t])),[therapists]);
  const roomById = useMemo(()=>Object.fromEntries(roomsAll.map(r=>[r.id,r])),[roomsAll]);

  const filtered = useMemo(()=>{
    return bookings.filter(b=>{
      const okTher = therapistFilterId ? b.therapist_id===therapistFilterId : true;
      const okRoom = roomId ? String(b.room_id)===String(roomId) : true;
      return okTher && (groupBy==="room" ? okRoom : true);
    });
  },[bookings, therapistFilterId, roomId, groupBy]);

  async function createBooking() {
    setErr("");
    if(!mTherapistId || !mRoomId || !mStart || !mEnd){ setErr("Please complete all required fields."); return; }
    if(new Date(mEnd) <= new Date(mStart)){ setErr("End time must be after start time."); return; }

    // conflict
    const { data: conflicts, error: cErr } = await supabase
      .from("bookings").select("id")
      .eq("room_id", Number(mRoomId))
      .or(`and(start_time.lt.${new Date(mEnd).toISOString()},end_time.gt.${new Date(mStart).toISOString()})`);
    if(cErr){ setErr(cErr.message); return; }
    if(conflicts?.length){ setErr("This room is already booked in that time range."); return; }

    const { error } = await supabase.from("bookings").insert({
      room_id: Number(mRoomId),
      therapist_id: mTherapistId,
      start_time: new Date(mStart).toISOString(),
      end_time: new Date(mEnd).toISOString(),
      notes: mNotes || null
    });
    if(error){ setErr(error.message); return; }

    setOpen(false);
    setMNotes(""); setMRoomId(""); setMTherapistId(""); setMStart(""); setMEnd("");
    // refresh
    const start = startOfWeek(day,{weekStartsOn:1});
    const end   = endOfWeek(day,{weekStartsOn:1}); end.setHours(23,59,59,999);
    const ids = roomsForLocation.map(r=>r.id);
    const { data } = await supabase
      .from("bookings").select("id,room_id,therapist_id,start_time,end_time,notes")
      .in("room_id", ids).gte("start_time", start.toISOString()).lte("end_time", end.toISOString())
      .order("start_time");
    setBookings(data ?? []);
  }

  async function deleteBooking(id){
    if(!confirm("Delete this booking?")) return;
    const { error } = await supabase.from("bookings").delete().eq("id", id);
    if(error){ alert(error.message); return; }
    setBookings(prev => prev.filter(b=>b.id!==id));
  }

  if (loading) return <div>Loading…</div>;

  return (
    <>
      {/* Top header row */}
      <div className="row" style={{justifyContent:"space-between", marginBottom:12}}>
        <div className="row">
          <Building2 size={24} color="var(--brand)" />
          <h1 style={{margin:0,fontSize:22,fontWeight:700}}>Elevation — Room & Therapist Scheduler</h1>
        </div>
        <div className="row">
          <PrimaryButton onClick={()=>{ setOpen(true); setErr(""); }}>
            <Plus size={16}/> Create booking
          </PrimaryButton>
          <Button onClick={()=>exportCSV(bookings, therapists, roomsAll, locations)}>
            <Download size={16}/> Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="row"><Filter size={18} color="var(--brand)"/><strong>Filters & View</strong></div>
          <div className="row"><Group size={18} color="#6b7280"/>
            <Select value={groupBy} onChange={e=>setGroupBy(e.target.value)} style={{width:170}}>
              <option value="room">Group by Room</option>
              <option value="therapist">Group by Therapist</option>
            </Select>
            <Select value={range} onChange={e=>setRange(e.target.value)} style={{width:140}}>
              <option value="day">Day view</option>
              <option value="week">Week view</option>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-6">
            <div className="grid" style={{gridColumn:"span 2"}}>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={e=>setDate(e.target.value)}/>
            </div>
            <div className="grid">
              <Label>Location</Label>
              <Select value={locationId ?? ""} onChange={e=>{ setLocationId(e.target.value); setRoomId(""); }}>
                {locations.map(l=> <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </div>
            <div className="grid">
              <Label>Room</Label>
              <Select value={roomId} onChange={e=>setRoomId(e.target.value)}>
                {roomsForLocation.map(r=> <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </div>
            <div className="grid" style={{gridColumn:"span 2"}}>
              <Label>Therapist filter</Label>
              <Select value={therapistFilterId} onChange={e=>setTherapistFilterId(e.target.value)}>
                <option value="">All therapists</option>
                {therapists.map(t=> <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schedule */}
      <Card style={{marginTop:12}}>
        <CardHeader>
          <div className="row">
            <CalendarClock size={18} color="var(--brand)"/>
            <strong>
              Schedule — {range==="day" ? format(day,"EEE, MMM d") : `${format(weekDays[0],"MMM d")} – ${format(weekDays[6],"MMM d")}`}
            </strong>
          </div>
        </CardHeader>
        <CardContent>
          {weekDays.map((d)=>(
            <DayGrid key={d.toISOString()}
              theDay={d}
              groupBy={groupBy}
              rooms={roomsForLocation}
              therapists={therapists}
              roomById={roomById}
              therapistById={therapistById}
              bookings={filtered}
              roomFilter={roomId}
              therapistFilter={therapistFilterId}
              onDelete={deleteBooking}
            />
          ))}
        </CardContent>
      </Card>

      {err && (
        <div className="card" style={{marginTop:12}}>
          <div className="card__body" style={{color:"#b91c1c"}}>{err}</div>
        </div>
      )}

      {/* Create modal */}
      {open && (
        <div className="modal-backdrop" onClick={()=>setOpen(false)}>
          <div className="modal" onClick={(e)=>e.stopPropagation()}>
            <div className="modal__head row" style={{justifyContent:"space-between"}}>
              <div>New Booking</div>
              <Button onClick={()=>setOpen(false)}><X size={16}/></Button>
            </div>
            <div className="modal__body">
              <div className="grid grid-2">
                <div className="grid">
                  <Label>Therapist *</Label>
                  <Select value={mTherapistId} onChange={e=>setMTherapistId(e.target.value)}>
                    <option value="">Select therapist</option>
                    {therapists.map(t=> <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
                  </Select>
                </div>
                <div className="grid">
                  <Label>Room *</Label>
                  <Select value={mRoomId} onChange={e=>setMRoomId(e.target.value)}>
                    <option value="">Select room</option>
                    {roomsForLocation.map(r=> <option key={r.id} value={r.id}>{r.name}</option>)}
                  </Select>
                </div>
                <div className="grid">
                  <Label>Start *</Label>
                  <Input type="datetime-local" value={mStart} onChange={e=>setMStart(e.target.value)} />
                </div>
                <div className="grid">
                  <Label>End *</Label>
                  <Input type="datetime-local" value={mEnd} onChange={e=>setMEnd(e.target.value)} />
                </div>
                <div className="grid" style={{gridColumn:"span 2"}}>
                  <Label>Notes</Label>
                  <Textarea rows={3} value={mNotes} onChange={e=>setMNotes(e.target.value)} placeholder="Optional" />
                </div>
              </div>
            </div>
            <div className="modal__foot">
              <Button onClick={()=>setOpen(false)}>Cancel</Button>
              <PrimaryButton onClick={createBooking}>Save booking</PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DayGrid({
  theDay, groupBy, rooms, therapists, therapistById, roomById,
  bookings, roomFilter, therapistFilter, onDelete
}) {
  const slotMinutes = 30;
  const slots = useMemo(()=>{
    const span = HOURS[theDay.getDay()];
    if(!span) return [];
    const [open, close] = span;
    const list=[]; let t=new Date(theDay); t.setHours(open,0,0,0);
    const end=new Date(theDay); end.setHours(close,0,0,0);
    while(t<end){ list.push(new Date(t)); t=addMinutes(t,slotMinutes) }
    return list;
  },[theDay]);

  const groups = useMemo(()=>{
    if(groupBy==="room"){ return rooms.filter(r=> roomFilter ? String(r.id)===String(roomFilter) : true); }
    return therapists.filter(t=> therapistFilter ? t.id===therapistFilter : true);
  },[groupBy, rooms, therapists, roomFilter, therapistFilter]);

  const isInCell = (b, cellStart, cellEnd) => {
    const s=parseISO(b.start_time), e=parseISO(b.end_time);
    return isSameDay(s, theDay) && e>cellStart && s<cellEnd;
  };

  return (
    <div style={{marginBottom:18}}>
      {slots.length===0 ? (
        <div style={{color:"var(--muted)", marginBottom:8}}>{format(theDay,"EEEE, MMM d")} — Closed</div>
      ) : (
        <div style={{color:"var(--muted)", fontWeight:600, marginBottom:8}}>{format(theDay,"EEEE, MMM d")}</div>
      )}

      {slots.length>0 && (
        <div style={{overflowX:"auto"}}>
          <table className="table">
            <thead>
              <tr>
                <th className="sticky" style={{width:180}}>{groupBy==="room" ? "Room" : "Therapist"}</th>
                {slots.map((s,i)=>(
                  <th key={i}>{format(s,"h:mma")}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((entity)=>(
                <tr key={entity.id}>
                  <td className="sticky" style={{fontWeight:600}}>
                    {groupBy==="room" ? entity.name : (entity.name || entity.email)}
                  </td>
                  {slots.map((s,idx)=>{
                    const cellStart=s; const cellEnd=addMinutes(s,30);
                    const rowBookings = bookings.filter(b=>{
                      if(groupBy==="room") return String(b.room_id)===String(entity.id) && isInCell(b,cellStart,cellEnd);
                      return b.therapist_id===entity.id && isInCell(b,cellStart,cellEnd);
                    });
                    return (
                      <td key={idx} style={{position:"relative", height:48}}>
                        {rowBookings.map(b=>{
                          const t = therapistById[b.therapist_id];
                          const color = colorForId(b.therapist_id);
                          return (
                            <motion.div key={b.id} layout
                              className="badge"
                              style={{
                                position:"absolute", inset:4, border:`1px solid ${color}66`,
                                background:`${color}15`, color:"#111", borderRadius:12,
                                display:"flex", flexDirection:"column", alignItems:"start"
                              }}
                              title={`${format(parseISO(b.start_time),"h:mma")} – ${format(parseISO(b.end_time),"h:mma")}`}
                            >
                              <div style={{fontWeight:600}}>
                                {groupBy==="room" ? (t?.name || t?.email || "Therapist") : (roomById[b.room_id]?.name || "Room")}
                              </div>
                              <div style={{fontSize:12, opacity:.75}}>
                                {format(parseISO(b.start_time),"h:mma")}–{format(parseISO(b.end_time),"h:mma")}
                              </div>
                              {b.notes && <div style={{fontSize:12, opacity:.7}}>{b.notes}</div>}
                              <div style={{position:"absolute", right:6, top:6}}>
                                <DangerButton className="btn--sm" onClick={()=>onDelete(b.id)}>
                                  <Trash2 size={14}/>
                                </DangerButton>
                              </div>
                            </motion.div>
                          );
                        })}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
