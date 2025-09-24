'use client';
import { useEffect, useMemo, useState } from "react";
import { addDays, addMinutes, endOfDay, format, isSameDay, startOfDay } from "date-fns";
import { supabase } from "../../lib/supabaseClient";
import { v4 as uuidv4 } from "uuid"; // small helper implemented inline below if you don’t use this lib

// tiny uuid if you prefer no extra dep
function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random()*16)|0, v = c === 'x' ? r : (r&0x3|0x8); return v.toString(16);
  });
}

// Working hours you requested
const HOURS = {
  monThu: { start: 9, end: 20 }, // 9:00–20:00
  friSat: { start: 9, end: 16 },  // 9:00–16:00
};

function dayHours(date) {
  const d = date.getDay(); // 0 Sun .. 6 Sat
  if (d === 5 || d === 6) return HOURS.friSat; // Fri(5) Sat(6)
  return HOURS.monThu;
}

export default function Bookings() {
  const [locations, setLocations] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [therapists, setTherapists] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [date0, setDate0] = useState(() => new Date());
  const [groupBy, setGroupBy] = useState("room"); // room | therapist | location
  const [locFilter, setLocFilter] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [therapistFilter, setTherapistFilter] = useState("");

  // Create modal state
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    therapist_id: "", room_id: "", start: "", end: "",
    notes: "", repeatWeekly: false, repeatCount: 0
  });

  // Load base data
  useEffect(() => {
    (async () => {
      const { data: locs } = await supabase.from("locations").select("*").order("name");
      setLocations(locs || []);
      const { data: rms } = await supabase.from("rooms").select("*").order("name");
      setRooms(rms || []);
      const { data: th } = await supabase.from("profiles")
        .select("id, display_name, email, color")
        .order("display_name");
      setTherapists((th||[]).map(t=>({
        id: t.id, name: t.display_name || t.email, color: t.color || "#4f46e5"
      })));
    })();
  }, []);

  // Load bookings for the 2-week window
  const days = useMemo(()=>Array.from({length:14},(_,i)=>addDays(startOfDay(date0), i)),[date0]);

  useEffect(() => {
    (async () => {
      const from = days[0].toISOString();
      const to = endOfDay(days[days.length-1]).toISOString();
      const { data } = await supabase.from("bookings")
        .select("id, room_id, user_id, start_time, end_time, notes, series_id, occurrence_index")
        .gte("start_time", from).lt("start_time", to).order("start_time");
      setBookings(data||[]);
    })();
  }, [days]);

  const therapistMap = useMemo(
    ()=>Object.fromEntries(therapists.map(t=>[t.id, t])),
    [therapists]
  );
  const roomMap = useMemo(
    ()=>Object.fromEntries(rooms.map(r=>[r.id, r])),
    [rooms]
  );

  // Utilization
  const utilByLocation = useMemo(()=>{
    const totals = {};
    locations.forEach(l=> totals[l.id] = 0);
    days.forEach((d)=>{
      const { start, end } = (() => {
        const h = dayHours(d);
        const s = new Date(d); s.setHours(h.start,0,0,0);
        const e = new Date(d); e.setHours(h.end,0,0,0);
        return { start:s, end:e };
      })();
      const openMins = (end-start)/60000;
      rooms.forEach(r=>{
        // minutes booked in r on day d
        const mins = (bookings||[]).filter(b=>{
          const s = new Date(b.start_time); const e = new Date(b.end_time);
          return isSameDay(s,d) && b.room_id === r.id;
        }).reduce((acc,b)=>{
          const s = new Date(b.start_time); const e = new Date(b.end_time);
          const os = s<start ? start : s;
          const oe = e>end ? end : e;
          return acc + Math.max(0,(oe-os)/60000);
        },0);
        const locId = roomMap[r.id]?.location_id;
        if (locId) totals[locId] += Math.min(openMins, mins);
      });
    });
    // total possible per location
    const capacity = {};
    locations.forEach(l=>{
      const locRooms = rooms.filter(r=>r.location_id===l.id).length || 1;
      const mins = days.reduce((acc,d)=>{
        const h = dayHours(d);
        return acc + (h.end - h.start) * 60;
      },0);
      capacity[l.id] = locRooms * mins;
    });
    const pct = {};
    locations.forEach(l=>{
      const p = Math.round((totals[l.id] / (capacity[l.id]||1)) * 100);
      pct[l.id] = isNaN(p)?0:Math.max(0, Math.min(100,p));
    });
    return { totals, capacity, pct };
  }, [days, bookings, rooms, locations, roomMap]);

  function timesForDay(d){
    const h = dayHours(d);
    const slots = [];
    let t = new Date(d); t.setHours(h.start,0,0,0);
    const end = new Date(d); end.setHours(h.end,0,0,0);
    while (t < end) { slots.push(new Date(t)); t = addMinutes(t, 30); }
    return slots;
  }

  async function createBooking(payload){
    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id || therapists[0]?.id; // fallback for now (internal)
    if (!userId) return alert("No user context; sign in.");

    const base = {
      user_id: userId,
      room_id: payload.room_id,
      start_time: payload.start_time,
      end_time: payload.end_time,
      notes: payload.notes || null
    };

    const inserts = [];
    let series = null;
    if (payload.repeatWeekly && payload.repeatCount > 0) {
      series = uuid();
      for (let i=0;i<=payload.repeatCount;i++){
        const s = addDays(new Date(base.start_time), i*7);
        const e = addDays(new Date(base.end_time), i*7);
        inserts.push({ ...base, start_time: s.toISOString(), end_time: e.toISOString(),
                       series_id: series, occurrence_index: i });
      }
    } else {
      inserts.push(base);
    }

    // conflict check: same room overlap
    const conflicts = [];
    for (const row of inserts){
      const { data: overlap } = await supabase.from("bookings").select("id, start_time, end_time")
        .eq("room_id", row.room_id)
        .lte("start_time", row.end_time)
        .gte("end_time", row.start_time);
      if ((overlap||[]).length) conflicts.push(row);
    }

    const toInsert = inserts.filter(x => !conflicts.includes(x));
    if (toInsert.length) {
      const { error } = await supabase.from("bookings").insert(toInsert);
      if (error) return alert(error.message);
    }
    alert(`${toInsert.length} added, ${conflicts.length} skipped due to conflicts.`);
    // reload
    const from = days[0].toISOString();
    const to = endOfDay(days[days.length-1]).toISOString();
    const { data } = await supabase.from("bookings")
      .select("id, room_id, user_id, start_time, end_time, notes, series_id, occurrence_index")
      .gte("start_time", from).lt("start_time", to).order("start_time");
    setBookings(data||[]);
  }

  async function deleteBooking(b){
    if (!b.series_id) {
      if (!confirm("Delete this booking?")) return;
      await supabase.from("bookings").delete().eq("id", b.id);
    } else {
      const choice = prompt('Type "one" to delete this occurrence or "series" for the whole series:', 'one');
      if (choice === 'series') {
        await supabase.from("bookings").delete().eq("series_id", b.series_id);
      } else if (choice === 'one') {
        await supabase.from("bookings").delete().eq("id", b.id);
      } else { return; }
    }
    // refresh
    const from = days[0].toISOString();
    const to = endOfDay(days[days.length-1]).toISOString();
    const { data } = await supabase.from("bookings")
      .select("id, room_id, user_id, start_time, end_time, notes, series_id, occurrence_index")
      .gte("start_time", from).lt("start_time", to).order("start_time");
    setBookings(data||[]);
  }

  // Filter helpers
  const roomsShown = rooms.filter(r => (locFilter ? r.location_id===Number(locFilter) : true))
                         .filter(r => (roomFilter ? r.id===Number(roomFilter) : true));

  return (
    <div className="grid lg:grid-cols-12 gap-6">
      {/* LEFT: Filters + Utilization */}
      <section className="lg:col-span-4 space-y-6">
        <div className="card">
          <div className="card-hd">
            <h2 className="font-medium">Filters & View</h2>
            <select className="px-2 py-1 rounded-lg border border-slate-300"
                    value={groupBy} onChange={e=>setGroupBy(e.target.value)}>
              <option value="room">Group by Room</option>
              <option value="therapist">Group by Therapist</option>
              <option value="location">Group by Location</option>
            </select>
          </div>
          <div className="card-bd grid grid-cols-1 gap-3">
            <label className="text-sm text-slate-600">
              Location
              <select className="mt-1 w-full rounded-xl border border-slate-300"
                      value={locFilter}
                      onChange={e=>{ setLocFilter(e.target.value); setRoomFilter(""); }}>
                <option value="">All locations</option>
                {locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Room
              <select className="mt-1 w-full rounded-xl border border-slate-300"
                      value={roomFilter}
                      onChange={e=>setRoomFilter(e.target.value)}>
                <option value="">All rooms</option>
                {rooms.filter(r=>!locFilter || r.location_id===Number(locFilter))
                      .map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Therapist
              <select className="mt-1 w-full rounded-xl border border-slate-300"
                      value={therapistFilter}
                      onChange={e=>setTherapistFilter(e.target.value)}>
                <option value="">All therapists</option>
                {therapists.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button className="px-3 py-2 rounded-xl border border-slate-300"
                      onClick={()=>setDate0(new Date())}>This week</button>
              <button className="px-3 py-2 rounded-xl border border-slate-300"
                      onClick={()=>setDate0(addDays(new Date(), 7))}>Next week</button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-hd">
            <h2 className="font-medium">Utilization (2 weeks)</h2>
            <span className="text-xs text-slate-500">9–8 M–Th, 9–4 F–Sat</span>
          </div>
          <div className="card-bd space-y-4">
            {locations.map(l=>{
              const pct = utilByLocation.pct[l.id] || 0;
              return (
                <div key={l.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{l.name}</span><span>{pct}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-2 bg-brand" style={{width:`${pct}%`}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-hd"><h2 className="font-medium">Legend</h2></div>
          <div className="card-bd space-y-2 text-sm">
            {therapists.map(t=>(
              <div key={t.id} className="flex items-center gap-2">
                <span className="h-3 w-3 rounded" style={{background:t.color}}/>
                <span>{t.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* RIGHT: Schedule grid */}
      <section className="lg:col-span-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Schedule — {format(days[0], "MMM d")} – {format(days[13], "MMM d")}
          </h2>
          <button className="px-3 py-2 rounded-xl bg-brand text-white" onClick={()=>{
            setForm({ therapist_id:"", room_id: roomFilter || roomsShown[0]?.id || "", start:"", end:"", notes:"", repeatWeekly:true, repeatCount:1 });
            setOpen(true);
          }}>Create booking</button>
        </div>

        {/* header row with times */}
        <div className="card overflow-auto">
          <div className="grid grid-cols-[160px,1fr] border-b border-slate-200 bg-slate-50">
            <div className="px-3 py-2 text-sm font-medium">Room</div>
            <div className="flex divide-x divide-slate-200">
              {days.map(d=>(
                <div key={d.toISOString()} className="flex-1 px-3 py-2 time-header">
                  {format(d,"EEE, MMM d")}
                </div>
              ))}
            </div>
          </div>

          {/* rows */}
          {roomsShown.map(r=>(
            <div key={r.id} className="grid grid-cols-[160px,1fr] border-b border-slate-100">
              <div className="px-3 py-3 text-sm font-medium">{r.name}</div>
              <div className="relative flex divide-x divide-slate-100">
                {days.map((d,di)=>{
                  const slots = timesForDay(d);
                  return (
                    <div key={di} className="relative flex-1">
                      {/* time ruler (compact) */}
                      <div className="absolute top-0 left-0 right-0 text-[10px] text-slate-400 flex justify-between px-2 pt-1 pointer-events-none">
                        <span>{String(dayHours(d).start).padStart(2,"0")}:00</span>
                        <span>{String(dayHours(d).end).padStart(2,"0")}:00</span>
                      </div>
                      {/* cells */}
                      <div className="mt-5">
                        {slots.map((s,si)=>(
                          <div key={si} className="cell"
                               onClick={()=>{
                                 setForm({
                                   therapist_id: therapistFilter || "",
                                   room_id: r.id.toString(),
                                   start: format(s,"yyyy-MM-dd'T'HH:mm"),
                                   end: format(addMinutes(s,30),"yyyy-MM-dd'T'HH:mm"),
                                   notes:"", repeatWeekly:true, repeatCount:1
                                 });
                                 setOpen(true);
                               }}/>
                        ))}
                      </div>

                      {/* render chips */}
                      {(bookings||[])
                        .filter(b=>b.room_id===r.id && isSameDay(new Date(b.start_time), d))
                        .map(b=>{
                          const t = therapistMap[b.user_id];
                          return (
                            <div key={b.id} className="booking-chip" style={{background: (t?.color||"#4f46e5")}}>
                              <div className="font-semibold truncate">{t?.name || "Therapist"}</div>
                              <div className="opacity-90">
                                {format(new Date(b.start_time),"h:mma")}–{format(new Date(b.end_time),"h:mma")}
                              </div>
                              <button className="absolute right-1 top-1 bg-white/20 rounded px-1"
                                      onClick={(e)=>{ e.stopPropagation(); deleteBooking(b); }}>
                                ✕
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Create modal */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/30 grid place-items-center" onClick={()=>setOpen(false)}>
          <div className="card w-full max-w-xl" onClick={e=>e.stopPropagation()}>
            <div className="card-hd"><h3 className="font-semibold">New Booking</h3></div>
            <div className="card-bd grid md:grid-cols-2 gap-3">
              <label className="text-sm text-slate-600">
                Therapist
                <select className="mt-1 w-full rounded-xl border border-slate-300"
                        value={form.therapist_id} onChange={e=>setForm({...form, therapist_id:e.target.value})}>
                  <option value="">Select therapist</option>
                  {therapists.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label className="text-sm text-slate-600">
                Room
                <select className="mt-1 w-full rounded-xl border border-slate-300"
                        value={form.room_id} onChange={e=>setForm({...form, room_id:e.target.value})}>
                  {roomsShown.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
              <label className="text-sm text-slate-600">
                Start
                <input type="datetime-local" className="mt-1 w-full rounded-xl border border-slate-300"
                       value={form.start} onChange={e=>setForm({...form, start:e.target.value})}/>
              </label>
              <label className="text-sm text-slate-600">
                End
                <input type="datetime-local" className="mt-1 w-full rounded-xl border border-slate-300"
                       value={form.end} onChange={e=>setForm({...form, end:e.target.value})}/>
              </label>
              <label className="md:col-span-2 text-sm text-slate-600">
                Notes
                <textarea className="mt-1 w-full rounded-xl border border-slate-300"
                          value={form.notes} onChange={e=>setForm({...form, notes:e.target.value})}/>
              </label>
              <div className="md:col-span-2 flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.repeatWeekly}
                         onChange={e=>setForm({...form, repeatWeekly:e.target.checked})}/>
                  Repeat weekly
                </label>
                <span className="text-sm">for</span>
                <input type="number" min={0} className="w-20 px-2 py-1 rounded-lg border border-slate-300"
                       value={form.repeatCount} onChange={e=>setForm({...form, repeatCount:Number(e.target.value||0)})}/>
                <span className="text-sm">extra week(s)</span>
              </div>
              <div className="md:col-span-2 flex justify-end gap-2">
                <button className="px-3 py-2 rounded-xl border border-slate-300" onClick={()=>setOpen(false)}>Cancel</button>
                <button className="px-3 py-2 rounded-xl bg-brand text-white" onClick={()=>{
                  if (!form.therapist_id || !form.room_id || !form.start || !form.end) return alert("Complete all fields.");
                  createBooking({
                    room_id: Number(form.room_id),
                    start_time: new Date(form.start).toISOString(),
                    end_time: new Date(form.end).toISOString(),
                    notes: form.notes,
                    repeatWeekly: form.repeatWeekly,
                    repeatCount: form.repeatCount
                  });
                  setOpen(false);
                }}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
