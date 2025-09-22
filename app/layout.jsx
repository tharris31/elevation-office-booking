import Link from "next/link";
import "./globals.css";
import ClientNav from "./ClientNav";

export const metadata = { title: "Elevation Office Booking" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="header">
          <strong>Elevation Office Booking</strong>
          <nav className="nav">
            <Link href="/">Home</Link>
            <Link href="/rooms">Rooms</Link>
            <Link href="/bookings">Bookings</Link>
          </nav>
          <div style={{ marginLeft: "auto" }}>
            <ClientNav />
          </div>
        </header>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}
