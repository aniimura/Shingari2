import { notFound } from 'next/navigation';
import { getPrisma } from '@aicc2/db';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const dynamic = 'force-dynamic';

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'ap-northeast-1' });

export default async function CallDetail({ params }: { params: { id: string } }) {
  const call = await getPrisma().call.findUnique({
    where: { id: params.id },
    include: { status: true, appointments: true },
  });
  if (!call) return notFound();

  let audioUrl: string | null = null;
  if (call.recording_s3_key && process.env.RECORDINGS_S3_BUCKET) {
    audioUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: process.env.RECORDINGS_S3_BUCKET,
        Key: call.recording_s3_key,
      }),
      { expiresIn: 300 },
    );
  }

  return (
    <div>
      <h1>通話 {call.id}</h1>
      <p>
        着信: {call.started_at.toISOString()} / 結果: {call.outcome} / ステータス:{' '}
        {call.status?.state ?? 'new'}
      </p>

      {audioUrl ? (
        <audio controls src={audioUrl} style={{ width: '100%' }} />
      ) : (
        <p>録音は未取得です。</p>
      )}

      <section>
        <h2>抽出情報</h2>
        <pre style={{ background: '#f9fafb', padding: 12 }}>
          {JSON.stringify(call.extracted, null, 2)}
        </pre>
      </section>

      <section>
        <h2>トランスクリプト</h2>
        <pre style={{ background: '#f9fafb', padding: 12, whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(call.transcript, null, 2)}
        </pre>
      </section>

      <section>
        <h2>紐づく予約</h2>
        <ul>
          {call.appointments.map((a) => (
            <li key={a.id}>
              {a.slot_at.toISOString()} — {a.course} ({a.state})
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
