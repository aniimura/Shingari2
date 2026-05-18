import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { nanoid } from 'nanoid';
import { getPrisma } from '@aicc2/db';
import { bookAppointmentInput, bookAppointmentOutput } from '@aicc2/shared/tools';
import { resolveAdapter } from '../adapters/emr.js';
import { sendSms } from '../adapters/sms.js';

const FORM_BASE = process.env.PATIENT_FORM_BASE_URL ?? 'https://form.aicc2.example';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const parsed = bookAppointmentInput.safeParse(JSON.parse(event.body ?? '{}'));
  if (!parsed.success) {
    return { statusCode: 400, body: JSON.stringify({ error: parsed.error.flatten() }) };
  }
  const args = parsed.data;
  const prisma = getPrisma();

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: args.tenant_id } });
  const adapter = resolveAdapter(tenant.emr_adapter);

  const { patient_external_id } = await adapter.book(args);

  const appointment = await prisma.$transaction(async (tx) => {
    const created = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "Appointment" (
        id, tenant_id, patient_external_id,
        patient_kana_enc, patient_dob_enc, callback_phone_enc,
        slot_at, course, options, source, state, call_id, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), ${args.tenant_id}::uuid, ${patient_external_id},
        pgp_sym_encrypt(${args.patient.kana}, current_setting('app.pii_key')),
        pgp_sym_encrypt(${args.patient.date_of_birth}, current_setting('app.pii_key')),
        pgp_sym_encrypt(${args.patient.callback_phone}, current_setting('app.pii_key')),
        ${args.slot_at}::timestamptz, ${args.course}, ${args.options}::jsonb,
        'ai_call', 'confirmed', ${args.call_id}::uuid, now(), now()
      )
      RETURNING id
    `;
    return created[0]!;
  });

  const token = nanoid(24);
  await prisma.smsToken.create({
    data: {
      token,
      call_id: args.call_id,
      purpose: 'confirm',
      payload: { appointment_id: appointment.id },
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  let smsSent = false;
  try {
    await sendSms({
      toPhoneE164: args.patient.callback_phone,
      body: `【${tenant.display_name}】ご予約を承りました。確認はこちら ${FORM_BASE}/r/${token}`,
      originationIdentity: process.env.SMS_ORIGINATION_ID ?? '',
    });
    smsSent = true;
    await prisma.call.update({ where: { id: args.call_id }, data: { sms_sent: true } });
  } catch {
    smsSent = false;
  }

  const response = bookAppointmentOutput.parse({
    appointment_id: appointment.id,
    confirm_sms_sent: smsSent,
  });
  return { statusCode: 200, body: JSON.stringify(response) };
};
