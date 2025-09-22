"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

/* Business hours:
   Mon–Thu: 09:00–20:00 (11h)
   Fri–Sat: 09:00–16:00 (7h)
   Sun: closed
*/
const HOURS = {
  0: null,                 // Sun
  1: [9, 20], 2: [9, 20], 3: [9, 20], 4: [9, 20], // Mon..Thu
  5: [9, 16], 6: [9, 16]   // Fri, Sat
};
const HOUR_START_CAL = 9;   // Calendar left axis start (earliest open)
const HOUR_END_CAL   = 20;  // Calendar end (latest close)

const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const toTs = (d,t) => new Date(`${d}T${t}:00`).toISOString();
const fmtDate = (s) => new Date(s).toLocaleDateString([], { month:"short", day:"numeric" });
const fmtTime = (s) => new Date(s).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
const fmtBoth = (s) => new Date(s).toLocaleString([], {month:"short", day:"numeric", hour:"2-digit", minute:"2-digit"});

function colorForId(id) { let h=0; for (let i=0;i<id.length;i++) h=(h*31+id.charCodeAt(i))%360; return `hsl(${h} 70% 45%)`; }

// clip a [start,end) interval to business hours of a given date; returns hours (float)
function bookedHoursWithinBusiness(startISO, endISO) {
  const s = new Date(startISO), e = new Date(endISO);
  const day = s.getDay();
  const span = HOURS[day];
  if (!span) return 0;
  const [open, close] = span;
  const bs = new Date(s); bs.setHours(open,0,0,0);
  const be = new Date(s); be.setHours(close,0,0,0);
  const start = new Date(Math.max(s, bs));
  const end   = new Date(Math.min(e, be));
  return Math.max(0, (end - start) / 36e5);
}

// capacity hours for a location for a week, given # of rooms
function weeklyCapacityHours(numRooms) {
  const perDay = {1:11,2:11,3:11,4:11,5:7,6:7}; // Mon..Sat
  const total = (11*4 + 7*2) * numRooms; // 58 * rooms
  return total;
}

