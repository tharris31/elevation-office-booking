// app/layout.jsx
import "./globals.css";
import Link from "next/link";

export const metadata = { title: "Elevation Office Booking" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900">
        <header className="border-b bg-white">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-6">
            <div className="font-semibold">Elevation Office Booking</div>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/" className="hover:text-indigo-600">Home</Link>
              <Link href="/rooms" className="hover:text-indigo-600">Rooms</Link>
              <Link href="/bookings" className="hover:text-indigo-600">Bookings</Link>
              <Link href="/therapists" className="hover:text-indigo-600">Therapists</Link>
            </nav>
            <div className="ml-auto">
              {/* optional sign-in button area */}
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
