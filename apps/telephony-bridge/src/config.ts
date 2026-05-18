import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  AWS_REGION: z.string().default('ap-northeast-1'),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_REALTIME_MODEL: z.string().default('gpt-realtime'),
  OPENAI_REALTIME_URL: z
    .string()
    .url()
    .default('wss://api.openai.com/v1/realtime'),
  TOOL_ROUTER_URL: z.string().url(),
  RECORDINGS_S3_BUCKET: z.string().min(1),
  KMS_KEY_ARN: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

let cached: Config | undefined;

export function getConfig(): Config {
  if (!cached) {
    cached = envSchema.parse(process.env);
  }
  return cached;
}
