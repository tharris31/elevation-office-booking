"use client";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";

export const metadata = { title: "Elevation Office Booking" };

export default function RootLayout({ children }) {
  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, Arial" }}>
        <header style={{ display:"flex", gap:16, alignItems:"center", padding:"12px 16px", borderBottom:"1px solid #eee" }}>
          <strong>Elevation Office Booking</strong>
          <nav style={{ display:"flex", gap:12 }}>
            <Link href="/">Home</Link>
            <Link href="/rooms">Rooms</Link>
            <Link href="/bookings">Bookings</Link>
          </nav>
          <div style={{ marginLeft:"auto" }}>
            <button onClick={signOut}>Sign out</button>
          </div>
        </header>
        <div style={{ padding: 24 }}>{children}</div>
      </body>
    </html>
  );
}
