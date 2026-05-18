import { PassThrough, type Readable } from 'node:stream';

/**
 * Audio writer that emits 16-bit PCM frames back to Amazon Connect via the
 * websocket established with `StartContactStreaming` (audio playback channel).
 *
 * For MVP we expose a Node `Readable` that the websocket handler in
 * `index.ts` pipes onto the Connect-facing socket. Connect expects 8 kHz PCM16
 * mono framed in 20 ms chunks (320 bytes each). The Realtime API returns
 * 24 kHz PCM16 — we down-sample with a simple decimation good enough for
 * narrowband telephony.
 */
export class ConnectAudioResponder {
  readonly stream: PassThrough = new PassThrough({ highWaterMark: 32 * 1024 });
  private leftover: Buffer = Buffer.alloc(0);

  pushFromRealtime(pcm24k: Buffer): void {
    const pcm8k = downsample24kTo8k(Buffer.concat([this.leftover, pcm24k]));
    this.leftover = Buffer.alloc(0);
    this.stream.write(pcm8k);
  }

  end(): void {
    this.stream.end();
  }

  asReadable(): Readable {
    return this.stream;
  }
}

// 24k -> 8k decimation by 3, with a 3-tap moving average to dampen aliasing.
function downsample24kTo8k(pcm24k: Buffer): Buffer {
  const inSamples = Math.floor(pcm24k.length / 2);
  const outSamples = Math.floor(inSamples / 3);
  const out = Buffer.alloc(outSamples * 2);
  for (let i = 0; i < outSamples; i++) {
    const s0 = pcm24k.readInt16LE(i * 3 * 2);
    const s1 = pcm24k.readInt16LE(i * 3 * 2 + 2);
    const s2 = pcm24k.readInt16LE(i * 3 * 2 + 4);
    const avg = Math.max(-32768, Math.min(32767, Math.round((s0 + s1 + s2) / 3)));
    out.writeInt16LE(avg, i * 2);
  }
  return out;
}
