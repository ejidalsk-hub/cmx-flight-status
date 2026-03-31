import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CMX Airport Live Flight Status',
  description: 'Live arrivals, departures, weather, and webcam info for CMX.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
