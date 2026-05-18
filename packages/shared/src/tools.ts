import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  appointmentCourseSchema,
  appointmentOptionsSchema,
  isoDateTimeSchema,
  patientSchema,
  phoneSchema,
} from './schemas.js';

// Single source of truth for tools the Realtime model can call.
// - The same zod schema validates the Lambda input at Tool Router.
// - `realtimeToolDefinitions` is the array we register on session.update.

export const lookupSlotInput = z.object({
  tenant_id: z.string().uuid(),
  course: appointmentCourseSchema,
  earliest: isoDateTimeSchema.describe('希望日時の下限'),
  latest: isoDateTimeSchema.describe('希望日時の上限'),
});
export const lookupSlotOutput = z.object({
  slots: z.array(
    z.object({
      slot_at: isoDateTimeSchema,
      capacity_remaining: z.number().int().nonnegative(),
    }),
  ),
});

export const bookAppointmentInput = z.object({
  tenant_id: z.string().uuid(),
  patient: patientSchema,
  course: appointmentCourseSchema,
  options: appointmentOptionsSchema,
  slot_at: isoDateTimeSchema,
  call_id: z.string().uuid().describe('Call レコード id'),
});
export const bookAppointmentOutput = z.object({
  appointment_id: z.string().uuid(),
  confirm_sms_sent: z.boolean(),
});

export const cancelAppointmentInput = z.object({
  tenant_id: z.string().uuid(),
  appointment_id: z.string().uuid(),
  reason: z.string().max(200).optional(),
});
export const cancelAppointmentOutput = z.object({
  cancelled: z.literal(true),
});

export const faqLookupInput = z.object({
  tenant_id: z.string().uuid(),
  question: z.string().min(1).max(500),
});
export const faqLookupOutput = z.object({
  answer: z.string(),
  sources: z.array(z.string()).default([]),
});

export const handoffInput = z.object({
  tenant_id: z.string().uuid(),
  call_id: z.string().uuid(),
  reason: z.enum(['patient_request', 'out_of_scope', 'emergency']),
  callback_phone: phoneSchema.optional(),
});
export const handoffOutput = z.object({
  queued: z.literal(true),
});

export const toolRegistry = {
  lookup_slot: { input: lookupSlotInput, output: lookupSlotOutput },
  book_appointment: { input: bookAppointmentInput, output: bookAppointmentOutput },
  cancel_appointment: { input: cancelAppointmentInput, output: cancelAppointmentOutput },
  faq_lookup: { input: faqLookupInput, output: faqLookupOutput },
  handoff_to_staff: { input: handoffInput, output: handoffOutput },
} as const;

export type ToolName = keyof typeof toolRegistry;

const toolDescriptions: Record<ToolName, string> = {
  lookup_slot: '指定コースの空き枠を取得する。患者に提案する前に必ず呼ぶこと。',
  book_appointment:
    '空き枠が確認できた後に予約を確定する。氏名カナ・生年月日・電話番号が揃っていない場合は呼んではいけない。',
  cancel_appointment: '既存の予約をキャンセルする。',
  faq_lookup: '院の運営情報 (休診日・アクセス・診療科目など) に関する質問に答える。',
  handoff_to_staff:
    '患者が人間との会話を強く希望する場合や、緊急性が疑われる場合に直ちに呼ぶ。',
};

export const realtimeToolDefinitions = (Object.keys(toolRegistry) as ToolName[]).map((name) => ({
  type: 'function' as const,
  name,
  description: toolDescriptions[name],
  parameters: zodToJsonSchema(toolRegistry[name].input, {
    target: 'openApi3',
    $refStrategy: 'none',
  }),
}));
