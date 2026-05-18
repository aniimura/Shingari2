import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { getPrisma } from '@aicc2/db';
import { cancelAppointmentInput, cancelAppointmentOutput } from '@aicc2/shared/tools';
import { resolveAdapter } from '../adapters/emr.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const parsed = cancelAppointmentInput.safeParse(JSON.parse(event.body ?? '{}'));
  if (!parsed.success) {
    return { statusCode: 400, body: JSON.stringify({ error: parsed.error.flatten() }) };
  }
  const args = parsed.data;
  const prisma = getPrisma();

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: args.tenant_id } });
  const adapter = resolveAdapter(tenant.emr_adapter);
  await adapter.cancel(args);

  await prisma.appointment.update({
    where: { id: args.appointment_id },
    data: { state: 'cancelled' },
  });

  return {
    statusCode: 200,
    body: JSON.stringify(cancelAppointmentOutput.parse({ cancelled: true })),
  };
};
