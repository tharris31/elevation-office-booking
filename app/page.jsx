"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Home() {
  const [status, setStatus] = useState("Checking connection...");
  const [locations, setLocations] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from("locations").select("id,name").limit(5);
        if (error) throw error;
        setLocations(data ?? []);
        setStatus("✅ Connected to Supabase");
      } catch {
        setStatus("❌ Could not connect. Check ENV keys and policies.");
      }
    })();
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <h1>Elevation Office Booking</h1>
      <p>{status}</p>

      <section style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
        <h2 style={{ marginTop: 0 }}>Locations (sample read)</h2>
        {locations.length === 0 ? (
          <p>No locations yet. Add one in Supabase → Table Editor.</p>
        ) : (
          <ul>{locations.map((l) => <li key={l.id}>{l.name}</li>)}</ul>
        )}
      </section>
    </main>
  );
}
