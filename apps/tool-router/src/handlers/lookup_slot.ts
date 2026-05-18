import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { getPrisma } from '@aicc2/db';
import { lookupSlotInput, lookupSlotOutput } from '@aicc2/shared/tools';
import { resolveAdapter } from '../adapters/emr.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const parsed = lookupSlotInput.safeParse(JSON.parse(event.body ?? '{}'));
  if (!parsed.success) {
    return { statusCode: 400, body: JSON.stringify({ error: parsed.error.flatten() }) };
  }
  const args = parsed.data;
  const tenant = await getPrisma().tenant.findUniqueOrThrow({ where: { id: args.tenant_id } });
  const slots = await resolveAdapter(tenant.emr_adapter).lookupSlots(args);
  return {
    statusCode: 200,
    body: JSON.stringify(lookupSlotOutput.parse({ slots })),
  };
};
