"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function TherapistsPage() {
  const [therapists, setTherapists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newTherapist, setNewTherapist] = useState({
    display_name: "",
    email: "",
    color: "#6366F1", // default indigo
  });

  useEffect(() => {
    fetchTherapists();
  }, []);

  async function fetchTherapists() {
    setLoading(true);
    const { data, error } = await supabase.from("profiles").select("*");
    if (error) console.error(error);
    else setTherapists(data);
    setLoading(false);
  }

  async function addTherapist() {
    if (!newTherapist.display_name) {
      alert("Name is required");
      return;
    }
    const { error } = await supabase.from("profiles").insert([newTherapist]);
    if (error) {
      alert(error.message);
    } else {
      setNewTherapist({ display_name: "", email: "", color: "#6366F1" });
      fetchTherapists();
    }
  }

  async function updateTherapist(id, updates) {
    const { error } = await supabase.from("profiles").update(updates).eq("id", id);
    if (error) alert(error.message);
    else fetchTherapists();
  }

  async function deleteTherapist(id) {
    if (!confirm("Are you sure you want to delete this therapist?")) return;
    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if (error) alert(error.message);
    else fetchTherapists();
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Therapists</h1>

      {/* Add Therapist Form */}
      <div className="mb-8 p-4 border rounded-xl bg-gray-50">
        <h2 className="font-semibold mb-3">Add Therapist</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="text"
            placeholder="Name"
            value={newTherapist.display_name}
            onChange={(e) =>
              setNewTherapist({ ...newTherapist, display_name: e.target.value })
            }
            className="p-2 border rounded"
          />
          <input
            type="email"
            placeholder="Email (optional)"
            value={newTherapist.email}
            onChange={(e) =>
              setNewTherapist({ ...newTherapist, email: e.target.value })
            }
            className="p-2 border rounded"
          />
          <input
            type="color"
            value={newTherapist.color}
            onChange={(e) =>
              setNewTherapist({ ...newTherapist, color: e.target.value })
            }
            className="w-12 h-10 cursor-pointer border rounded"
          />
        </div>
        <button
          onClick={addTherapist}
          className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-lg"
        >
          Add
        </button>
      </div>

      {/* Therapists Table */}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <table className="min-w-full border border-gray-200 rounded-lg overflow-hidden">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 text-left">Color</th>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {therapists.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="px-4 py-2">
                  <input
                    type="color"
                    value={t.color || "#6366F1"}
                    onChange={(e) =>
                      updateTherapist(t.id, { color: e.target.value })
                    }
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={t.display_name || ""}
                    onChange={(e) =>
                      updateTherapist(t.id, { display_name: e.target.value })
                    }
                    className="p-1 border rounded"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="email"
                    value={t.email || ""}
                    onChange={(e) =>
                      updateTherapist(t.id, { email: e.target.value })
                    }
                    className="p-1 border rounded"
                  />
                </td>
                <td className="px-4 py-2">{t.active ? "Active" : "Inactive"}</td>
                <td className="px-4 py-2 flex gap-2">
                  <button
                    onClick={() =>
                      updateTherapist(t.id, { active: !t.active })
                    }
                    className="px-2 py-1 text-sm bg-blue-100 rounded"
                  >
                    {t.active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    onClick={() => deleteTherapist(t.id)}
                    className="px-2 py-1 text-sm bg-red-100 rounded"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
