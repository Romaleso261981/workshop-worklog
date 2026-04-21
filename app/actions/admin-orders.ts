"use server";

import { ORDER_DONE, ORDER_IN_PRODUCTION } from "@/lib/order-status";
import type { WorkActionResult } from "@/lib/work-constants";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

async function requireAdmin(): Promise<{ id: string } | null> {
  const session = await getSession();
  if (!session.userId) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.role !== UserRole.ADMIN) return null;
  return { id: user.id };
}

export async function createOrderAction(formData: FormData): Promise<WorkActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Лише адміністратор може створювати замовлення." };

  const schema = z.object({
    number: z.string().min(1).max(64),
    title: z.string().max(200).optional().transform((s) => s?.trim() || undefined),
    description: z.string().min(1).max(8000),
    details: z.string().max(16000).optional().transform((s) => s?.trim() || undefined),
  });

  const parsed = schema.safeParse({
    number: formData.get("number"),
    title: formData.get("title") || undefined,
    description: formData.get("description"),
    details: formData.get("details") || undefined,
  });
  if (!parsed.success) {
    return { error: "Перевірте номер замовлення та опис (обов’язкові поля)." };
  }

  const number = parsed.data.number.trim();
  try {
    await prisma.order.create({
      data: {
        number,
        title: parsed.data.title ?? null,
        description: parsed.data.description.trim(),
        details: parsed.data.details ?? null,
        status: ORDER_IN_PRODUCTION,
      },
    });
  } catch {
    return { error: "Номер замовлення уже існує або дані некоректні." };
  }

  revalidatePath("/dashboard/admin/orders");
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/preparation");
  revalidatePath("/dashboard/painting");
  return { ok: true };
}

export async function completeOrderAction(formData: FormData): Promise<WorkActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Лише адміністратор може закривати замовлення." };

  const schema = z.object({ orderId: z.string().min(1) });
  const parsed = schema.safeParse({ orderId: formData.get("orderId") });
  if (!parsed.success) return { error: "Некоректне замовлення." };

  const order = await prisma.order.findUnique({
    where: { id: parsed.data.orderId },
  });
  if (!order) return { error: "Замовлення не знайдено." };
  if (order.status === ORDER_DONE) {
    return { error: "Це замовлення вже позначене як завершене." };
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: ORDER_DONE,
      completedAt: new Date(),
    },
  });

  revalidatePath("/dashboard/admin/orders");
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/preparation");
  revalidatePath("/dashboard/painting");
  return { ok: true };
}
