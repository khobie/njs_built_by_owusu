import './globals.css';

export const metadata = {
  title: 'NJS Delegate Management · Electoral Commission',
  description: 'Delegate management system for New Juaben South Municipality',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

