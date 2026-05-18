import Link from 'next/link';

export default function HomePage() {
  return (
    <div>
      <h1>ダッシュボード</h1>
      <ul>
        <li>
          <Link href="/calls">通話一覧</Link>
        </li>
      </ul>
    </div>
  );
}
