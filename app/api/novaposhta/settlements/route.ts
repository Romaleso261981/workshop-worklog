import { NextResponse } from "next/server";

/** Базовий URL JSON-RPC (старий `/v2/json/` дає 302 на HTML — не парситься як JSON). */
const NP_URL = "https://api.novaposhta.ua/v2.0/json/";

export type NpSettlementItem = { ref: string; label: string };

function npApiKeyFromEnv(): string {
  return (process.env.NOVA_POSHTA_API_KEY ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

function npHintFromErrors(errors: unknown): string | undefined {
  if (!Array.isArray(errors)) return undefined;
  for (const e of errors) {
    if (typeof e === "string" && /api key/i.test(e)) return "invalid_api_key";
  }
  return undefined;
}

function normalizeNpData(data: unknown): NpSettlementItem[] {
  if (data == null) return [];
  let rows: Record<string, unknown>[] = [];
  if (Array.isArray(data)) {
    const first = data[0] as Record<string, unknown> | undefined;
    if (first && Array.isArray(first.Addresses)) {
      rows = first.Addresses as Record<string, unknown>[];
    } else {
      rows = data as Record<string, unknown>[];
    }
  }
  const out: NpSettlementItem[] = [];
  for (const row of rows) {
    const ref = String(row.Ref ?? row.SettlementRef ?? "").trim();
    const desc = String(
      row.Description ?? row.Present ?? row.MainDescription ?? row.SettlementTypeDescription ?? "",
    ).trim();
    if (!ref || !desc) continue;
    const region = String(row.RegionsDescription ?? row.RegionDescription ?? row.AreaDescription ?? "").trim();
    const type = String(row.SettlementTypeDescription ?? "").trim();
    const label = [type, desc, region].filter(Boolean).join(" · ");
    out.push({ ref, label: label || desc });
  }
  return out;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("probe") === "1") {
    return NextResponse.json({
      ok: true,
      settlementsAvailable: Boolean(npApiKeyFromEnv()),
    });
  }

  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ ok: true, items: [] as NpSettlementItem[] });
  }

  const apiKey = npApiKeyFromEnv();
  if (!apiKey) {
    return NextResponse.json({ ok: true, items: [] as NpSettlementItem[], hint: "no_api_key" });
  }

  const call = async (props: Record<string, string>) => {
    const res = await fetch(NP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey,
        modelName: "Address",
        calledMethod: "searchSettlements",
        methodProperties: props,
      }),
    });
    return (await res.json()) as {
      success?: boolean;
      data?: unknown;
      errors?: unknown;
    };
  };

  let json = await call({ FindByString: q, Limit: "25" });
  if (!json.success) {
    json = await call({ CityName: q, Limit: "25" });
  }
  if (!json.success) {
    const hint = npHintFromErrors(json.errors);
    return NextResponse.json({
      ok: false,
      items: [] as NpSettlementItem[],
      errors: json.errors,
      ...(hint ? { hint } : {}),
    });
  }

  return NextResponse.json({ ok: true, items: normalizeNpData(json.data) });
}
