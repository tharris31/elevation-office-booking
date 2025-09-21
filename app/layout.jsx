import Link from "next/link";
import ClientNav from "./ClientNav";

export const metadata = { title: "Elevation Office Booking" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, Arial" }}>
        <header style={{ display: "flex", gap: 16, alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #eee" }}>
          <strong>Elevation Office Booking</strong>
          <nav style={{ display: "flex", gap: 12 }}>
            <Link href="/">Home</Link>
            <Link href="/rooms">Rooms</Link>
            <Link href="/bookings">Bookings</Link>
          </nav>
          <div style={{ marginLeft: "auto" }}>
            <ClientNav />
          </div>
        </header>
        <div style={{ padding: 24 }}>{children}</div>
      </body>
    </html>
  );
}
