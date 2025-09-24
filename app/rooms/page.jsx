'use client';
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function RoomsPage() {
  const [locations, setLocations] = useState([]);
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: locs } = await supabase.from("locations").select("*").order("name");
      setLocations(locs || []);
      const { data: rms } = await supabase.from("rooms").select("*").order("name");
      setRooms(rms || []);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="card-hd"><h2 className="font-medium">Rooms by Location</h2></div>
        <div className="card-bd grid md:grid-cols-3 gap-4">
          {locations.map(l=>(
            <div key={l.id} className="card">
              <div className="card-hd">{l.name}</div>
              <div className="card-bd">
                <ul className="list-disc pl-5 space-y-1">
                  {rooms.filter(r=>r.location_id===l.id).map(r=><li key={r.id}>{r.name}</li>)}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
