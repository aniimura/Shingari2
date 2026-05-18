import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { faqLookupInput, faqLookupOutput } from '@aicc2/shared/tools';

// MVP: deterministic FAQ stub. Replace with a RAG call (Bedrock KB) later.
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const parsed = faqLookupInput.safeParse(JSON.parse(event.body ?? '{}'));
  if (!parsed.success) {
    return { statusCode: 400, body: JSON.stringify({ error: parsed.error.flatten() }) };
  }
  return {
    statusCode: 200,
    body: JSON.stringify(
      faqLookupOutput.parse({
        answer:
          '現在こちらの内容はオペレーターに引き継いで確認いたします。少々お待ちください。',
        sources: [],
      }),
    ),
  };
};
