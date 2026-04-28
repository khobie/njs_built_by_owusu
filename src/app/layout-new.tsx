import './globals-new.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>NJS Form System - Vetting Dashboard</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
