"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function RoomsPage() {
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState([]);
  const [selectedLoc, setSelectedLoc] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [newRoom, setNewRoom] = useState("");

  useEffect(() => {
    (async () => {
      // require login
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = "/login"; return; }

      const { data: locs } = await supabase.from("locations").select("id,name").order("name");
      setLocations(locs ?? []);
      if (locs?.length) setSelectedLoc(locs[0].id);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selectedLoc) return;
    (async () => {
      const { data } = await supabase
        .from("rooms")
        .select("id,name,location_id")
        .eq("location_id", selectedLoc)
        .order("name");
      setRooms(data ?? []);
    })();
  }, [selectedLoc]);

  async function addRoom(e) {
    e.preventDefault();
    if (!newRoom.trim() || !selectedLoc) return;
    const { error } = await supabase.from("rooms").insert({ name: newRoom.trim(), location_id: selectedLoc });
    if (!error) {
      setNewRoom("");
      const { data } = await supabase.from("rooms").select("id,name,location_id").eq("location_id", selectedLoc).order("name");
      setRooms(data ?? []);
    } else {
      alert(error.message);
    }
  }

  if (loading) return <p>Loading…</p>;

  return (
    <main>
      <h1>Rooms</h1>
      <label>Location:&nbsp;</label>
      <select value={selectedLoc ?? ""} onChange={e=>setSelectedLoc(Number(e.target.value))}>
        {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>

      <form onSubmit={addRoom} style={{ marginTop: 16 }}>
        <input placeholder="New room name" value={newRoom} onChange={e=>setNewRoom(e.target.value)} />
        <button type="submit">Add room</button>
      </form>

      <ul style={{ marginTop: 16 }}>
        {rooms.map(r => <li key={r.id}>{r.name}</li>)}
        {rooms.length === 0 && <li>No rooms yet for this location.</li>}
      </ul>
    </main>
  );
}