export default function BookingsAdmin() {
  // master data
  const [locations, setLocations] = useState([]);
  const [roomsAll, setRoomsAll]   = useState([]); // id, name, location_id
  const [therapists, setTherapists] = useState([]); // id, name, email, active

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
  const [bookings, setBookings] = useState([]); // this location, this week
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading]   = useState(true);

  /* Init */
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = "/login"; return; }

      const [locsRes, thRes, roomsRes] = await Promise.all([
        supabase.from("locations").select("id,name").order("name"),
        supabase.from("therapists").select("id,name,email,active").order("name"),
        supabase.from("rooms").select("id,name,location_id").order("name")
      ]);

      setLocations(locsRes.data ?? []);
      setTherapists((thRes.data ?? []).filter(t => t.active));
      setRoomsAll(roomsRes.data ?? []);
      if (locsRes.data?.length) setLocationId(locsRes.data[0].id);
      setLoading(false);
    })();
  }, []);

  const roomsForLocation = useMemo(
    () => roomsAll.filter(r => r.location_id === locationId),
    [roomsAll, locationId]
  );

  useEffect(() => {
    if (roomsForLocation.length && !roomId) setRoomId(roomsForLocation[0].id);
  }, [roomsForLocation, roomId]);

  // week window
  const anchor = date ? new Date(date) : new Date();
  const weekStart = new Date(anchor);
  const d = weekStart.getDay();
  const diff = (d === 0 ? -6 : 1) - d; // Monday
  weekStart.setDate(weekStart.getDate()+diff);
  weekStart.setHours(0,0,0,0);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate()+7);

  // load bookings for location & week
  useEffect(() => {
    if (!locationId) return;
    (async () => {
      setErrorMsg("");
      const ids = roomsAll.filter(r => r.location_id === locationId).map(r => r.id);
      if (!ids.length) { setBookings([]); return; }
      const { data, error } = await supabase
        .from("bookings")
        .select("id,room_id,therapist_id,start_time,end_time,notes")
        .in("room_id", ids)
        .gte("start_time", weekStart.toISOString())
        .lt("start_time", weekEnd.toISOString())
        .order("start_time");
      if (error) setErrorMsg(error.message);
      setBookings(data ?? []);
    })();
  }, [locationId, roomsAll, date]);

  const therapistById = useMemo(() => {
    const m = new Map(); therapists.forEach(t => m.set(t.id, t)); return m;
  }, [therapists]);
  const roomById = useMemo(() => {
    const m = new Map(); roomsAll.forEach(r => m.set(r.id, r)); return m;
  }, [roomsAll]);

  const bookingsForSelectedRoom = useMemo(
    () => bookings.filter(b => b.room_id === roomId && (!therapistFilterId || b.therapist_id === therapistFilterId)),
    [bookings, roomId, therapistFilterId]
  );
  const bookingsForTherapist = useMemo(
    () => bookings.filter(b => !therapistFilterId || b.therapist_id === therapistFilterId),
    [bookings, therapistFilterId]
  );

  async function createBooking(e) {
    e.preventDefault(); setErrorMsg("");
    if (!locationId || !roomId) return setErrorMsg("Choose location & room.");
    if (!assignTherapistId)     return setErrorMsg("Choose therapist.");
    if (!date || !startTime || !endTime) return setErrorMsg("Pick date and times.");

    const start0 = toTs(date, startTime);
    const end0   = toTs(date, endTime);
    if (new Date(end0) <= new Date(start0)) return setErrorMsg("End must be after start.");

    const repeats = repeat ? Math.max(1, repeatCount) : 1;
    const occurrences = Array.from({length: repeats}, (_,i) => {
      const s = new Date(start0); s.setDate(s.getDate() + i*7);
      const e = new Date(end0);   e.setDate(e.getDate() + i*7);
      return { start: s.toISOString(), end: e.toISOString() };
    });

    // conflict check per occurrence (room overlap)
    for (const { start, end } of occurrences) {
      const { data: conflicts, error } = await supabase
        .from("bookings").select("id")
        .eq("room_id", roomId)
        .or(`and(start_time.lt.${end},end_time.gt.${start})`);
      if (error) return setErrorMsg(error.message);
      if (conflicts?.length) return setErrorMsg(`Conflict: ${fmtBoth(start)} → ${fmtTime(end)}`);
    }

    // insert rows
    const rows = occurrences.map(({ start, end }) => ({
      room_id: roomId,
      therapist_id: assignTherapistId,
      start_time: start,
      end_time: end,
      notes: notes || null
    }));
    const { error: insErr } = await supabase.from("bookings").insert(rows);
    if (insErr) return setErrorMsg(insErr.message);

    // refresh week
    const ids = roomsAll.filter(r => r.location_id === locationId).map(r => r.id);
    const { data } = await supabase
      .from("bookings").select("id,room_id,therapist_id,start_time,end_time,notes")
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

  // utilization (clipped to business hours)
  const util = useMemo(() => {
    const roomIds = roomsAll.filter(r => r.location_id === locationId).map(r => r.id);
    const capacity = weeklyCapacityHours(roomIds.length);

    function dayCapacityHours(dayIdx) {
      const span = HOURS[dayIdx];
      return span ? (span[1] - span[0]) : 0;
    }

    const byRoom = new Map(); // roomId -> booked hours
    roomIds.forEach(id => byRoom.set(id, 0));

    // sum hours per booking clipped to business hours
    bookings.forEach(b => {
      if (!roomIds.includes(b.room_id)) return;
      const s = new Date(b.start_time), e = new Date(b.end_time);
      if (!sameDateWeek(s, weekStart)) return; // guard; already filtered but safe
      const hours = bookedHoursWithinBusiness(s.toISOString(), e.toISOString());
      byRoom.set(b.room_id, (byRoom.get(b.room_id) || 0) + hours);
    });

    // total booked
    let totalBooked = 0; byRoom.forEach(v => totalBooked += v);

    return { capacityHours: capacity, bookedHours: totalBooked, byRoom };
  }, [bookings, roomsAll, locationId, weekStart]);

  function sameDateWeek(d, ws){ const x=new Date(ws); const y=new Date(ws); y.setDate(x.getDate()+7); return d>=x && d<y; }

  if (loading) return <div className="container">Loading…</div>;

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
              {therapists.map(t => <option key={t.id} value={t.id}>{t.name}{t.email ? ` — ${t.email}` : ""}</option>)}
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
          {therapists.slice(0,12).map(t => (
            <div key={t.id} className="legend-item">
              <span className="dot" style={{ background: colorForId(t.id) }}></span>
              {t.name}
            </div>
          ))}
          {therapists.length>12 && <span className="muted">(+ {therapists.length-12} more)</span>}
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
              {therapists.map(t => <option key={t.id} value={t.id}>{t.name}{t.email ? ` — ${t.email}` : ""}</option>)}
            </select>
          </div>
          <div>
            <label>Week anchor</label>
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
        <CalendarView bookings={bookingsForSelectedRoom} therapistById={therapistById} />
      )}
      {view === "list" && (
        <ListView items={bookingsForSelectedRoom} therapistById={therapistById} onDelete={deleteBooking} roomName={roomById.get(roomId)?.name || ""} />
      )}
      {view === "therapist" && (
        <TherapistScheduleView bookings={bookingsForTherapist} therapistById={therapistById} roomById={roomById} />
      )}
      {view === "utilization" && (
        <UtilizationView util={util} rooms={roomsForLocation} />
      )}
    </div>
  );
}

/* ---------- subcomponents ---------- */

