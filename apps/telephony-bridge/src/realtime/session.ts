import { WebSocket } from 'ws';
import { request } from 'undici';
import { realtimeToolDefinitions } from '@aicc2/shared';
import type { PromptBundle } from '@aicc2/prompts';
import { logger } from '../logging/logger.js';
import { getConfig } from '../config.js';

export interface RealtimeSessionArgs {
  tenantId: string;
  callId: string;
  prompt: PromptBundle;
  onAudio: (pcm16: Buffer) => void;
  onTranscriptDelta?: (text: string, role: 'user' | 'assistant') => void;
  onSessionEnd?: () => void;
}

type RealtimeEvent =
  | { type: 'session.created'; session: unknown }
  | { type: 'input_audio_buffer.speech_started' }
  | { type: 'response.audio.delta'; delta: string }
  | { type: 'response.audio_transcript.delta'; delta: string }
  | { type: 'conversation.item.input_audio_transcription.delta'; delta: string }
  | { type: 'response.done'; response: { id: string } }
  | {
      type: 'response.function_call_arguments.done';
      name: string;
      call_id: string;
      arguments: string;
    }
  | { type: 'error'; error: { type: string; message: string } }
  | { type: string; [k: string]: unknown };

export class RealtimeSession {
  private ws!: WebSocket;
  private readonly cfg = getConfig();
  private closed = false;

  constructor(private readonly args: RealtimeSessionArgs) {}

  async connect(): Promise<void> {
    const url = `${this.cfg.OPENAI_REALTIME_URL}?model=${encodeURIComponent(
      this.cfg.OPENAI_REALTIME_MODEL,
    )}`;
    this.ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${this.cfg.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });

    await new Promise<void>((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
    });

    this.send({
      type: 'session.update',
      session: {
        modalities: ['audio', 'text'],
        instructions: this.args.prompt.system,
        voice: this.args.prompt.voice,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: { model: 'gpt-4o-mini-transcribe' },
        turn_detection: { type: 'server_vad', threshold: 0.5, silence_duration_ms: 600 },
        tools: realtimeToolDefinitions,
        tool_choice: 'auto',
        temperature: 0.6,
      },
    });

    this.send({
      type: 'response.create',
      response: { instructions: this.args.prompt.greeting, modalities: ['audio'] },
    });

    this.ws.on('message', (raw) => this.handle(JSON.parse(raw.toString()) as RealtimeEvent));
    this.ws.on('close', () => {
      this.closed = true;
      this.args.onSessionEnd?.();
    });
  }

  appendAudio(pcm16: Buffer): void {
    if (this.closed) return;
    this.send({
      type: 'input_audio_buffer.append',
      audio: pcm16.toString('base64'),
    });
  }

  bargeIn(): void {
    this.send({ type: 'response.cancel' });
  }

  close(): void {
    if (!this.closed) this.ws.close(1000, 'normal');
  }

  private send(payload: unknown): void {
    this.ws.send(JSON.stringify(payload));
  }

  private async handle(ev: RealtimeEvent): Promise<void> {
    switch (ev.type) {
      case 'response.audio.delta': {
        const audio = Buffer.from((ev as { delta: string }).delta, 'base64');
        this.args.onAudio(audio);
        break;
      }
      case 'response.audio_transcript.delta':
        this.args.onTranscriptDelta?.((ev as { delta: string }).delta, 'assistant');
        break;
      case 'conversation.item.input_audio_transcription.delta':
        this.args.onTranscriptDelta?.((ev as { delta: string }).delta, 'user');
        break;
      case 'response.function_call_arguments.done':
        await this.executeTool(
          ev as {
            name: string;
            call_id: string;
            arguments: string;
          },
        );
        break;
      case 'error':
        logger.error({ err: (ev as { error: unknown }).error }, 'realtime error');
        break;
      default:
        break;
    }
  }

  private async executeTool(ev: {
    name: string;
    call_id: string;
    arguments: string;
  }): Promise<void> {
    const startedAt = Date.now();
    try {
      const args = JSON.parse(ev.arguments) as Record<string, unknown>;
      const enriched = {
        ...args,
        tenant_id: this.args.tenantId,
        call_id: this.args.callId,
      } satisfies Record<string, unknown>;

      const { statusCode, body } = await request(`${this.cfg.TOOL_ROUTER_URL}/${ev.name}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(enriched),
      });
      const text = await body.text();
      if (statusCode >= 400) {
        throw new Error(`tool ${ev.name} failed ${statusCode}: ${text}`);
      }

      this.send({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: ev.call_id,
          output: text,
        },
      });
      this.send({ type: 'response.create' });
      logger.info(
        { tool: ev.name, ms: Date.now() - startedAt },
        'tool executed',
      );
    } catch (err) {
      logger.error({ err, tool: ev.name }, 'tool execution failed');
      this.send({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: ev.call_id,
          output: JSON.stringify({ error: 'tool_failed' }),
        },
      });
      this.send({ type: 'response.create' });
    }
  }
}

