import type { z } from 'zod';
import type { bookAppointmentInput, lookupSlotInput } from '@aicc2/shared/tools';

export type LookupSlotArgs = z.infer<typeof lookupSlotInput>;
export type BookArgs = z.infer<typeof bookAppointmentInput>;

export interface EmrAdapter {
  lookupSlots(args: LookupSlotArgs): Promise<{ slot_at: string; capacity_remaining: number }[]>;
  book(args: BookArgs): Promise<{ patient_external_id: string | null }>;
  cancel(args: { tenant_id: string; appointment_id: string; reason?: string }): Promise<void>;
}

export const mockEmr: EmrAdapter = {
  async lookupSlots(args) {
    const base = new Date(args.earliest).getTime();
    const slots: { slot_at: string; capacity_remaining: number }[] = [];
    for (let i = 0; i < 5; i++) {
      slots.push({
        slot_at: new Date(base + i * 60 * 60 * 1000).toISOString(),
        capacity_remaining: Math.max(0, 3 - i),
      });
    }
    return slots;
  },
  async book() {
    return { patient_external_id: null };
  },
  async cancel() {
    // no-op for mock
  },
};

export function resolveAdapter(name: string): EmrAdapter {
  if (name === 'mock') return mockEmr;
  throw new Error(`unknown EMR adapter: ${name}`);
}
