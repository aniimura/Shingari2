import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@aicc2/db';

const bodySchema = z.object({
  state: z.enum(['new', 'in_progress', 'done', 'needs_human']),
  assignee_id: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const prisma = getPrisma();
  await prisma.callStatus.upsert({
    where: { call_id: params.id },
    create: { call_id: params.id, ...parsed.data },
    update: parsed.data,
  });
  return NextResponse.json({ ok: true });
}
