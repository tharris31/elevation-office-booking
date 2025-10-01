"use client";

export default function Home() {
  return (
    <main className="p-10 max-w-4xl mx-auto">
      <div className="bg-white shadow-sm border rounded-2xl p-8">
        <h1 className="text-3xl font-bold text-indigo-700">
          Elevation Office Booking
        </h1>
        <p className="mt-3 text-gray-600 text-lg">
          Welcome to the scheduling system for Elevation Therapy.
          Use the navigation above to manage:
        </p>

        <ul className="mt-6 grid gap-3 text-gray-700">
          <li>📅 <strong>Bookings</strong> — View, create, and manage room schedules.</li>
          <li>🏢 <strong>Rooms</strong> — Offices grouped by location.</li>
          <li>👩‍⚕️ <strong>Therapists</strong> — Manage profiles, colors, active status.</li>
        </ul>

        <div className="mt-6">
          <p className="text-sm text-gray-500">
            Tip: Use the filters on the Bookings page to switch between locations, rooms, and therapist schedules.
          </p>
        </div>
      </div>
    </main>
  );
}
