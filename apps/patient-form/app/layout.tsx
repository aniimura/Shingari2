import type { ReactNode } from 'react';

export const metadata = { title: 'ご予約確認' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body
        style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          maxWidth: 480,
          margin: '0 auto',
          padding: 24,
        }}
      >
        {children}
      </body>
    </html>
  );
}
