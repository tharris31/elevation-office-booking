import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "Elevation Office Booking",
  description: "Internal office room scheduling",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="header">
          <div style={{ fontWeight: 600 }}>Elevation Office Booking</div>
          <nav className="nav">
            <Link href="/">Home</Link>
            <Link href="/rooms">Rooms</Link>
            <Link href="/bookings">Bookings</Link>
            <Link href="/therapists">Therapists</Link>
          </nav>
          <div style={{ marginLeft: "auto" }}>
            <a className="btn" href="/login">Sign in</a>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
