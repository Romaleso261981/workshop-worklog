import { NextResponse } from "next/server";

/** Єдиний endpoint JSON-RPC Нової Пошти */
const NP = "https://api.novaposhta.ua/v2.0/json/";

export type NpWarehouseItem = { ref: string; label: string; number: string };

function normalizeWarehouses(data: unknown): NpWarehouseItem[] {
  if (!Array.isArray(data)) return [];
  const out: NpWarehouseItem[] = [];
  for (const row of data as Record<string, unknown>[]) {
    const ref = String(row.Ref ?? "").trim();
    if (!ref) continue;
    const num = String(row.Number ?? "").trim();
    const desc = String(row.Description ?? row.ShortAddress ?? "").trim();
    const label = [num ? `№${num}` : null, desc || "Відділення"].filter(Boolean).join(" — ");
    out.push({ ref, label, number: num });
  }
  return out;
}

async function npCall(
  apiKey: string,
  modelName: string,
  calledMethod: string,
  methodProperties: Record<string, string>,
) {
  const res = await fetch(NP, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey,
      modelName,
      calledMethod,
      methodProperties,
    }),
  });
  return (await res.json()) as {
    success?: boolean;
    data?: unknown;
    errors?: unknown;
  };
}

export async function GET(req: Request) {
  const settlementRef = new URL(req.url).searchParams.get("settlementRef")?.trim() ?? "";
  if (!settlementRef) {
    return NextResponse.json({ ok: true, items: [] as NpWarehouseItem[] });
  }

  const apiKey = process.env.NOVA_POSHTA_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ ok: true, items: [] as NpWarehouseItem[], hint: "no_api_key" });
  }

  const tries: [string, string, Record<string, string>][] = [
    ["Address", "getWarehouses", { SettlementRef: settlementRef, Limit: "500" }],
    ["Address", "getWarehouses", { CityRef: settlementRef, Limit: "500" }],
    ["AddressGeneral", "getWarehouses", { SettlementRef: settlementRef, Limit: "500" }],
  ];

  for (const [model, method, props] of tries) {
    const json = await npCall(apiKey, model, method, props);
    if (json.success) {
      const items = normalizeWarehouses(json.data);
      if (items.length > 0) {
        items.sort((a, b) => {
          const na = parseInt(a.number, 10);
          const nb = parseInt(b.number, 10);
          if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
          return a.label.localeCompare(b.label, "uk");
        });
        return NextResponse.json({ ok: true, items });
      }
    }
  }

  return NextResponse.json({ ok: true, items: [] as NpWarehouseItem[] });
}
