// app/layout.jsx
import "./globals.css";
import Link from "next/link";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Elevation Office Booking",
  description: "Internal room & therapist scheduler",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <header className="site-header">
          <div className="site-header__brand">Elevation Office Booking</div>
          <nav className="site-header__nav">
            <Link href="/">Home</Link>
            <Link href="/rooms">Rooms</Link>
            <Link href="/bookings">Bookings</Link>
            <Link href="/therapists">Therapists</Link>
          </nav>
          <div className="site-header__auth">
            <a className="btn" href="/login">Sign in</a>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
