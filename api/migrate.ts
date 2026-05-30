import type { VercelRequest, VercelResponse } from "@vercel/node";

type ScopeType = "personal" | "family";
type PeriodType = "month" | "year";

type Entry = {
  category_id: string;
  scope: ScopeType;
  person: "yangbao" | "yubao";
  period_type: PeriodType;
  period_start: string;
  item_name: string;
  amount: number;
  note: string;
  is_recurring: boolean;
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    if (denyWithoutAccessCode(request, response)) return;
    if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });

    const scope = request.body.scope === "family" ? "family" : "personal";
    const person = request.body.person === "yubao" ? "yubao" : "yangbao";
    const periodType = request.body.periodType === "year" ? "year" : "month";
    const periodStart = String(request.body.periodStart || "");
    if (!periodStart) return response.status(400).json({ error: "PERIOD_START_REQUIRED" });

    const previousPeriodStart = shiftPeriod(periodStart, periodType, -1);
    const previousQuery = buildEntryQuery(scope, person, periodType, previousPeriodStart);
    previousQuery.set("is_recurring", "eq.true");
    const currentQuery = buildEntryQuery(scope, person, periodType, periodStart);

    const [previousEntries, currentEntries] = await Promise.all([
      supabaseRest<Entry[]>(`ledger_entries?${previousQuery.toString()}`),
      supabaseRest<Entry[]>(`ledger_entries?${currentQuery.toString()}`)
    ]);

    const currentKeys = new Set(currentEntries.map(entryKey));
    const rows = previousEntries
      .filter((entry) => !currentKeys.has(entryKey(entry)))
      .map((entry) => ({
        category_id: entry.category_id,
        scope: entry.scope,
        person: entry.person,
        period_type: periodType,
        period_start: periodStart,
        item_name: entry.item_name,
        amount: Number(entry.amount) || 0,
        note: entry.note || "",
        is_recurring: true
      }));

    if (!rows.length) {
      return response.status(200).json({ inserted: 0, skipped: previousEntries.length, entries: [] });
    }

    const inserted = await supabaseRest<Entry[]>("ledger_entries?select=*", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(rows)
    });

    response.status(200).json({
      inserted: inserted.length,
      skipped: previousEntries.length - inserted.length,
      entries: inserted
    });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Unexpected API error" });
  }
}

function buildEntryQuery(scope: ScopeType, person: string, periodType: PeriodType, periodStart: string) {
  const query = new URLSearchParams({
    select: "*",
    period_type: `eq.${periodType}`,
    period_start: `eq.${periodStart}`,
    order: "created_at.asc"
  });
  if (scope === "personal") {
    query.set("scope", "eq.personal");
    query.set("person", `eq.${person}`);
  }
  return query;
}

function entryKey(entry: Pick<Entry, "category_id" | "scope" | "person" | "item_name">) {
  return [entry.category_id, entry.scope, entry.person, entry.item_name.trim()].join("|");
}

function shiftPeriod(periodStart: string, type: PeriodType, direction: number) {
  const date = new Date(`${periodStart}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  if (type === "year") date.setFullYear(date.getFullYear() + direction);
  else date.setMonth(date.getMonth() + direction);
  return type === "year"
    ? `${date.getFullYear()}-01-01`
    : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function denyWithoutAccessCode(request: VercelRequest, response: VercelResponse) {
  const expected = process.env.APP_ACCESS_CODE;
  if (!expected) return false;
  if (request.headers["x-app-access-code"] === expected) return false;
  response.status(401).json({ error: "ACCESS_CODE_REQUIRED" });
  return true;
}

async function supabaseRest<T>(path: string, init: RequestInit = {}) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase environment variables.");

  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Content-Type", "application/json");

  const result = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path}`, { ...init, headers });
  if (!result.ok) throw new Error(`Supabase REST ${result.status}: ${(await result.text()).slice(0, 500)}`);
  if (result.status === 204) return undefined as T;
  return (await result.json()) as T;
}
