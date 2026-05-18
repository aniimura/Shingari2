import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { logger } from './logging/logger.js';

export interface RecordingWriter {
  append(pcm16: Buffer): void;
  finalize(): Promise<{ s3Key: string } | undefined>;
}

export function createRecordingWriter(opts: {
  region: string;
  bucket: string;
  kmsKeyArn?: string;
  callId: string;
  tenantId: string;
}): RecordingWriter {
  const chunks: Buffer[] = [];
  const s3 = new S3Client({ region: opts.region });

  return {
    append(pcm16) {
      chunks.push(pcm16);
    },
    async finalize() {
      if (!chunks.length) return undefined;
      const wav = pcm16ToWav(Buffer.concat(chunks), 8000);
      const day = new Date().toISOString().slice(0, 10);
      const s3Key = `${opts.tenantId}/${day}/${opts.callId}.wav`;
      await s3.send(
        new PutObjectCommand({
          Bucket: opts.bucket,
          Key: s3Key,
          Body: wav,
          ContentType: 'audio/wav',
          ServerSideEncryption: opts.kmsKeyArn ? 'aws:kms' : 'AES256',
          SSEKMSKeyId: opts.kmsKeyArn,
          Metadata: {
            'tenant-id': opts.tenantId,
            'call-id': opts.callId,
          },
        }),
      );
      logger.info({ s3Key, bytes: wav.length }, 'recording uploaded');
      return { s3Key };
    },
  };
}

function pcm16ToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  const dataSize = pcm.length;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}
