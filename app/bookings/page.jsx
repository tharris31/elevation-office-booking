"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

/* ---------------- helpers ---------------- */

const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const HOUR_START = 8;  // office opens 8am
const HOUR_END   = 20; // office closes 8pm (exclusive end)
const HOURS_PER_DAY = HOUR_END - HOUR_START;

const toTs = (d,t) => new Date(`${d}T${t}:00`).toISOString();
const fmtDate = (s) => new Date(s).toLocaleDateString([], { month:"short", day:"numeric" });
const fmtTime = (s) => new Date(s).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
const fmtBoth = (s) => new Date(s).toLocaleString([], {month:"short", day:"numeric", hour:"2-digit", minute:"2-digit"});

// deterministic color from id
function colorForId(id) {
  // simple hash to hue (0..360)
  let h = 0; for (let i=0; i<id.length; i++) h = (h*31 + id.charCodeAt(i)) % 360;
  return `hsl(${h} 70% 45%)`; // vivid
}

// clamp an ISO into week range
function clampToWeek(iso, start, end) {
  const d = new Date(iso);
  return d >= start && d < end;
}

function sameYMD(a,b){
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}

/* -------------- component ---------------- */

export default function BookingsAdmin() {
  // master data
  const [locations, setLocations] = useState([]);
  const [roomsAll, setRoomsAll]   = useState([]); // id, name, location_id
  const [therapists, setTherapists] = useState([]); // id, email, role

  // selections / filters
  const [locationId, setLocationId] = useState(null);
  const [roomId, setRoomId]         = useState(null);
  const [therapistFilterId, setTherapistFilterId] = useState("");
  const [view, setView] = useState("calendar"); // calendar | list | therapist | utilization

  // form state
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [assignTherapistId, setAssignTherapistId] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [repeatCount, setRepeatCount] = useState(4);

  // data
  const [bookings, setBookings] = useState([]); // upcoming in location (for list/cal/util)
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading]   = useState(true);

  /* Init: load locations, therapists, ALL rooms */
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = "/login"; return; }

      const [locsRes, profsRes, roomsRes] = await Promise.all([
        supabase.from("locations").select("id,name").order("name"),
        supabase.from("profiles").select("id,email,role").order("email"),
        supabase.from("rooms").select("id,name,location_id").order("name")
      ]);

      setLocations(locsRes.data ?? []);
      setRoomsAll(roomsRes.data ?? []);
      setTherapists((profsRes.data ?? []).filter(p => !p.role || ["Therapist","Admin Manager","Admin Assistant"].includes(p.role)));

      if (locsRes.data?.length) setLocationId(locsRes.data[0].id);
      setLoading(false);
    })();
  }, []);

  /* derive rooms for selected location */
  const roomsForLocation = useMemo(
    () => roomsAll.filter(r => r.location_id === locationId),
    [roomsAll, locationId]
  );

  // selected room default
  useEffect(() => {
    if (roomsForLocation.length && !roomId) setRoomId(roomsForLocation[0].id);
  }, [roomsForLocation, roomId]);

  /* Compute week window from selected date (or today) */
  const anchor = date ? new Date(date) : new Date();
  const weekStart = new Date(anchor);
  const day = weekStart.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday as start
  weekStart.setDate(weekStart.getDate() + diff);
  weekStart.setHours(0,0,0,0);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate()+7);

  /* load bookings for entire location & week (so we can do utilization + therapist schedule) */
  useEffect(() => {
    if (!locationId) return;
    (async () => {
      setErrorMsg("");
      // rooms inside this location
      const ids = roomsAll.filter(r => r.location_id === locationId).map(r => r.id);
      if (!ids.length) { setBookings([]); return; }

      const { data, error } = await supabase
        .from("bookings")
        .select("id,room_id,user_id,start_time,end_time,notes")
        .in("room_id", ids)
        .gte("start_time", weekStart.toISOString())
        .lt("start_time", weekEnd.toISOString())
        .order("start_time");

      if (error) setErrorMsg(error.message);
      setBookings(data ?? []);
    })();
  }, [locationId, roomsAll, date]); // reload when location or week anchor changes

  /* maps to display */
  const roomById = useMemo(() => {
    const m = new Map(); roomsAll.forEach(r => m.set(r.id, r)); return m;
  }, [roomsAll]);

  const therapistById = useMemo(() => {
    const m = new Map(); therapists.forEach(t => m.set(t.id, t)); return m;
  }, [therapists]);

  /* filtered views */
  const bookingsForSelectedRoom = useMemo(
    () => bookings.filter(b => b.room_id === roomId && (!therapistFilterId || b.user_id === therapistFilterId)),
    [bookings, roomId, therapistFilterId]
  );

  const bookingsForTherapist = useMemo(
    () => bookings.filter(b => !therapistFilterId || b.user_id === therapistFilterId),
    [bookings, therapistFilterId]
  );

  /* create booking (with recurrence) */
  async function createBooking(e) {
    e.preventDefault(); setErrorMsg("");
    if (!locationId || !roomId) return setErrorMsg("Choose location & room.");
    if (!assignTherapistId)     return setErrorMsg("Choose therapist.");
    if (!date || !startTime || !endTime) return setErrorMsg("Pick date and times.");

    const start0 = toTs(date, startTime);
    const end0   = toTs(date, endTime);
    if (new Date(end0) <= new Date(start0)) return setErrorMsg("End must be after start.");

    // build weekly occurrences
    const repeats = repeat ? Math.max(1, repeatCount) : 1;
    const occurrences = Array.from({length: repeats}, (_,i) => {
      const s = new Date(start0); s.setDate(s.getDate() + i*7);
      const e = new Date(end0);   e.setDate(e.getDate() + i*7);
      return { start: s.toISOString(), end: e.toISOString() };
    });

    // conflict check each
    for (const { start, end } of occurrences) {
      const { data: conflicts, error } = await supabase
        .from("bookings").select("id")
        .eq("room_id", roomId)
        .or(`and(start_time.lt.${end},end_time.gt.${start})`);
      if (error) return setErrorMsg(error.message);
      if (conflicts?.length) return setErrorMsg(`Conflict: ${fmtBoth(start)} → ${fmtTime(end)}`);
    }

    // insert
    const rows = occurrences.map(({ start, end }) => ({
      room_id: roomId, user_id: assignTherapistId, start_time: start, end_time: end, notes: notes || null
    }));
    const { error: insErr } = await supabase.from("bookings").insert(rows);
    if (insErr) return setErrorMsg(insErr.message);

    // refresh bookings for week
    const ids = roomsAll.filter(r => r.location_id === locationId).map(r => r.id);
    const { data } = await supabase
      .from("bookings").select("id,room_id,user_id,start_time,end_time,notes")
      .in("room_id", ids)
      .gte("start_time", weekStart.toISOString())
      .lt("start_time", weekEnd.toISOString())
      .order("start_time");
    setBookings(data ?? []);

    setNotes(""); setRepeat(false); setRepeatCount(4);
  }

  async function deleteBooking(id) {
    if (!confirm("Delete this booking?")) return;
    const { error } = await supabase.from("bookings").delete().eq("id", id);
    if (error) return alert(error.message);
    setBookings(prev => prev.filter(b => b.id !== id));
  }

  /* utilization calculations (for location & rooms in week) */
  const util = useMemo(() => {
    const roomIds = roomsAll.filter(r => r.location_id === locationId).map(r => r.id);
    const capacityHours = roomIds.length * HOURS_PER_DAY * 7;
    // sum booked hours in week for those rooms
    let booked = 0;
    bookings.forEach(b => {
      if (!roomIds.includes(b.room_id)) return;
      const s = new Date(b.start_time), e = new Date(b.end_time);
      booked += Math.max(0, (e - s) / 36e5); // ms→hours
    });

    const byRoom = new Map(); // roomId -> hours
    roomIds.forEach(id => byRoom.set(id, 0));
    bookings.forEach(b => {
      if (!roomIds.includes(b.room_id)) return;
      const hours = Math.max(0, (new Date(b.end_time) - new Date(b.start_time)) / 36e5);
      byRoom.set(b.room_id, (byRoom.get(b.room_id) || 0) + hours);
    });

    return { capacityHours, bookedHours: booked, byRoom };
  }, [bookings, roomsAll, locationId]);

  if (loading) return <div className="container">Loading…</div>;

  /* ---------- UI ---------- */

  return (
    <div className="container">
      <h1 className="h1">Admin • Bookings</h1>

      <div className="card">
        <div className="grid3">
          <div>
            <label>Location</label>
            <select className="input mt8" value={locationId ?? ""} onChange={e=>{ setLocationId(Number(e.target.value)); setRoomId(null); }}>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label>Room</label>
            <select className="input mt8" value={roomId ?? ""} onChange={e=>setRoomId(Number(e.target.value))}>
              {roomsForLocation.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label>Filter by Therapist</label>
            <select className="input mt8" value={therapistFilterId} onChange={e=>setTherapistFilterId(e.target.value)}>
              <option value="">All therapists</option>
              {therapists.map(t => <option key={t.id} value={t.id}>{t.email}</option>)}
            </select>
          </div>
        </div>

        <div className="tabs">
          <button className={`tab ${view==="calendar"?"active":""}`} onClick={()=>setView("calendar")}>Calendar</button>
          <button className={`tab ${view==="list"?"active":""}`} onClick={()=>setView("list")}>List</button>
          <button className={`tab ${view==="therapist"?"active":""}`} onClick={()=>setView("therapist")}>Therapist Schedule</button>
          <button className={`tab ${view==="utilization"?"active":""}`} onClick={()=>setView("utilization")}>Utilization</button>
        </div>

        {/* Color legend */}
        <div className="legend">
          {therapists.slice(0,10).map(t => (
            <div key={t.id} className="legend-item">
              <span className="dot" style={{ background: colorForId(t.id) }}></span>
              {t.email}
            </div>
          ))}
          {therapists.length>10 && <span className="muted">(+ {therapists.length-10} more)</span>}
        </div>
      </div>

      {/* Create booking */}
      <div className="card mt16">
        <h2 className="h2">Create booking</h2>
        {errorMsg && <p style={{ color:"crimson" }}>{errorMsg}</p>}

        <div className="grid3">
          <div>
            <label>Therapist</label>
            <select className="input mt8" value={assignTherapistId} onChange={e=>setAssignTherapistId(e.target.value)} required>
              <option value="">Select therapist</option>
              {therapists.map(t => <option key={t.id} value={t.id}>{t.email}</option>)}
            </select>
          </div>
          <div>
            <label>Week anchor (controls calendar/utilization week)</label>
            <input className="input mt8" type="date" value={date} onChange={e=>setDate(e.target.value)} />
          </div>
          <div className="grid2">
            <div>
              <label>Start</label>
              <input className="input mt8" type="time" value={startTime} onChange={e=>setStartTime(e.target.value)} />
            </div>
            <div>
              <label>End</label>
              <input className="input mt8" type="time" value={endTime} onChange={e=>setEndTime(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="grid2 mt12">
          <div>
            <label>Notes</label>
            <input className="input mt8" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label>Recurring</label>
            <div className="mt8" style={{display:"flex",gap:12,alignItems:"center"}}>
              <input id="rpt" type="checkbox" checked={repeat} onChange={e=>setRepeat(e.target.checked)} />
              <label htmlFor="rpt">Repeat weekly for</label>
              <input type="number" min={1} max={26} className="input" style={{width:90}} value={repeatCount} onChange={e=>setRepeatCount(Number(e.target.value)||1)} disabled={!repeat} />
              <span>weeks</span>
            </div>
          </div>
        </div>

        <div style={{ textAlign:"right" }} className="mt16">
          <button className="btn primary" onClick={createBooking}>Create booking</button>
        </div>
      </div>

      {/* VIEWS */}
      {view === "calendar" && (
        <CalendarView
          weekStart={weekStart}
          weekEnd={weekEnd}
          bookings={bookingsForSelectedRoom}
          therapistById={therapistById}
        />
      )}

      {view === "list" && (
        <ListView
          items={bookingsForSelectedRoom}
          therapistById={therapistById}
          onDelete={deleteBooking}
          roomName={roomById.get(roomId)?.name || ""}
        />
      )}

      {view === "therapist" && (
        <TherapistScheduleView
          weekStart={weekStart}
          bookings={bookingsForTherapist}
          therapistById={therapistById}
          roomById={roomById}
          locations={locations}
        />
      )}

      {view === "utilization" && (
        <UtilizationView
          util={util}
          rooms={roomsForLocation}
          roomById={roomById}
          weekStart={weekStart}
        />
      )}
    </div>
  );
}

/* ---------- subcomponents ---------- */

function CalendarView({ weekStart, weekEnd, bookings, therapistById }) {
  const days = Array.from({length:7}, (_,i)=> {
    const d = new Date(weekStart); d.setDate(weekStart.getDate()+i); return d;
  });
  const hours = Array.from({length:HOURS_PER_DAY}, (_,i)=> i + HOUR_START);

  // group bookings by day+hour start
  function bookingsForDayHour(d, h) {
    return bookings.filter(b => {
      const s = new Date(b.start_time);
      return sameYMD(s, d) && s.getHours() === h;
    });
  }

  return (
    <div className="card mt16">
      <h2 className="h2">Week of {weekStart.toLocaleDateString()}</h2>
      <div className="calendar mt8">
        <div></div>
        {days.map(d => (
          <div key={d.toDateString()} className="cal-head" style={{padding:8}}>
            {d.toLocaleDateString([], { weekday:"short", month:"short", day:"numeric"})}
          </div>
        ))}
        {hours.map(h => (
          <>
            <div key={`h-${h}`} className="cal-hour">{h}:00</div>
            {days.map(d => {
              const todays = bookingsForDayHour(d,h);
              return (
                <div key={`${d.toDateString()}-${h}`} className="cal-cell">
                  {todays.map(b => {
                    const t = therapistById.get(b.user_id);
                    const color = colorForId(b.user_id || "");
                    return (
                      <div key={b.id} className="badge-colored" style={{ background: color }}>
                        {(t?.email || "Therapist")} • {fmtTime(b.start_time)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </>
        ))}
      </div>
    </div>
  );
}

function ListView({ items, therapistById, onDelete, roomName }) {
  return (
    <div className="card mt24">
      <h2 className="h2">Upcoming bookings {roomName ? `• ${roomName}` : ""}</h2>
      {items.length === 0 ? (
        <p className="muted">No upcoming bookings for this room.</p>
      ) : (
        <table className="table mt8">
          <thead><tr><th>Therapist</th><th>Start</th><th>End</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            {items.map(b => {
              const t = therapistById.get(b.user_id);
              const color = colorForId(b.user_id || "");
              return (
                <tr key={b.id}>
                  <td><span className="dot" style={{background:color, verticalAlign:"middle"}}></span>&nbsp;{t?.email || "Therapist"}</td>
                  <td>{fmtBoth(b.start_time)}</td>
                  <td>{fmtTime(b.end_time)}</td>
                  <td>{b.notes || ""}</td>
                  <td><button className="btn" onClick={()=>onDelete(b.id)}>Delete</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TherapistScheduleView({ weekStart, bookings, therapistById, roomById, locations }) {
  // group by therapist → day
  const byTherapist = new Map();
  bookings.forEach(b => {
    const list = byTherapist.get(b.user_id) || [];
    list.push(b); byTherapist.set(b.user_id, list);
  });

  return (
    <div className="card mt16">
      <h2 className="h2">Therapist schedules — week of {weekStart.toLocaleDateString()}</h2>
      {[...byTherapist.entries()].map(([uid, list]) => {
        const t = therapistById.get(uid);
        // sort by start_time
        list.sort((a,b)=> new Date(a.start_time) - new Date(b.start_time));
        return (
          <div key={uid} className="mt16">
            <div className="pill" style={{ background: `${colorForId(uid)}20`, color: "#055" }}>
              {t?.email || "Therapist"}
            </div>
            <ul className="mt8">
              {list.map(b => {
                const room = roomById.get(b.room_id);
                const locName = locations.find(l => l.id === room?.location_id)?.name || "";
                return (
                  <li key={b.id}>
                    {DAY_LABELS[new Date(b.start_time).getDay()]} • {locName} — {room?.name || "Room"} {fmtTime(b.start_time)}–{fmtTime(b.end_time)}
                  </li>
                );
              })}
              {list.length===0 && <li className="muted">No bookings this week.</li>}
            </ul>
          </div>
        );
      })}
      {byTherapist.size === 0 && <p className="muted">No bookings in this week for the chosen filters.</p>}
    </div>
  );
}

function UtilizationView({ util, rooms, roomById, weekStart }) {
  const pct = util.capacityHours ? Math.round((util.bookedHours/util.capacityHours)*100) : 0;
  return (
    <div className="card mt16">
      <h2 className="h2">Utilization — week of {weekStart.toLocaleDateString()}</h2>
      <div className="kpi">
        <div className="card">
          <div className="muted">Total capacity (hrs)</div>
          <div className="big">{util.capacityHours}</div>
        </div>
        <div className="card">
          <div className="muted">Booked hours</div>
          <div className="big">{Math.round(util.bookedHours*10)/10}</div>
        </div>
        <div className="card">
          <div className="muted">Utilization</div>
          <div className="big">{pct}%</div>
        </div>
      </div>

      <h3 className="h2 mt16">By room</h3>
      <table className="table mt8">
        <thead><tr><th>Room</th><th>Booked hrs</th><th>Capacity hrs</th><th>Utilization</th></tr></thead>
        <tbody>
          {rooms.map(r => {
            const booked = Math.round((util.byRoom.get(r.id) || 0)*10)/10;
            const cap = HOURS_PER_DAY * 7;
            const p = cap ? Math.round((booked/cap)*100) : 0;
            return (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{booked}</td>
                <td>{cap}</td>
                <td>{p}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted mt8">Capacity assumes {HOUR_START}:00–{HOUR_END}:00, 7 days/week. Adjust hours in code if needed.</p>
    </div>
  );
}
