"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) window.location.href = "/";
    })();
  }, []);

  const signIn = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError(error.message); else window.location.href = "/";
  };

  return (
    <main style={{ maxWidth: 360, margin: "10vh auto", padding: 24, border: "1px solid #ddd", borderRadius: 8 }}>
      <h1 style={{ marginTop: 0 }}>Staff Login</h1>
      <form onSubmit={signIn}>
        <label>Email</label>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required style={{ width: "100%", marginBottom: 12, padding: 8 }} />
        <label>Password</label>
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required style={{ width: "100%", marginBottom: 12, padding: 8 }} />
        {error && <p style={{ color: "crimson" }}>{error}</p>}
        <button type="submit" disabled={loading} style={{ width: "100%", padding: 10 }}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
