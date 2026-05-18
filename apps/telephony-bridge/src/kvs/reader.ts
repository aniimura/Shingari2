import {
  KinesisVideoClient,
  GetDataEndpointCommand,
  APIName,
} from '@aws-sdk/client-kinesis-video';
import {
  KinesisVideoMediaClient,
  GetMediaCommand,
  StartSelectorType,
} from '@aws-sdk/client-kinesis-video-media';
import { Decoder } from 'ebml';
import { logger } from '../logging/logger.js';

export interface KvsStreamArgs {
  region: string;
  streamArn: string;
  startFragmentNumber?: string;
}

/**
 * Pulls a customer-audio KVS stream produced by Amazon Connect "Start media
 * streaming" and yields raw PCM16 chunks (mono, 8 kHz). The MKV / EBML payload
 * carries SimpleBlock elements whose `data` field is the audio frame.
 *
 * Connect uses 8 kHz μ-law over MKV when the contact flow streams customer
 * audio; we decode that to PCM16 on the bridge side before forwarding to the
 * Realtime API. See:
 *   https://docs.aws.amazon.com/connect/latest/adminguide/customer-voice-streams.html
 */
export async function* readKvsPcm(args: KvsStreamArgs): AsyncGenerator<Buffer> {
  const kvs = new KinesisVideoClient({ region: args.region });
  const ep = await kvs.send(
    new GetDataEndpointCommand({ StreamARN: args.streamArn, APIName: APIName.GET_MEDIA }),
  );
  if (!ep.DataEndpoint) throw new Error('KVS: empty DataEndpoint');

  const media = new KinesisVideoMediaClient({ region: args.region, endpoint: ep.DataEndpoint });
  const resp = await media.send(
    new GetMediaCommand({
      StreamARN: args.streamArn,
      StartSelector: args.startFragmentNumber
        ? {
            StartSelectorType: StartSelectorType.FRAGMENT_NUMBER,
            AfterFragmentNumber: args.startFragmentNumber,
          }
        : { StartSelectorType: StartSelectorType.NOW },
    }),
  );

  if (!resp.Payload) throw new Error('KVS: empty Payload');

  const decoder = new Decoder();
  const out: Buffer[] = [];
  decoder.on('data', (chunk: [string, { name: string; data?: Buffer }]) => {
    const [, el] = chunk;
    if (el.name === 'SimpleBlock' && el.data) {
      // SimpleBlock layout: [track number (vint)] [timecode (i16)] [flags (u8)] [frame bytes...]
      const frame = el.data.subarray(4);
      out.push(ulawToPcm16(frame));
    }
  });

  for await (const chunk of resp.Payload as AsyncIterable<Uint8Array>) {
    decoder.write(Buffer.from(chunk));
    while (out.length) {
      const next = out.shift();
      if (next) yield next;
    }
  }
  logger.info('kvs stream ended');
}

// μ-law (G.711) → 16-bit linear PCM. Reference: ITU-T G.711.
const MU_LAW_BIAS = 0x84;
export function ulawToPcm16(ulaw: Buffer): Buffer {
  const out = Buffer.alloc(ulaw.length * 2);
  for (let i = 0; i < ulaw.length; i++) {
    const u = ~ulaw[i]! & 0xff;
    const sign = u & 0x80;
    const exponent = (u >> 4) & 0x07;
    const mantissa = u & 0x0f;
    let sample = ((mantissa << 3) + MU_LAW_BIAS) << exponent;
    sample -= MU_LAW_BIAS;
    if (sign !== 0) sample = -sample;
    out.writeInt16LE(sample, i * 2);
  }
  return out;
}
