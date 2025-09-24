export const metadata = { title: "Elevation Office Booking" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <header className="sticky top-0 z-40 backdrop-blur bg-white/80 border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-2xl bg-brand text-white grid place-items-center font-bold">E</div>
              <div className="leading-tight">
                <div className="font-semibold">Elevation Office Booking</div>
                <div className="text-xs text-slate-500">Internal scheduling</div>
              </div>
            </div>
            <nav className="flex items-center gap-5 text-sm">
              <a className="nav-link" href="/">Home</a>
              <a className="nav-link" href="/rooms">Rooms</a>
              <a className="nav-link" href="/bookings">Bookings</a>
              <a className="nav-link" href="/therapists">Therapists</a>
            </nav>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
