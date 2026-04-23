import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";
import type { WorkActionResult } from "@/lib/work-constants";
import { ORDER_DONE, ORDER_IN_PRODUCTION } from "@/lib/order-status";
import {
  completedStagesFromEntries,
  nextOpenStageId,
  normalizePhase,
  PIPELINE_STAGES,
} from "@/lib/pipeline";
import { COL } from "@/lib/firestore/collections";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { z } from "zod";

const stageIdEnum = z.enum(
  PIPELINE_STAGES.map((s) => s.id) as [string, ...string[]],
);

export async function startStageFirestore(input: {
  orderId: string;
  stageId: string;
  notes: string;
  colors: { color: string; amount: string }[];
  materials: string;
}): Promise<WorkActionResult> {
  const auth = getFirebaseAuth();
  const userId = auth.currentUser?.uid;
  if (!userId) return { error: "Увійдіть у систему." };

  const stageParsed = stageIdEnum.safeParse(input.stageId);
  if (!stageParsed.success) return { error: "Некоректний етап." };
  const stageId = stageParsed.data as (typeof PIPELINE_STAGES)[number]["id"];

  const db = getFirebaseDb();
  const wRef = collection(db, COL.workEntries);

  const userOpenQ = query(wRef, where("userId", "==", userId), where("endedAt", "==", null));
  const userOpenSnap = await getDocs(userOpenQ);
  if (!userOpenSnap.empty) {
    return { error: "Спочатку завершіть поточну зміну в шапці." };
  }

  const orderSnap = await getDoc(doc(db, COL.orders, input.orderId));
  if (!orderSnap.exists()) return { error: "Замовлення не знайдено." };
  const order = orderSnap.data() as { status?: string; number?: string };
  const orderNumber = order.number ?? "";
  if (order.status !== ORDER_IN_PRODUCTION) {
    return { error: "Замовлення недоступне (знято з виробництва)." };
  }

  const orderOpenQ = query(wRef, where("orderId", "==", input.orderId), where("endedAt", "==", null));
  const orderOpenSnap = await getDocs(orderOpenQ);
  if (!orderOpenSnap.empty) {
    return {
      error:
        "По цьому замовленню вже виконується етап іншим працівником. Дочекайтесь «Завершити зміну» на тому етапі.",
    };
  }

  const entriesQ = query(wRef, where("orderId", "==", input.orderId));
  const entriesSnap = await getDocs(entriesQ);
  const entries = entriesSnap.docs.map((d) => ({
    phase: (d.data() as { phase: string }).phase,
    endedAt: (d.data() as { endedAt?: unknown }).endedAt ?? null,
  }));
  const done = completedStagesFromEntries(entries);
  const next = nextOpenStageId(done);

  if (next === null) {
    return {
      error: "Усі етапи по цьому замовленню вже завершені. Після останнього етапу «Відправлення» замовлення автоматично в архіві — оновіть сторінку.",
    };
  }

  if (stageId !== next) {
    const nextLabel = PIPELINE_STAGES.find((s) => s.id === next)?.label ?? next;
    return {
      error: `Етапи йдуть по черзі. Зараз доступний лише: «${nextLabel}».`,
    };
  }

  const isPaint = stageId === "PAINT";
  const notesTrim = input.notes.trim();
  const colors = input.colors.filter((c) => c.color.trim() || c.amount.trim());

  if (isPaint) {
    if (colors.length === 0) {
      return { error: "Для фарбування додайте хоча б один колір (назва та кількість)." };
    }
    for (const c of colors) {
      if (!c.color.trim() || !c.amount.trim()) {
        return { error: "Для кожного кольору вкажіть назву та кількість." };
      }
    }
  } else if (!notesTrim) {
    return { error: "Опишіть, що робите на цьому етапі." };
  }

  await addDoc(wRef, {
    userId,
    orderId: input.orderId,
    orderNumber,
    phase: stageId,
    beforeOrderNotes: isPaint ? (notesTrim || null) : notesTrim,
    paintingColors: isPaint ? JSON.stringify(colors) : null,
    paintingMaterials: isPaint ? (input.materials.trim() || null) : null,
    startedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    endedAt: null,
  });

  return { ok: true };
}

export async function finishActiveWorkEntryFirestore(entryId: string): Promise<void> {
  const auth = getFirebaseAuth();
  const userId = auth.currentUser?.uid;
  if (!userId) return;

  const db = getFirebaseDb();
  const ref = doc(db, COL.workEntries, entryId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as { userId?: string; endedAt?: unknown; orderId?: string; phase?: string };
  if (data.userId !== userId) return;
  if (data.endedAt != null) return;

  const orderId = data.orderId?.trim() ?? "";
  /** Етап рядка, який зараз закриваємо — одразу враховуємо в прогресі, бо після serverTimestamp() наступне
   *  читання workEntries ще може показувати endedAt=null (гонка клієнта), і замовлення не переходило б у DONE. */
  const phaseJustClosed = normalizePhase(String(data.phase ?? ""));
  await updateDoc(ref, { endedAt: serverTimestamp() });

  if (!orderId) return;

  const entriesQ = query(collection(db, COL.workEntries), where("orderId", "==", orderId));
  const entriesSnap = await getDocs(entriesQ);
  const entries = entriesSnap.docs.map((d) => ({
    phase: (d.data() as { phase: string }).phase,
    endedAt: (d.data() as { endedAt?: unknown }).endedAt ?? null,
  }));
  const done = completedStagesFromEntries(entries);
  if (phaseJustClosed) done.add(phaseJustClosed);
  const next = nextOpenStageId(done);
  if (next !== null) return;

  const ordRef = doc(db, COL.orders, orderId);
  const ordSnap = await getDoc(ordRef);
  if (!ordSnap.exists()) return;
  const status = (ordSnap.data() as { status?: string }).status;
  if (status !== ORDER_IN_PRODUCTION) return;

  await updateDoc(ordRef, {
    status: ORDER_DONE,
    completedAt: serverTimestamp(),
  });
}
