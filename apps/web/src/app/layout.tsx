import type { Metadata } from 'next';
import './globals.css';
import './workspace.css';
import './interface.css';
import AppFrame from '../components/app-frame';

export const metadata: Metadata = {
  title: 'Premium Retail POS',
  description: 'Multi-location retail management, inventory ledger, and point-of-sale system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "try { document.documentElement.dataset.theme = localStorage.getItem('premium-retail-theme') === 'dark' ? 'dark' : 'light'; } catch {}" }} />
      </head>
      <body><AppFrame>{children}</AppFrame></body>
    </html>
  );
}
