"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  format, addMinutes, startOfWeek, addDays, endOfDay, parseISO, isSameDay
} from "date-fns";
import { motion } from "framer-motion";
import { Download, Plus, Trash2, Filter, Group, CalendarClock, Building2, X } from "lucide-react";

/* ----------------------------- Lightweight UI ------------------------------ */
const Button = ({ className="", children, ...p }) => (
  <button className={`btn ${className}`} {...p}>{children}</button>
);
const PrimaryButton = (p) => <Button className="btn--primary" {...p} />;
const DangerButton = (p) => <Button className="btn--danger" {...p} />;
const Label = ({children}) => <label className="label">{children}</label>;
const Input = (p) => <input className="input" {...p} />;
const Textarea = (p) => <textarea className="textarea" {...p} />;
const Select = (p) => <select className="select" {...p} />;

const Card = ({children, style}) => <div className="card" style={style}>{children}</div>;
const CardHeader = ({children}) => <div className="card__head">{children}</div>;
const CardContent = ({children}) => <div className="card__body">{children}</div>;

/* ----------------------------- Business Hours ------------------------------ */
/* Mon–Thu 9–20, Fri–Sat 9–16, Sun closed */
const HOURS = { 0:null, 1:[9,20], 2:[9,20], 3:[9,20], 4:[9,20], 5:[9,16], 6:[9,16] };

/* ---------------------------- Helpers / Colors ----------------------------- */
const colorForId = (id) => {
  let h=0; for (let i=0;i<(id?.length||0);i++) h=(h*31+id.charCodeAt(i))%360;
  return `hsl(${h} 70% 45%)`;
};

// Two-week (Mon–Sat) window starting this week
function getTwoWeekDays() {
  const start = startOfWeek(new Date(), { weekStartsOn: 1 }); // Monday
  const days = [];
  for (let w = 0; w < 2; w++) {
    for (let d = 0; d < 6; d++) { // Mon..Sat (skip Sunday)
      days.push(addDays(start, w * 7 + d));
    }
  }
  return days;
}

function exportCSV(bookings, therapists, rooms, locations) {
  const tmap = Object.fromEntries(therapists.map(t=>[t.id, t.name || t.email || "Therapist"]));
  const rmap = Object.fromEntries(rooms.map(r=>[r.id, r.name]));
  const lmap = Object.fromEntries(locations.map(l=>[l.id, l.name]));
  const rows = [
    ["Booking ID","Series ID","Therapist","Room","Location","Start","End","Minutes","Notes"],
    ...bookings.map(b=>{
      const s=parseISO(b.start_time), e=parseISO(b.end_time);
      const mins=Math.max(0,(e-s)/60000);
      const room = rooms.find(r=>r.id===b.room_id);
      return [
        b.id, b.series_id || "",
        tmap[b.therapist_id]||"",
        rmap[b.room_id]||"",
        room ? lmap[room.location_id]||"" : "",
        b.start_time, b.end_time, mins,
        (b.notes||"").replace(/\n/g," ")
      ];
    })
  ].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([rows], {type:"text/csv;charset=utf-8;"}); const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=`bookings-${format(new Date(),"yyyyMMdd-HHmm")}.csv`; a.click(); URL.revokeObjectURL(url);
}

