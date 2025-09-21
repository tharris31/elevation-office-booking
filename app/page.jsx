"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Home() {
  const [status, setStatus] = useState("Checking login...");
  const [ready, setReady] = useState(false);
  const [locations, setLocations] = useState([]);

  useEffect(() => {
    (async () => {
      // Require login
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = "/login"; return; }

      setStatus("Connected — loading locations...");
      try {
        const { data, error } = await supabase
          .from("locations")
          .select("id,name")
          .order("name")
          .limit(20);
        if (error) throw error;
        setLocations(data ?? []);
        setStatus("Connected to Supabase");
      } catch {
        setStatus("Could not read locations. Check policies.");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  if (!ready) return <main style={{ padding: 24 }}><p>{status}</p></main>;

  return (
    <main style={{ padding: 24 }}>
      <h1>Elevation Office Booking</h1>
      <p>{status}</p>
      <section style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
        <h2 style={{ marginTop: 0 }}>Locations</h2>
        {locations.length === 0 ? (
          <p>No locations yet. Add one in Supabase → Table Editor.</p>
        ) : (
          <ul>{locations.map((l) => <li key={l.id}>{l.name}</li>)}</ul>
        )}
      </section>
    </main>
  );
}
