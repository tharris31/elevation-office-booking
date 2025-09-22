"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function RoomsPage() {
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [newRoom, setNewRoom] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = "/login"; return; }
      const { data: locs } = await supabase.from("locations").select("id,name").order("name");
      setLocations(locs ?? []);
      if (locs?.length) setLocationId(locs[0].id);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!locationId) return;
    (async () => {
      const { data } = await supabase
        .from("rooms").select("id,name").eq("location_id", locationId).order("name");
      setRooms(data ?? []);
    })();
  }, [locationId]);

  async function addRoom(e) {
    e.preventDefault();
    if (!newRoom.trim() || !locationId) return;
    const { error } = await supabase.from("rooms").insert({ name: newRoom.trim(), location_id: locationId });
    if (error) return alert(error.message);
    setNewRoom("");
    const { data } = await supabase.from("rooms").select("id,name").eq("location_id", locationId).order("name");
    setRooms(data ?? []);
  }

  if (loading) return <p>Loading…</p>;

  return (
    <>
      <h1 className="h1">Rooms</h1>

      <div className="card">
        <div className="grid2">
          <div>
            <label>Location</label>
            <select className="mt8 input" value={locationId ?? ""} onChange={e=>setLocationId(Number(e.target.value))}>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <form onSubmit={addRoom}>
            <label>Add a new room</label>
            <div className="grid2 mt8">
              <input className="input" placeholder="Room name (e.g., Room 1)" value={newRoom}
                     onChange={e=>setNewRoom(e.target.value)} />
              <button className="btn" type="submit">Add</button>
            </div>
          </form>
        </div>

        <h2 className="h2 mt24">Rooms in this location</h2>
        {rooms.length === 0 ? (
          <p className="muted">No rooms yet for this location.</p>
        ) : (
          <ul className="mt8">
            {rooms.map(r => <li key={r.id}>{r.name}</li>)}
          </ul>
        )}
      </div>
    </>
  );
}