/* =============================== Page Component ============================= */
export default function BookingsPage() {
  // master data
  const [locations, setLocations] = useState([]);
  const [roomsAll, setRoomsAll] = useState([]);
  const [therapists, setTherapists] = useState([]);

  // filters
  const [locationId, setLocationId] = useState(""); // "" = All
  const [roomId, setRoomId] = useState("");
  const [therapistFilterId, setTherapistFilterId] = useState("");
  const [groupBy, setGroupBy] = useState("room"); // room | therapist | location

  // data
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // create modal state
  const [open, setOpen] = useState(false);
  const [mTherapistId, setMTherapistId] = useState("");
  const [mRoomId, setMRoomId] = useState("");
  const [mStart, setMStart] = useState("");
  const [mEnd, setMEnd] = useState("");
  const [mNotes, setMNotes] = useState("");

  // recurrence: "none" | "weekly" | "biweekly"
  const [repeatMode, setRepeatMode] = useState("none");
  const [repeatUntil, setRepeatUntil] = useState(""); // yyyy-MM-dd
  const [replaceConflicts, setReplaceConflicts] = useState(false);

  // fixed day window
  const weekDays = useMemo(() => getTwoWeekDays(), []);

  useEffect(() => {
    (async ()=>{
      const { data: { session} } = await supabase.auth.getSession();
      if (!session) { window.location.href="/login"; return; }

      const [locs, rms, ths] = await Promise.all([
        supabase.from("locations").select("id,name").order("name"),
        supabase.from("rooms").select("id,name,location_id").order("name"),
        supabase.from("therapists").select("id,name,email,active").order("name")
      ]);

      setLocations(locs.data ?? []);
      setRoomsAll(rms.data ?? []);
      setTherapists((ths.data ?? []).filter(t=>t.active!==false));
      setLoading(false);
    })();
  }, []);

  const roomsForLocation = useMemo(()=>{
    if(!locationId) return roomsAll; // all locations
    return roomsAll.filter(r=> String(r.location_id)===String(locationId));
  },[roomsAll, locationId]);

  useEffect(()=>{ // auto-pick a room when location changes
    if(!roomId && roomsForLocation.length) setRoomId(String(roomsForLocation[0].id));
  },[roomsForLocation,roomId]);

  // Fetch bookings for the two-week window
  useEffect(()=>{
    (async()=>{
      if (roomsAll.length===0) return;

      const start = new Date(weekDays[0]); start.setHours(0,0,0,0);
      const end   = endOfDay(weekDays[weekDays.length - 1]);

      const ids = (locationId
        ? roomsAll.filter(r=>String(r.location_id)===String(locationId))
        : roomsAll
      ).map(r=>r.id);

      if(ids.length===0){ setBookings([]); return; }

      const { data, error } = await supabase
        .from("bookings")
        .select("id,series_id,room_id,therapist_id,start_time,end_time,notes,recur_weekly,recur_until")
        .in("room_id", ids)
        .gte("start_time", start.toISOString())
        .lte("end_time", end.toISOString())
        .order("start_time");

      setErr(error?.message || "");
      setBookings(data ?? []);
    })();
  },[locationId, roomsAll, weekDays]);

  const therapistById = useMemo(()=>Object.fromEntries(therapists.map(t=>[t.id,t])),[therapists]);
  const roomById = useMemo(()=>Object.fromEntries(roomsAll.map(r=>[r.id,r])),[roomsAll]);

  const filtered = useMemo(()=>{
    return bookings.filter(b=>{
      const okTher = therapistFilterId ? b.therapist_id===therapistFilterId : true;
      const okRoom = roomId ? String(b.room_id)===String(roomId) : true;
      return okTher && okRoom;
    });
  },[bookings, therapistFilterId, roomId]);

  /* ------------------------------- Create booking ---------------------------- */
  async function createBooking() {
    setErr("");
    if(!mTherapistId || !mRoomId || !mStart || !mEnd){ setErr("Please complete all required fields."); return; }
    if(new Date(mEnd) <= new Date(mStart)){ setErr("End time must be after start time."); return; }

    const seriesId = repeatMode !== "none" ? crypto.randomUUID() : null;

    const occurrences = [];
    const start0 = new Date(mStart);
    const end0   = new Date(mEnd);

    if (repeatMode === "none") {
      occurrences.push([start0, end0]);
    } else {
      if (!repeatUntil) { setErr("Select an 'until' date for repeating."); return; }
      const until = new Date(repeatUntil + "T23:59");
      let s = new Date(start0), e = new Date(end0);
      const stepDays = repeatMode === "weekly" ? 7 : 14;
      while (s <= until) {
        occurrences.push([new Date(s), new Date(e)]);
        s = addDays(s, stepDays);
        e = addDays(e, stepDays);
      }
    }

    let created = 0, skipped = 0;
    for (const [s, e] of occurrences) {
      // Reliable overlap test:
      // conflict exists when NOT (existing.end <= s OR existing.start >= e)
      const { data: conflicts, error: cErr } = await supabase
        .from("bookings")
        .select("id")
        .eq("room_id", Number(mRoomId))
        .not("end_time", "lte", s.toISOString())
        .not("start_time", "gte", e.toISOString());

      if (cErr) { setErr(cErr.message); return; }

      if (conflicts?.length) {
        if (replaceConflicts) {
          const ids = conflicts.map(c => c.id);
          const { error: delErr } = await supabase.from("bookings").delete().in("id", ids);
          if (delErr) { setErr(delErr.message); return; }
        } else {
          skipped++;
          continue;
        }
      }

      const { error } = await supabase.from("bookings").insert({
        room_id: Number(mRoomId),
        therapist_id: mTherapistId,
        start_time: s.toISOString(),
        end_time: e.toISOString(),
        notes: mNotes || null,
        series_id: seriesId,
        recur_weekly: repeatMode === "weekly",
        recur_until: seriesId ? format(occurrences.at(-1)[1], "yyyy-MM-dd") : null
      });
      if (error) { setErr(error.message); return; }
      created++;
    }

    setOpen(false);
    setMNotes(""); setMRoomId(""); setMTherapistId(""); setMStart(""); setMEnd("");
    setRepeatMode("none"); setRepeatUntil(""); setReplaceConflicts(false);

    // Refresh
    const start = new Date(weekDays[0]); start.setHours(0,0,0,0);
    const end   = endOfDay(weekDays[weekDays.length - 1]);
    const ids = (locationId ? roomsAll.filter(r=>String(r.location_id)===String(locationId)) : roomsAll).map(r=>r.id);
    const { data } = await supabase
      .from("bookings").select("id,series_id,room_id,therapist_id,start_time,end_time,notes,recur_weekly,recur_until")
      .in("room_id", ids).gte("start_time", start.toISOString()).lte("end_time", end.toISOString())
      .order("start_time");
    setBookings(data ?? []);

    if (skipped > 0) alert(`${created} added, ${skipped} skipped due to conflicts.`);
  }

  async function deleteBooking(id, seriesId){
    if (seriesId) {
      const choice = window.prompt("Type 'one' to delete only this event, or 'all' to delete the entire series:", "one");
      if (!choice) return;
      if (choice.toLowerCase()==="all") {
        const { error } = await supabase.from("bookings").delete().eq("series_id", seriesId);
        if (error) { alert(error.message); return; }
        setBookings(prev => prev.filter(b=>b.series_id!==seriesId));
        return;
      }
    }
    const { error } = await supabase.from("bookings").delete().eq("id", id);
    if(error){ alert(error.message); return; }
    setBookings(prev => prev.filter(b=>b.id!==id));
  }

  if (loading) return <div style={{padding:16}}>Loading…</div>;

  return (
    <>
      {/* Top header */}
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
            <Select value={groupBy} onChange={e=>setGroupBy(e.target.value)} style={{width:190}}>
              <option value="room">Group by Room</option>
              <option value="therapist">Group by Therapist</option>
              <option value="location">Group by Location</option>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-6">
            <div className="grid">
              <Label>Location</Label>
              <Select value={locationId} onChange={e=>{ setLocationId(e.target.value); setRoomId(""); }}>
                <option value="">All locations</option>
                {locations.map(l=> <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </div>
            <div className="grid">
              <Label>Room</Label>
              <Select value={roomId} onChange={e=>setRoomId(e.target.value)}>
                <option value="">All rooms</option>
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
              Schedule — {format(weekDays[0], "MMM d")} – {format(weekDays[weekDays.length - 1], "MMM d")}
            </strong>
          </div>
        </CardHeader>
        <CardContent>
          {weekDays.map((d)=>(
            <DayGrid key={d.toISOString()}
              theDay={d}
              groupBy={groupBy}
              locations={locations}
              rooms={roomsForLocation}
              therapists={therapists}
              bookings={filtered}
              roomById={roomById}
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

                <div className="grid" style={{gridColumn:"span 2"}}>
                  <Label>Repeat</Label>
                  <Select value={repeatMode} onChange={(e)=>setRepeatMode(e.target.value)}>
                    <option value="none">Do not repeat</option>
                    <option value="weekly">Repeat weekly</option>
                    <option value="biweekly">Repeat every 2 weeks</option>
                  </Select>
                </div>
                {repeatMode !== "none" && (
                  <div className="grid" style={{gridColumn:"span 2"}}>
                    <Label>Repeat until</Label>
                    <Input type="date" value={repeatUntil} onChange={e=>setRepeatUntil(e.target.value)} />
                  </div>
                )}

                <div className="grid" style={{gridColumn:"span 2"}}>
                  <label className="label" style={{display:"flex", alignItems:"center", gap:8}}>
                    <input type="checkbox" checked={replaceConflicts} onChange={e=>setReplaceConflicts(e.target.checked)} />
                    Replace conflicts (delete overlapping bookings first)
                  </label>
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

      {/* Styles */}
      <style jsx global>{`
        :root { --brand:#4f46e5; --muted:#6b7280; }
        .row { display:flex; align-items:center; gap:8px; }
        .card { background:#fff; border:1px solid #e5e7eb; border-radius:14px; box-shadow:0 1px 1px rgba(0,0,0,.02); }
        .card__head { padding:12px 16px; border-bottom:1px solid #eef1f4; display:flex; align-items:center; justify-content:space-between; }
        .card__body { padding:16px; }
        .btn { padding:8px 12px; border:1px solid #e5e7eb; border-radius:12px; background:#fff; cursor:pointer; }
        .btn:hover{ box-shadow:0 2px 8px rgba(0,0,0,.06); }
        .btn--primary{ background:var(--brand); color:#fff; border-color:var(--brand); }
        .btn--primary:hover{ filter:brightness(.95); }
        .btn--danger{ background:#fee2e2; border-color:#fecaca; }
        .btn--sm{ padding:4px 8px; }

        .label{ font-size:12px; color:#6b7280; margin-bottom:4px; }
        .input,.select,.textarea{ width:100%; padding:8px 10px; border:1px solid #d1d5db; border-radius:10px; background:#fff; }
        .textarea{ min-height:80px; }

        .grid{ display:grid; gap:8px; }
        .grid-2{ grid-template-columns: repeat(2, minmax(0,1fr)); }
        .grid-6{ grid-template-columns: repeat(6, minmax(0,1fr)); }
        @media (max-width:900px){ .grid-6{ grid-template-columns: repeat(2, minmax(0,1fr)); } }

        .schedule-wrap { overflow-x:auto; }
        table.table { border-collapse: separate; border-spacing:0; min-width:100%; table-layout:fixed; }
        .table th, .table td{
          border-bottom:1px solid #eef1f4; padding:8px 10px; font-size:12px;
          white-space:nowrap; text-align:center;
        }
        /* fixed widths for time columns — prevents bunching */
        .table th.time, .table td.time {
          min-width: 96px;
          width: 96px;
          display: inline-block;
          border-right: 1px solid #eef1f4;
        }
        .table th.first, .table td.first {
          position:sticky; left:0; background:#fff; z-index:2;
          min-width: 200px; text-align:left; border-right:1px solid #eef1f4;
        }

        .modal-backdrop{ position:fixed; inset:0; background:rgba(0,0,0,.35); display:flex; align-items:center; justify-content:center; z-index:50; }
        .modal{ width:min(700px, 92vw); background:#fff; border-radius:16px; overflow:hidden; }
        .modal__head{ padding:12px 16px; border-bottom:1px solid #eef1f4; }
        .modal__body{ padding:14px 16px; }
        .modal__foot{ padding:12px 16px; border-top:1px solid #eef1f4; display:flex; gap:8px; justify-content:flex-end; }
      `}</style>
    </>
  );
}

/* ---------------------------- Day Grid (scheduler) --------------------------- */
function DayGrid({ theDay, groupBy, locations, rooms, therapists, bookings, roomById, onDelete }) {
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
    if(groupBy==="room") return rooms;
    if(groupBy==="therapist") return therapists;
    return locations; // group by location
  },[groupBy, rooms, therapists, locations]);

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
        <div className="schedule-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="first">
                  {groupBy==="room" ? "Room" : groupBy==="therapist" ? "Therapist" : "Location"}
                </th>
                {slots.map((s,i)=>(
                  <th key={i} className="time">{format(s,"h:mma")}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((entity)=>(
                <tr key={entity.id || entity.name}>
                  <td className="first" style={{fontWeight:600}}>
                    {groupBy==="room" ? entity.name :
                     groupBy==="therapist" ? (entity.name || entity.email) :
                     entity.name}
                  </td>
                  {slots.map((s,idx)=>{
                    const cellStart=s; const cellEnd=addMinutes(s,30);

                    const rowBookings = bookings.filter(b=>{
                      if(groupBy==="room") {
                        return String(b.room_id)===String(entity.id) && isInCell(b,cellStart,cellEnd);
                      } else if(groupBy==="therapist") {
                        return b.therapist_id===entity.id && isInCell(b,cellStart,cellEnd);
                      } else {
                        const room = roomById[b.room_id];
                        return room && room.location_id===entity.id && isInCell(b,cellStart,cellEnd);
                      }
                    });

                    return (
                      <td key={idx} className="time" style={{position:"relative", height:50}}>
                        {rowBookings.map(b=>{
                          const color = colorForId(String(b.therapist_id));
                          const therapist = therapists.find(t=>t.id===b.therapist_id);
                          const tName = therapist?.name || therapist?.email || "Therapist";
                          return (
                            <motion.div key={b.id} layout
                              style={{
                                position:"absolute", inset:4, border:`1px solid ${color}66`,
                                background:`${color}15`, color:"#111", borderRadius:12,
                                display:"flex", flexDirection:"column", alignItems:"start", padding:"4px 8px"
                              }}
                              title={`${format(parseISO(b.start_time),"h:mma")} – ${format(parseISO(b.end_time),"h:mma")}`}
                            >
                              <div style={{fontWeight:600}}>{tName}</div>
                              <div style={{fontSize:12, opacity:.75}}>
                                {format(parseISO(b.start_time),"h:mma")}–{format(parseISO(b.end_time),"h:mma")}
                              </div>
                              {b.notes && <div style={{fontSize:12, opacity:.7}}>{b.notes}</div>}
                              <div style={{position:"absolute", right:6, top:6, display:"flex", gap:6}}>
                                <DangerButton className="btn--sm" onClick={()=>onDelete(b.id, b.series_id)}>
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
