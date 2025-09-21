export const metadata = { title: "Elevation Office Booking" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, Arial" }}>{children}</body>
    </html>
  );
}
