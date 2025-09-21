"use client";
import { supabase } from "../lib/supabaseClient";

export default function ClientNav() {
  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }
  return <button onClick={signOut}>Sign out</button>;
}
