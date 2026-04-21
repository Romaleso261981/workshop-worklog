"use server";

import { ORDER_IN_PRODUCTION } from "@/lib/order-status";
import { PHASE_PAINTING, PHASE_PREPARATION, type WorkActionResult } from "@/lib/work-constants";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { z } from "zod";

async function currentUserId(): Promise<string | null> {
  const session = await getSession();
  return session.userId ?? null;
}

async function findOpenProductionOrder(orderId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, status: ORDER_IN_PRODUCTION },
  });
}

export async function startPreparationAction(formData: FormData): Promise<WorkActionResult> {
  const userId = await currentUserId();
  if (!userId) return { error: "Увійдіть у систему." };

  const schema = z.object({
    orderId: z.string().min(1),
    beforeOrderNotes: z.string().min(1).max(4000),
  });
  const parsed = schema.safeParse({
    orderId: formData.get("orderId"),
    beforeOrderNotes: formData.get("beforeOrderNotes"),
  });
  if (!parsed.success) {
    return { error: "Оберіть замовлення зі списку та опишіть роботу перед початком по замовленню." };
  }

  const open = await prisma.workEntry.findFirst({
    where: { userId, endedAt: null },
  });
  if (open) {
    return { error: "Спочатку завершіть поточну зміну (натисніть «Завершити»)." };
  }

  const order = await findOpenProductionOrder(parsed.data.orderId);
  if (!order) {
    return { error: "Замовлення недоступне (не знайдено або вже знято з виробництва)." };
  }

  await prisma.workEntry.create({
    data: {
      userId,
      orderId: order.id,
      phase: PHASE_PREPARATION,
      beforeOrderNotes: parsed.data.beforeOrderNotes.trim(),
    },
  });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/preparation");
  revalidatePath("/dashboard/journal");
  return { ok: true };
}

export async function startPaintingAction(input: {
  orderId: string;
  colors: { color: string; amount: string }[];
  materials: string;
}): Promise<WorkActionResult> {
  const userId = await currentUserId();
  if (!userId) return { error: "Увійдіть у систему." };

  const colors = input.colors.filter(
    (c) => c.color.trim() || c.amount.trim(),
  );
  if (colors.length === 0) {
    return { error: "Додайте хоча б один колір (назва та кількість/об’єм)." };
  }
  for (const c of colors) {
    if (!c.color.trim() || !c.amount.trim()) {
      return { error: "Для кожного кольору заповніть назву та кількість." };
    }
  }

  const open = await prisma.workEntry.findFirst({
    where: { userId, endedAt: null },
  });
  if (open) {
    return { error: "Спочатку завершіть поточну зміну." };
  }

  const order = await findOpenProductionOrder(input.orderId);
  if (!order) {
    return { error: "Замовлення недоступне (не знайдено або вже знято з виробництва)." };
  }

  await prisma.workEntry.create({
    data: {
      userId,
      orderId: order.id,
      phase: PHASE_PAINTING,
      paintingColors: JSON.stringify(colors),
      paintingMaterials: input.materials.trim() || null,
    },
  });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/painting");
  revalidatePath("/dashboard/journal");
  return { ok: true };
}

export async function finishActiveEntryAction(_formData?: FormData): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;

  const open = await prisma.workEntry.findFirst({
    where: { userId, endedAt: null },
  });
  if (!open) return;

  await prisma.workEntry.update({
    where: { id: open.id },
    data: { endedAt: new Date() },
  });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/preparation");
  revalidatePath("/dashboard/painting");
  revalidatePath("/dashboard/journal");
}
