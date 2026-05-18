import type { ReactNode } from 'react';

export const metadata = {
  title: 'AICallCenter2 管理画面',
  description: '医療機関向け AI 電話 SaaS 管理コンソール',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body style={{ fontFamily: 'system-ui, -apple-system, sans-serif', margin: 0 }}>
        <header style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb' }}>
          <strong>AICallCenter2</strong>
          <span style={{ marginLeft: 12, color: '#6b7280' }}>管理画面</span>
        </header>
        <main style={{ padding: 24 }}>{children}</main>
      </body>
    </html>
  );
}
