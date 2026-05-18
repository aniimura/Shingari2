import { NextResponse } from 'next/server';
import { getPrisma } from '@aicc2/db';

export async function POST(
  _req: Request,
  { params }: { params: { token: string } },
) {
  const prisma = getPrisma();
  const token = await prisma.smsToken.findUnique({ where: { token: params.token } });
  if (!token || token.expires_at < new Date()) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 404 });
  }
  const appointmentId = (token.payload as { appointment_id?: string }).appointment_id;
  if (!appointmentId) {
    return NextResponse.json({ error: 'no_appointment' }, { status: 400 });
  }
  await prisma.$transaction([
    prisma.appointment.update({
      where: { id: appointmentId },
      data: { state: 'cancelled' },
    }),
    prisma.smsToken.update({
      where: { token: params.token },
      data: { consumed_at: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        actor: 'patient_self_service',
        action: 'cancel_appointment',
        target: appointmentId,
        payload: { via: 'sms_link' },
      },
    }),
  ]);
  return NextResponse.redirect(new URL(`/r/${params.token}`, _req.url), 303);
}