function CalendarView({ bookings, therapistById }) {
  const days = Array.from({length:7}, (_,i) => {
    const d = new Date(); const day = d.getDay(); const diff = (day===0?-6:1)-day; d.setDate(d.getDate()+diff+i); d.setHours(0,0,0,0); return d;
  });
  const hours = Array.from({length: HOUR_END_CAL - HOUR_START_CAL}, (_,i)=> i + HOUR_START_CAL);

  function dayHours(dayIdx){ const span=HOURS[dayIdx]; return span ? [span[0], span[1]] : [null,null]; }

  function bookingsForDayHour(d, h) {
    return bookings.filter(b => {
      const s = new Date(b.start_time);
      return s.getFullYear()===d.getFullYear() && s.getMonth()===d.getMonth() && s.getDate()===d.getDate() && s.getHours()===h;
    });
  }

  return (
    <div className="card mt16">
      <h2 className="h2">Office calendar</h2>
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
            {days.map((d,i) => {
              const [open, close] = dayHours(d.getDay());
              const disabled = open==null || h < open || h >= close;
              const todays = disabled ? [] : bookingsForDayHour(d,h);
              return (
                <div key={`${d.toDateString()}-${h}`} className="cal-cell" style={{ background: disabled ? "#fafafa" : "#fff" }}>
                  {todays.map(b => {
                    const t = therapistById.get(b.therapist_id);
                    const color = colorForId(b.therapist_id || "");
                    return <div key={b.id} className="badge-colored" style={{ background: color }}>{t?.name || "Therapist"} • {fmtTime(b.start_time)}</div>;
                  })}
                </div>
              );
            })}
          </>
        ))}
      </div>
      <p className="muted mt8">Greyed slots are outside business hours.</p>
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
              const t = therapistById.get(b.therapist_id);
              const color = colorForId(b.therapist_id || "");
              return (
                <tr key={b.id}>
                  <td><span className="dot" style={{background:color, verticalAlign:"middle"}}></span>&nbsp;{t?.name || "Therapist"}</td>
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

function TherapistScheduleView({ bookings, therapistById, roomById }) {
  // group by therapist
  const byTherapist = new Map();
  bookings.forEach(b => {
    const list = byTherapist.get(b.therapist_id) || [];
    list.push(b); byTherapist.set(b.therapist_id, list);
  });

  return (
    <div className="card mt16">
      <h2 className="h2">Therapist schedules (this week)</h2>
      {[...byTherapist.entries()].map(([tid, list]) => {
        const t = therapistById.get(tid);
        list.sort((a,b)=> new Date(a.start_time) - new Date(b.start_time));
        return (
          <div key={tid} className="mt16">
            <div className="pill" style={{ background: `${colorForId(tid)}20` }}>
              {t?.name || "Therapist"} {t?.email ? `• ${t.email}` : ""}
            </div>
            <ul className="mt8">
              {list.map(b => {
                const room = roomById.get(b.room_id);
                return (
                  <li key={b.id}>
                    {DAY_LABELS[new Date(b.start_time).getDay()]}
                    {" — "}
                    {room ? `${room.name}` : "Room"}
                    {" • "}
                    {fmtTime(b.start_time)}–{fmtTime(b.end_time)}
                    {b.notes ? ` — ${b.notes}` : ""}
                  </li>
                );
              })}
              {list.length===0 && <li className="muted">No bookings this week.</li>}
            </ul>
          </div>
        );
      })}
      {byTherapist.size === 0 && <p className="muted">No bookings in this week for the current filters.</p>}
    </div>
  );
}

function UtilizationView({ util, rooms }) {
  const capPerRoom = 58; // (Mon-Thu 11h *4) + (Fri-Sat 7h *2) = 58
  const totalRooms = rooms.length;
  const totalCap = capPerRoom * totalRooms;
  const totalBooked = Math.round(util.bookedHours * 10) / 10;
  const pct = totalCap ? Math.round((totalBooked / totalCap) * 100) : 0;

  return (
    <div className="card mt16">
      <h2 className="h2">Utilization (Mon–Thu 9–20, Fri–Sat 9–16)</h2>
      <div className="kpi">
        <div className="card"><div className="muted">Rooms</div><div className="big">{totalRooms}</div></div>
        <div className="card"><div className="muted">Capacity (hrs/wk)</div><div className="big">{totalCap}</div></div>
        <div className="card"><div className="muted">Booked (hrs/wk)</div><div className="big">{totalBooked}</div></div>
        <div className="card"><div className="muted">Utilization</div><div className="big">{pct}%</div></div>
      </div>

      <h3 className="h2 mt16">By room (hrs this week)</h3>
      <table className="table mt8">
        <thead><tr><th>Room</th><th>Booked</th><th>Capacity</th><th>Utilization</th></tr></thead>
        <tbody>
          {rooms.map(r => {
            const booked = Math.round((util.byRoom.get(r.id) || 0) * 10) / 10;
            const cap = capPerRoom;
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
    </div>
  );
}
