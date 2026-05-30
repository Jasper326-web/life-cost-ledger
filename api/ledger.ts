import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    if (denyWithoutAccessCode(request, response)) return;

    if (request.method === "GET") {
      const scope = String(request.query.scope || "personal");
      const person = String(request.query.person || "yangbao");
      const periodType = String(request.query.periodType || "month");
      const periodStart = String(request.query.periodStart || "");
      const entryQuery = new URLSearchParams({
        select: "*",
        period_type: `eq.${periodType}`,
        period_start: `eq.${periodStart}`,
        order: "created_at.asc"
      });
      if (scope === "personal") {
        entryQuery.set("scope", "eq.personal");
        entryQuery.set("person", `eq.${person}`);
      }
      const savingQuery = new URLSearchParams({
        select: "*",
        period_type: `eq.${periodType}`,
        period_start: `eq.${periodStart}`,
        order: "created_at.asc"
      });

      const [categories, entries, savings] = await Promise.all([
        supabaseRest("ledger_categories?select=*&order=sort_order.asc"),
        supabaseRest(`ledger_entries?${entryQuery.toString()}`),
        supabaseRest(`family_savings?${savingQuery.toString()}`)
      ]);

      return response.status(200).json({ categories, entries, savings });
    }

    if (request.method === "POST") {
      const entry = normalizeEntryBody(request.body);
      const rows = await supabaseRest<unknown[]>("ledger_entries?select=*", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(entry)
      });
      return response.status(200).json(rows[0]);
    }

    response.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Unexpected API error" });
  }
}

function normalizeEntryBody(body: Record<string, unknown>) {
  return {
    category_id: String(body.category_id || ""),
    scope: body.scope === "family" ? "family" : "personal",
    person: body.person === "yubao" ? "yubao" : "yangbao",
    period_type: body.period_type === "year" ? "year" : "month",
    period_start: String(body.period_start || ""),
    item_name: String(body.item_name || "").trim(),
    amount: Number(body.amount || 0),
    note: String(body.note || ""),
    is_recurring: body.is_recurring === true
  };
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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase environment variables.");

  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Content-Type", "application/json");

  const result = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path}`, { ...init, headers });
  if (!result.ok) throw new Error(`Supabase REST ${result.status}: ${(await result.text()).slice(0, 500)}`);
  return (await result.json()) as T;
}
