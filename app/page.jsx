"use client";

export default function Home() {
  return (
    <main className="p-10 max-w-4xl mx-auto">
      <div className="bg-white shadow rounded-2xl p-8">
        <h1 className="text-3xl font-bold text-indigo-700">
          Elevation Office Booking
        </h1>
        <p className="mt-3 text-gray-600 text-lg">
          Welcome to the scheduling system for Elevation Therapy. 
          Use the navigation above to manage:
        </p>

        <ul className="mt-6 space-y-3 text-gray-700">
          <li className="flex items-center">
            <span className="mr-2">📅</span> 
            <strong>Bookings</strong> — View, create, and manage therapy room schedules.
          </li>
          <li className="flex items-center">
            <span className="mr-2">🏢</span> 
            <strong>Rooms</strong> — See all available offices at each location.
          </li>
          <li className="flex items-center">
            <span className="mr-2">👩‍⚕️</span> 
            <strong>Therapists</strong> — Manage therapist profiles, colors, and availability.
          </li>
        </ul>

        <div className="mt-8">
          <p className="text-sm text-gray-500">
            Tip: Use the filters on the Bookings page to quickly switch between 
            locations, rooms, and therapist schedules.
          </p>
        </div>
      </div>
    </main>
  );
}
