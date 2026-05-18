import { z } from 'zod';

// Shared primitive schemas reused across tools, Lambda validation, and admin UI typing.

export const tenantIdSchema = z
  .string()
  .uuid()
  .describe('内部テナント識別子 (UUIDv4)');

export const phoneSchema = z
  .string()
  .regex(/^\+?[0-9]{8,15}$/u, 'E.164 もしくは数字のみで 8-15 桁')
  .describe('発信者番号 (E.164 を推奨)');

export const kanaSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[ァ-ヶー\s]+$/u, '全角カタカナで入力')
  .describe('患者氏名のフリガナ (全角カタカナ)');

export const isoDateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .describe('ISO8601 (UTC オフセット付き)');

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, 'YYYY-MM-DD')
  .describe('YYYY-MM-DD');

export const appointmentCourseSchema = z.enum([
  'general_first_visit',
  'general_follow_up',
  'health_checkup_basic',
  'health_checkup_full',
  'vaccination',
  'consultation_only',
]);

export const appointmentOptionsSchema = z.object({
  cancer_screening: z.boolean().default(false),
  brain_mri: z.boolean().default(false),
  ecg: z.boolean().default(false),
  notes: z.string().max(500).optional(),
});

export const patientSchema = z.object({
  kana: kanaSchema,
  date_of_birth: isoDateSchema,
  callback_phone: phoneSchema,
});

export type Patient = z.infer<typeof patientSchema>;
export type AppointmentCourse = z.infer<typeof appointmentCourseSchema>;
export type AppointmentOptions = z.infer<typeof appointmentOptionsSchema>;
