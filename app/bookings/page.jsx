"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  format, addMinutes, startOfDay, endOfDay,
  eachDayOfInterval, isSameDay, parseISO
} from "date-fns";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Business hours used for utilization + grid
const HOURS = {
  monThu: { start: 9, end: 20 }, // 9am – 8pm
  friSat: { start: 9, end: 16 }, // 9am – 4pm
};

function dayHours(date) {
  const dow = date.getDay(); // Sun=0 .. Sat=6
  if (dow === 5 || dow === 6) return HOURS.friSat; // Fri/Sat
  return HOURS.monThu; // Sun–Thu (we’ll still display Mon–Sat in UI)
}

function slotTimesForDay(date, slotMinutes = 30) {
  const { start, end } = dayHours(date);
  const startT = new Date(date);
  startT.setHours(start, 0, 0, 0);
  const endT = new Date(date);
  endT.setHours(end, 0, 0, 0);

  const out = [];
  let t = startT;
  while (t < endT) {
    out.push(new Date(t));
    t = addMinutes(t, slotMinutes);
  }
  return out;
}

export default function BookingsPage() {
  // --- state
  const [locations, setLocations] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [therapists, setTherapists] = useState([]);
  const [bookings, setBookings] = useState([]);

  const [locationId, setLocationId] = useState(""); // "" means ALL
  const [roomId, setRoomId] = useState("");         // "" means ALL
  const [therapistId, setTherapistId] = useState(""); // "" means ALL
  const [groupBy, setGroupBy] = useState("room"); // room | therapist | location

  // 2-week window (Mon–Sat only)
  const [rangeStart] = useState(() => {
    const d = new Date(); d.setHours(0,0,0,0); return d;
  });
  const [rangeEnd] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 13); d.setHours(23,59,59,999); return d;
  });

  // --- load data
  useEffect(() => {
    (async () => {
      const [{ data: locs }, { data: rms }, { data: ths }] = await Promise.all([
        supabase.from("locations").select("*").order("name"),
        supabase.from("rooms").select("*").order("name"),
        supabase.from("profiles").select("id,name").order("name"),
      ]);
      setLocations(locs || []);
      setRooms(rms || []);
      setTherapists(ths || []);
    })();
  }, []);

  // fetch bookings for window
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, room_id, therapist_id, start_time, end_time, notes")
        .gte("start_time", rangeStart.toISOString())
        .lte("start_time", rangeEnd.toISOString());

      if (!error) setBookings(data || []);
    })();
  }, [rangeStart, rangeEnd]);

  // dependent: rooms by location (keep "" == ALL)
  const roomsForLocation = useMemo(() => {
    if (!locationId) return rooms;
    return rooms.filter(r => r.location_id === Number(locationId));
  }, [rooms, locationId]);

  // Don’t auto-select a room when “All rooms” is intended
  useEffect(() => {
    if (roomId && !roomsForLocation.some(r => String(r.id) === String(roomId))) {
      setRoomId(""); // reset if filtered out
    }
  }, [roomsForLocation, roomId]);

  // filter bookings according to filters
  const filtered = useMemo(() => {
    return bookings.filter(b => {
      if (locationId) {
        const r = rooms.find(r => r.id === b.room_id);
        if (!r || String(r.location_id) !== String(locationId)) return false;
      }
      if (roomId && String(b.room_id) !== String(roomId)) return false;
      if (therapistId && String(b.therapist_id) !== String(therapistId)) return false;
      return true;
    });
  }, [bookings, locationId, roomId, therapistId, rooms]);

  // compute days list (Mon–Sat only)
  const days = useMemo(() => {
    const all = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
    return all.filter(d => d.getDay() !== 0); // drop Sundays
  }, [rangeStart, rangeEnd]);

  // maps for labels
  const roomMap = useMemo(() => Object.fromEntries(rooms.map(r => [r.id, r])), [rooms]);
  const therapistMap = useMemo(() => Object.fromEntries(therapists.map(t => [t.id, t])), [therapists]);
  const locationMap = useMemo(() => Object.fromEntries(locations.map(l => [l.id, l])), [locations]);

  // utilization by location
  const utilization = useMemo(() => {
    const byLocation = {};
    // open minutes per location for this window
    days.forEach(day => {
      const { start, end } = dayHours(day);
      const open = (end - start) * 60; // minutes per room
      rooms.forEach(r => {
        if (locationId && String(r.location_id) !== String(locationId)) return;
        byLocation[r.location_id] = byLocation[r.location_id] || { used: 0, open: 0 };
        byLocation[r.location_id].open += open;
      });
    });
    // used minutes
    filtered.forEach(b => {
      const r = roomMap[b.room_id]; if (!r) return;
      const start = new Date(b.start_time);
      const end = new Date(b.end_time);
      // count only minutes inside business hours and inside range
      days.forEach(day => {
        const { start: S, end: E } = dayHours(day);
        const dayStart = new Date(day); dayStart.setHours(S,0,0,0);
        const dayEnd = new Date(day); dayEnd.setHours(E,0,0,0);
        const overlapStart = new Date(Math.max(start, dayStart));
        const overlapEnd = new Date(Math.min(end, dayEnd));
        const mins = Math.max(0, (overlapEnd - overlapStart) / 60000);
        if (mins > 0) {
          const key = r.location_id;
          byLocation[key] = byLocation[key] || { used: 0, open: 0 };
          byLocation[key].used += mins;
        }
      });
    });
    return byLocation;
  }, [days, filtered, rooms, roomMap, locationId]);

  // UI helpers
  function labelForGroup(entityId) {
    if (groupBy === "room") return roomMap[entityId]?.name || "Room";
    if (groupBy === "therapist") return therapistMap[entityId]?.name || "Therapist";
    if (groupBy === "location") return locationMap[entityId]?.name || "Location";
    return "";
  }

  // group entities for rows
  const rowEntities = useMemo(() => {
    if (groupBy === "room") {
      return roomsForLocation.filter(r => !roomId || String(r.id) === String(roomId)).map(r => ({ type: "room", id: r.id }));
    }
    if (groupBy === "therapist") {
      return therapists.map(t => ({ type: "therapist", id: t.id }));
    }
    // location
    const locs = locationId ? locations.filter(l => String(l.id) === String(locationId)) : locations;
    return locs.map(l => ({ type: "location", id: l.id }));
  }, [groupBy, roomsForLocation, roomId, therapists, locations, locationId]);

  // bookings for a row entity & day
  function bookingsForRowDay(entity, day) {
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    return filtered.filter(b => {
      const s = new Date(b.start_time);
      const e = new Date(b.end_time);
      const inDay = e > dayStart && s < dayEnd;
      if (!inDay) return false;
      if (entity.type === "room") return b.room_id === entity.id;
      if (entity.type === "therapist") return String(b.therapist_id) === String(entity.id);
      if (entity.type === "location") {
        const r = roomMap[b.room_id];
        return r && r.location_id === entity.id;
      }
      return false;
    });
  }

  // delete booking (single)
  async function deleteBooking(id) {
    await supabase.from("bookings").delete().eq("id", id);
    setBookings(prev => prev.filter(b => b.id !== id));
  }

  // --- render
  return (
    <div className="container">
      <div className="toolbar">
        <h1>Elevation — Room & Therapist Scheduler</h1>
        <div className="toolbar-actions">
          {/* Your "Create booking" button/modal stays as-is in your project if you have it.
              This page focuses on rendering, filters, utilization, and room dropdown fix. */}
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="card-head">Filters & View</div>
        <div className="filters-grid">
          <div>
            <label>Location</label>
            <select value={locationId} onChange={(e) => { setLocationId(e.target.value); /* keep room as chosen or reset */ }}>
              <option value="">All locations</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          <div>
            <label>Room</label>
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">All rooms</option>
              {roomsForLocation.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label>Therapist filter</label>
            <select value={therapistId} onChange={(e) => setTherapistId(e.target.value)}>
              <option value="">All therapists</option>
              {therapists.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div>
            <label>Group</label>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
              <option value="room">Group by Room</option>
              <option value="therapist">Group by Therapist</option>
              <option value="location">Group by Location</option>
            </select>
          </div>
        </div>
      </div>

      {/* Utilization + open slots */}
      <div className="card">
        <div className="card-head">Utilization (this 2-week window)</div>
        <div className="util-grid">
          {(locationId ? locations.filter(l => String(l.id) === String(locationId)) : locations).map(l => {
            const u = utilization[l.id] || { used: 0, open: 0 };
            const pct = u.open ? Math.round((u.used / u.open) * 100) : 0;
            const openRooms = rooms.filter(r => String(r.location_id) === String(l.id)).length;
            return (
              <div className="util-item" key={l.id}>
                <div className="util-top">
                  <div>{l.name}</div>
                  <div className="util-pct">{pct}%</div>
                </div>
                <div className="util-bar">
                  <div className="util-fill" style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <div className="util-meta">
                  <span>{Math.round(u.used)} min used</span>
                  <span> / </span>
                  <span>{Math.round(u.open)} min open</span>
                  <span> • {openRooms} rooms</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Schedule */}
      <div className="card">
        <div className="card-head">Schedule — {format(rangeStart, "MMM d")} – {format(rangeEnd, "MMM d")}</div>

        {days.map(day => (
          <div key={day.toISOString()} className="day-block">
            <div className="day-title">{format(day, "EEEE, MMM d")}</div>

            {/* Header row of times */}
            <div className="grid-row header">
              <div className="first-col">{
                groupBy === "room" ? "Room" :
                groupBy === "therapist" ? "Therapist" : "Location"
              }</div>
              <div className="time-strip">
                {slotTimesForDay(day).map(t => (
                  <div key={t.toISOString()} className="time-cell">
                    {format(t, "h:mma")}
                  </div>
                ))}
              </div>
            </div>

            {/* Rows */}
            {rowEntities.map(entity => {
              const slots = slotTimesForDay(day);
              const items = bookingsForRowDay(entity, day);
              return (
                <div className="grid-row" key={`${entity.type}-${entity.id}-${day.toDateString()}`}>
                  <div className="first-col">{labelForGroup(entity.id)}</div>
                  <div className="time-strip">
                    {slots.map(s => (
                      <div key={s.toISOString()} className="time-cell slot-cell">
                        {/* render any bookings overlapping this slot */}
                        {items.filter(b => {
                          const bs = new Date(b.start_time);
                          const be = new Date(b.end_time);
                          const se = addMinutes(s, 30);
                          return be > s && bs < se;
                        }).map(b => (
                          <div className="chip" key={b.id} title={`${format(new Date(b.start_time),"h:mma")} - ${format(new Date(b.end_time),"h:mma")}`}>
                            <div className="chip-main">
                              <div className="chip-title">
                                {groupBy === "room" || groupBy === "location"
                                  ? therapistMap[b.therapist_id]?.name || "Therapist"
                                  : roomMap[b.room_id]?.name || "Room"}
                              </div>
                              <div className="chip-time">
                                {format(new Date(b.start_time),"h:mma")}–{format(new Date(b.end_time),"h:mma")}
                              </div>
                            </div>
                            <button className="chip-del" onClick={() => deleteBooking(b.id)} aria-label="Delete booking">✕</button>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
