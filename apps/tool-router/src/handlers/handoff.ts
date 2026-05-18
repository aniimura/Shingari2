import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { getPrisma } from '@aicc2/db';
import { handoffInput, handoffOutput } from '@aicc2/shared/tools';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const parsed = handoffInput.safeParse(JSON.parse(event.body ?? '{}'));
  if (!parsed.success) {
    return { statusCode: 400, body: JSON.stringify({ error: parsed.error.flatten() }) };
  }
  const args = parsed.data;
  const prisma = getPrisma();

  await prisma.callStatus.upsert({
    where: { call_id: args.call_id },
    create: { call_id: args.call_id, state: 'needs_human' },
    update: { state: 'needs_human' },
  });
  await prisma.call.update({
    where: { id: args.call_id },
    data: { outcome: 'handed_off' },
  });
  await prisma.auditLog.create({
    data: {
      actor: 'realtime_agent',
      action: 'handoff_to_staff',
      target: args.call_id,
      payload: { reason: args.reason, callback_phone: args.callback_phone ?? null },
    },
  });

  return { statusCode: 200, body: JSON.stringify(handoffOutput.parse({ queued: true })) };
};
