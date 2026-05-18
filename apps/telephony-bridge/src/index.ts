import Fastify from 'fastify';
import { z } from 'zod';
import { loadPrompt } from '@aicc2/prompts';
import { getConfig } from './config.js';
import { logger } from './logging/logger.js';
import { readKvsPcm } from './kvs/reader.js';
import { RealtimeSession } from './realtime/session.js';
import { ConnectAudioResponder } from './connect/responder.js';
import { createRecordingWriter } from './recording.js';

const cfg = getConfig();
const app = Fastify({ logger });

app.get('/healthz', async () => ({ ok: true }));

const startSchema = z.object({
  tenant_id: z.string().uuid(),
  tenant_kind: z.enum(['hospital', 'clinic', 'medicalcenter', 'pharmacy']),
  call_id: z.string().uuid(),
  connect_contact_id: z.string().min(1),
  kvs_stream_arn: z.string().min(1),
  start_fragment_number: z.string().optional(),
});

/**
 * Invoked by the Connect contact flow's Lambda integration. Returns 202
 * immediately and runs the session detached. The Lambda holds the call open
 * via a "Loop prompts" silence block until we signal completion through a
 * contact attribute update (TODO: implement attribute update path).
 */
app.post('/sessions', async (req, reply) => {
  const params = startSchema.parse(req.body);
  void runSession(params).catch((err) =>
    logger.error({ err, params }, 'session crashed'),
  );
  reply.code(202).send({ accepted: true });
});

async function runSession(p: z.infer<typeof startSchema>): Promise<void> {
  const prompt = loadPrompt(p.tenant_kind);
  const responder = new ConnectAudioResponder();
  const recorder = createRecordingWriter({
    region: cfg.AWS_REGION,
    bucket: cfg.RECORDINGS_S3_BUCKET,
    kmsKeyArn: cfg.KMS_KEY_ARN,
    callId: p.call_id,
    tenantId: p.tenant_id,
  });

  const transcript: Array<{ role: 'user' | 'assistant'; text: string; at: string }> = [];

  const session = new RealtimeSession({
    tenantId: p.tenant_id,
    callId: p.call_id,
    prompt,
    onAudio: (pcm) => {
      responder.pushFromRealtime(pcm);
      recorder.append(pcm);
    },
    onTranscriptDelta: (text, role) => {
      transcript.push({ role, text, at: new Date().toISOString() });
    },
  });

  await session.connect();

  try {
    for await (const pcm of readKvsPcm({
      region: cfg.AWS_REGION,
      streamArn: p.kvs_stream_arn,
      ...(p.start_fragment_number ? { startFragmentNumber: p.start_fragment_number } : {}),
    })) {
      session.appendAudio(pcm);
      recorder.append(pcm);
    }
  } finally {
    session.close();
    responder.end();
    const rec = await recorder.finalize();
    logger.info(
      { call_id: p.call_id, transcript_chunks: transcript.length, s3_key: rec?.s3Key },
      'session ended',
    );
    // TODO: persist Call + transcript + extracted JSON via Tool Router or Prisma client.
  }
}

const port = cfg.PORT;
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  logger.error({ err }, 'failed to start');
  process.exit(1);
});
