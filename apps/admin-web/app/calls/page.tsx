import Link from 'next/link';
import { getPrisma } from '@aicc2/db';

export const dynamic = 'force-dynamic';

interface SearchParams {
  state?: 'new' | 'in_progress' | 'done' | 'needs_human';
}

export default async function CallsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const prisma = getPrisma();
  const where = searchParams.state ? { status: { state: searchParams.state } } : {};
  const calls = await prisma.call.findMany({
    where,
    orderBy: { started_at: 'desc' },
    include: { status: true },
    take: 100,
  });

  return (
    <div>
      <h1>通話一覧</h1>
      <nav style={{ marginBottom: 16 }}>
        <Link href="/calls">すべて</Link>{' | '}
        <Link href="/calls?state=new">新着</Link>{' | '}
        <Link href="/calls?state=needs_human">要対応</Link>{' | '}
        <Link href="/calls?state=done">対応済</Link>
      </nav>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
            <th>着信</th>
            <th>結果</th>
            <th>ステータス</th>
            <th>サマリ</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {calls.map((c) => (
            <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td>{c.started_at.toISOString()}</td>
              <td>{c.outcome}</td>
              <td>{c.status?.state ?? 'new'}</td>
              <td>
                {(c.extracted as { summary?: string } | null)?.summary ?? '—'}
              </td>
              <td>
                <Link href={`/calls/${c.id}`}>詳細</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
