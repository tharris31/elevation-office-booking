"use client";
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { format, addMinutes, startOfWeek, endOfWeek, addDays, isSameDay, parseISO } from "date-fns";
import { motion } from "framer-motion";
import { Download, Plus, Trash2, Filter, Group, CalendarClock, Building2 } from "lucide-react";
import { Button, Input, Select, Label, Card, CardHeader, CardContent } from "../../components/ui/primitives";

// ---- business hours for utilization (Mon–Thu 9–20, Fri–Sat 9–16; Sun closed)
const HOURS = { 0:null, 1:[9,20], 2:[9,20], 3:[9,20], 4:[9,20], 5:[9,16], 6:[9,16] };

// color by stable id
const colorForId = (id) => {
  let h=0; for (let i=0;i<(id?.length||0);i++) h=(h*31+id.charCodeAt(i))%360;
  return `hsl(${h} 70% 45%)`;
};

function exportCSV(bookings, therapists, rooms, locations) {
  const tmap = Object.fromEntries(therapists.map((t)=>[t.id, t.name || t.email || "Therapist"]));
  const rmap = Object.fromEntries(rooms.map((r)=>[r.id, r.name]));
  const lmap = Object.fromEntries(locations.map((l)=>[l.id, l.name]));
  const rows = [
    ["Booking ID","Therapist","Room","Location","Start","End","Minutes","Notes"],
    ...bookings.map(b=>{
      const s = parseISO(b.start_time);
      const e = parseISO(b.end_time);
      const mins = Math.max(0,(e-s)/60000);
      const room = rooms.find(r=>r.id===b.room_id);
      return [b.id, tmap[b.therapist_id]||"", rmap[b.room_id]||"", room? lmap[room.location_id]||"" : "", b.start_time, b.end_time, mins, (b.notes||"").replace(/\n/g," ")];
    })
  ].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([rows], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=`bookings-${format(new Date(),"yyyyMMdd-HHmm")}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export default function BookingsPretty() {
  // master data from Supabase
  const [locations, setLocations] = useState([]);
  const [roomsAll, setRoomsAll] = useState([]);
  const [therapists, setTherapists] = useState([]); // from public.therapists

  // selections/filters
  const [date, setDate] = useState(() => format(new Date(),"yyyy-MM-dd"));
  const [locationId, setLocationId] = useState(null);
  const [roomId, setRoomId] = useState("");
  const [therapistFilterId, setTherapistFilterId] = useState("");
  const [groupBy, setGroupBy] = useState("room"); // "room" | "therapist"
  const [range, setRange] = useState("day"); // "day" | "week"

  // create form
  const [assignTherapistId, setAssignTherapistId] = useState("");
  const [startISO, setStartISO] = useState("");
  const [endISO, setEndISO] = useState("");
  const [notes, setNotes] = useState("");

  // data
  const [bookings, setBookings] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(true);

  // session + initial load
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = "/login"; return; }

      const [locs, rms, ths] = await Promise.all([
        supabase.from("locations").select("id,name").order("name"),
        supabase.from("rooms").select("id,name,location_id").order("name"),
        supabase.from("therapists").select("id,name,email,active").order("name")
      ]);

      setLocations(locs.data ?? []);
      setRoomsAll(rms.data ?? []);
      setTherapists((ths.data ?? []).filter(t=>t.active!==false));

      // default location/room
      if (locs.data?.length) setLocationId(locs.data[0].id);
      setLoading(false);
    })();
  }, []);

  const day = useMemo(()=> new Date(date+"T00:00"), [date]);
  const weekDays = useMemo(()=>{
    if (range==="day") return [day];
    const start = startOfWeek(day, {weekStartsOn:1}); // Monday
    const end   = endOfWeek(day, {weekStartsOn:1});
    const arr = []; let d = start;
    while (d <= end) { arr.push(d); d = addDays(d,1); }
    return arr;
  }, [range, day]);

  const roomsForLocation = useMemo(
    () => roomsAll.filter(r => locationId ? r.location_id === Number(locationId) : true),
    [roomsAll, locationId]
  );

  useEffect(() => {
    // choose first room in location if none chosen
    if (!roomId && roomsForLocation.length) setRoomId(String(roomsForLocation[0].id));
  }, [roomsForLocation, roomId]);

  // load bookings for the current week range for this location
  useEffect(() => {
    (async () => {
      if (!locationId) { setBookings([]); return; }
      const start = startOfWeek(day, {weekStartsOn:1});
      const end   = endOfWeek(day, {weekStartsOn:1}); end.setHours(23,59,59,999);
      const ids = roomsForLocation.map(r=>r.id);
      if (!ids.length) { setBookings([]); return; }
      const { data, error } = await supabase
        .from("bookings")
        .select("id,room_id,therapist_id,start_time,end_time,notes")
        .in("room_id", ids)
        .gte("start_time", start.toISOString())
        .lte("end_time", end.toISOString())
        .order("start_time");
      if (error) setErrorMsg(error.message);
      setBookings(data ?? []);
    })();
  }, [locationId, roomsForLocation, day]);

  const therapistById = useMemo(() => {
    const m = new Map(); therapists.forEach(t=>m.set(t.id, t)); return m;
  }, [therapists]);

  const roomById = useMemo(() => {
    const m = new Map(); roomsAll.forEach(r=>m.set(r.id, r)); return m;
  }, [roomsAll]);

  const filteredBookings = useMemo(() => {
    return bookings.filter(b => {
      const okTher = therapistFilterId ? b.therapist_id === therapistFilterId : true;
      const okRoom = roomId ? String(b.room_id) === String(roomId) : true;
      if (groupBy==="room") return okTher && okRoom;
      return okTher; // therapist view ignores specific room filter
    });
  }, [bookings, therapistFilterId, roomId, groupBy]);

  // Utilization (clips to business hours)
  const daySpanMinutes = (d) => {
    const span = HOURS[d.getDay()];
    if (!span) return 0;
    return (span[1]-span[0]) * 60;
  };
  const utilizationToday = useMemo(() => {
    const minutesOpenPerRoom = daySpanMinutes(day);
    const roomsInLoc = roomsForLocation.length;
    if (!roomsInLoc || !minutesOpenPerRoom) return { byLocationPct: 0, byRoom: new Map() };

    const byRoom = new Map(roomsForLocation.map(r=>[r.id, 0]));
    bookings.forEach(b => {
      const s = new Date(b.start_time), e = new Date(b.end_time);
      if (!isSameDay(s, day)) return;
      const span = HOURS[day.getDay()];
      if (!span) return;
      const bs = new Date(day); bs.setHours(span[0],0,0,0);
      const be = new Date(day); be.setHours(span[1],0,0,0);
      const start = new Date(Math.max(s, bs)), end = new Date(Math.min(e, be));
      const mins = Math.max(0, (end - start)/60000);
      if (mins > 0 && byRoom.has(b.room_id)) byRoom.set(b.room_id, byRoom.get(b.room_id)+mins);
    });

    let used = 0; byRoom.forEach(v=> used += v);
    const capacity = minutesOpenPerRoom * roomsInLoc;
    const pct = capacity ? Math.round((used/capacity)*100) : 0;
    return { byLocationPct: pct, byRoom };
  }, [bookings, day, roomsForLocation]);

  async function createBooking() {
    setErrorMsg("");
    if (!assignTherapistId) return setErrorMsg("Choose therapist.");
    if (!roomId) return setErrorMsg("Choose room.");
    if (!startISO || !endISO) return setErrorMsg("Pick start/end.");

    const start = new Date(startISO);
    const end   = new Date(endISO);
    if (end <= start) return setErrorMsg("End must be after start.");

    // conflict check for the room
    const { data: conflicts, error: cErr } = await supabase
      .from("bookings")
      .select("id")
      .eq("room_id", Number(roomId))
      .or(`and(start_time.lt.${end.toISOString()},end_time.gt.${start.toISOString()})`);
    if (cErr) return setErrorMsg(cErr.message);
    if (conflicts?.length) return setErrorMsg("Time conflicts with an existing booking.");

    const { error } = await supabase.from("bookings").insert({
      room_id: Number(roomId),
      therapist_id: assignTherapistId,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      notes: notes || null
    });
    if (error) return setErrorMsg(error.message);

    setAssignTherapistId(""); setStartISO(""); setEndISO(""); setNotes("");
    // reload
    const ids = roomsForLocation.map(r=>r.id);
    const startW = startOfWeek(day, {weekStartsOn:1});
    const endW   = endOfWeek(day, {weekStartsOn:1}); endW.setHours(23,59,59,999);
    const { data } = await supabase
      .from("bookings").select("id,room_id,therapist_id,start_time,end_time,notes")
      .in("room_id", ids).gte("start_time", startW.toISOString()).lte("end_time", endW.toISOString())
      .order("start_time");
    setBookings(data ?? []);
  }

  async function deleteBooking(id) {
    if (!confirm("Delete this booking?")) return;
    const { error } = await supabase.from("bookings").delete().eq("id", id);
    if (error) return alert(error.message);
    setBookings(prev => prev.filter(b => b.id !== id));
  }

  if (loading) return <div className="container">Loading…</div>;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-5">
      <div className="max-w-7xl mx-auto grid gap-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Building2 className="h-6 w-6 text-indigo-600" />
            <h1 className="text-xl font-semibold">Elevation — Room & Therapist Scheduler</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button className="bg-indigo-600 text-white" onClick={createBooking}>
              <Plus className="h-4 w-4 mr-1 inline" /> Create booking
            </Button>
            <Button onClick={() => exportCSV(bookings, therapists, roomsAll, locations)}>
              <Download className="h-4 w-4 mr-1 inline" /> Export CSV
            </Button>
          </div>
        </div>

        {/* Filters & view */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-indigo-600" />
              <span className="font-medium">Filters & View</span>
            </div>
            <div className="flex items-center gap-2">
              <Group className="h-5 w-5 text-gray-500" />
              <Select value={groupBy} onChange={e=>setGroupBy(e.target.value)} className="w-44">
                <option value="room">Group by Room</option>
                <option value="therapist">Group by Therapist</option>
              </Select>
              <Select value={range} onChange={e=>setRange(e.target.value)} className="w-36">
                <option value="day">Day view</option>
                <option value="week">Week view</option>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-6 grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={e=>setDate(e.target.value)} />
              </div>
              <div>
                <Label>Location</Label>
                <Select value={locationId ?? ""} onChange={e=>{ setLocationId(e.target.value); setRoomId(""); }}>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </Select>
              </div>
              <div>
                <Label>Room</Label>
                <Select value={roomId} onChange={e=>setRoomId(e.target.value)}>
                  {roomsForLocation.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label>Therapist filter</Label>
                <Select value={therapistFilterId} onChange={e=>setTherapistFilterId(e.target.value)}>
                  <option value="">All therapists</option>
                  {therapists.map(t => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Create form */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-indigo-600" />
              <span className="font-medium">Quick Create</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-6 grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <Label>Therapist</Label>
                <Select value={assignTherapistId} onChange={e=>setAssignTherapistId(e.target.value)}>
                  <option value="">Select therapist</option>
                  {therapists.map(t => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
                </Select>
              </div>
              <div>
                <Label>Start</Label>
                <Input type="datetime-local" value={startISO} onChange={e=>setStartISO(e.target.value)} />
              </div>
              <div>
                <Label>End</Label>
                <Input type="datetime-local" value={endISO} onChange={e=>setEndISO(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>Notes</Label>
                <Input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Schedule grid(s) */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-indigo-600" />
              <span className="font-medium">
                Schedule — {range==="day" ? format(day,"EEE, MMM d") : `${format(weekDays[0],"MMM d")} – ${format(weekDays[6],"MMM d")}`}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {weekDays.map((d) => (
              <DayGrid
                key={d.toISOString()}
                theDay={d}
                groupBy={groupBy}
                rooms={roomsForLocation}
                therapists={therapists}
                therapistById={therapistById}
                roomById={roomById}
                bookings={filteredBookings}
                roomFilter={roomId}
                therapistFilter={therapistFilterId}
                onDelete={deleteBooking}
              />
            ))}
          </CardContent>
        </Card>

        {/* Quick utilization for today */}
        <div className="grid md:grid-cols-3 gap-5">
          <Card>
            <CardHeader><div className="font-medium">Location Utilization (today)</div></CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{locations.find(l=>String(l.id)===String(locationId))?.name || "Location"}</span>
                  <span>{utilizationToday.byLocationPct}%</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-2 bg-indigo-500" style={{ width: `${utilizationToday.byLocationPct}%` }} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {errorMsg && <p style={{color:"crimson"}}>{errorMsg}</p>}
      </div>
    </div>
  );
}

function DayGrid({
  theDay, groupBy, rooms, therapists, therapistById, roomById,
  bookings, roomFilter, therapistFilter, onDelete
}) {
  const slotMinutes = 30;
  // build slots 9am .. 8pm (last slot shows 7:30–8:00)
  const slots = useMemo(() => {
    const list = [];
    const span = HOURS[theDay.getDay()];
    if (!span) return list;
    const [open, close] = span;
    let t = new Date(theDay); t.setHours(open,0,0,0);
    const end = new Date(theDay); end.setHours(close,0,0,0);
    while (t < end) { list.push(new Date(t)); t = addMinutes(t, slotMinutes); }
    return list;
  }, [theDay]);

  const groups = useMemo(() => {
    if (groupBy === "room") {
      return rooms.filter(r => roomFilter ? String(r.id)===String(roomFilter) : true);
    } else {
      return therapists.filter(t => therapistFilter ? t.id===therapistFilter : true);
    }
  }, [groupBy, rooms, therapists, roomFilter, therapistFilter]);

  const isInCell = (b, cellStart, cellEnd, by) => {
    const s = parseISO(b.start_time), e = parseISO(b.end_time);
    if (!isSameDay(s, theDay)) return false;
    if (by==="room" && String(b.room_id)!==String((roomFilter||"")) && roomFilter) return false;
    return e > cellStart && s < cellEnd;
  };

  return (
    <div className="mb-6">
      {slots.length === 0 ? (
        <div className="text-sm text-gray-600 mb-2">{format(theDay,"EEEE, MMM d")} — Closed</div>
      ) : (
        <div className="text-sm font-medium text-gray-700 mb-2">{format(theDay,"EEEE, MMM d")}</div>
      )}

      {slots.length > 0 && (
        <div className="w-full overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="w-48 sticky left-0 bg-white z-10 text-left px-3 py-2 border-b">
                  {groupBy==="room" ? "Room" : "Therapist"}
                </th>
                {slots.map((s, idx) => (
                  <th key={idx} className="px-2 py-2 border-b whitespace-nowrap text-gray-500 font-normal">
                    {format(s, "h:mma")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((entity) => (
                <tr key={entity.id} className="odd:bg-gray-50/40">
                  <td className="sticky left-0 bg-white z-10 px-3 py-2 border-r font-medium">
                    {groupBy==="room" ? entity.name : (entity.name || entity.email)}
                  </td>
                  {slots.map((s, idx) => {
                    const cellStart = s;
                    const cellEnd = addMinutes(s, 30);
                    // which bookings belong to this row?
                    const rowBookings = bookings.filter(b => {
                      if (groupBy==="room") {
                        return String(b.room_id) === String(entity.id) && isInCell(b, cellStart, cellEnd, "room");
                      } else {
                        return b.therapist_id === entity.id && isInCell(b, cellStart, cellEnd, "therapist");
                      }
                    });
                    return (
                      <td key={idx} className="relative h-14 border-b">
                        {rowBookings.map((b) => {
                          const t = therapistById.get(b.therapist_id);
                          const color = colorForId(b.therapist_id || "");
                          return (
                            <motion.div
                              key={b.id}
                              layout
                              className="absolute inset-0 m-0.5 rounded-xl border"
                              style={{ background: `${color}15`, borderColor: `${color}60` }}
                              title={`${format(parseISO(b.start_time),"h:mma")} – ${format(parseISO(b.end_time),"h:mma")}`}
                            >
                              <div className="px-2 py-1 text-[11px] leading-tight" style={{color:"#111"}}>
                                <div className="font-medium truncate">
                                  {groupBy==="room" ? (t?.name || t?.email || "Therapist") : (roomById.get(b.room_id)?.name || "Room")}
                                </div>
                                <div className="opacity-70 truncate">
                                  {format(parseISO(b.start_time),"h:mma")}–{format(parseISO(b.end_time),"h:mma")}
                                </div>
                                {b.notes && <div className="opacity-60 truncate">{b.notes}</div>}
                              </div>
                              <div className="absolute right-1 top-1 flex gap-1 opacity-80">
                                <Button className="!px-2 !py-1 text-xs bg-red-50 border-red-200 hover:bg-red-100"
                                  onClick={() => onDelete(b.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
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
