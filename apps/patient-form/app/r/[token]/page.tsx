import { notFound } from 'next/navigation';
import { getPrisma } from '@aicc2/db';

export const dynamic = 'force-dynamic';

export default async function PatientLandingPage({
  params,
}: {
  params: { token: string };
}) {
  const prisma = getPrisma();
  const token = await prisma.smsToken.findUnique({ where: { token: params.token } });
  if (!token || token.expires_at < new Date()) return notFound();

  const appointmentId = (token.payload as { appointment_id?: string }).appointment_id;
  const appointment = appointmentId
    ? await prisma.appointment.findUnique({ where: { id: appointmentId } })
    : null;
  if (!appointment) return notFound();

  return (
    <div>
      <h1>ご予約内容のご確認</h1>
      <dl>
        <dt>日時</dt>
        <dd>{appointment.slot_at.toISOString()}</dd>
        <dt>コース</dt>
        <dd>{appointment.course}</dd>
        <dt>状態</dt>
        <dd>{appointment.state}</dd>
      </dl>

      {appointment.state !== 'cancelled' && (
        <form action={`/api/r/${params.token}/cancel`} method="post">
          <button type="submit" style={{ padding: '12px 16px' }}>
            キャンセルする
          </button>
        </form>
      )}
    </div>
  );
}
