import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertAccess } from "./shared/guard";
import { isSupabaseConfigured, supabaseRest } from "./shared/supabase";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    if (assertAccess(request, response)) return;

    if (request.method === "GET") {
      if (!isSupabaseConfigured()) return response.status(200).json({ categories: [], entries: [] });

      const scope = String(request.query.scope || "personal");
      const periodType = String(request.query.periodType || "month");
      const periodStart = String(request.query.periodStart || "");
      const entryQuery = new URLSearchParams({
        select: "*",
        scope: `eq.${scope}`,
        period_type: `eq.${periodType}`,
        period_start: `eq.${periodStart}`,
        order: "created_at.asc"
      });

      const [categories, entries] = await Promise.all([
        supabaseRest("ledger_categories?select=*&order=sort_order.asc"),
        supabaseRest(`ledger_entries?${entryQuery.toString()}`)
      ]);

      return response.status(200).json({ categories, entries });
    }

    if (request.method === "POST") {
      const rows = await supabaseRest<unknown[]>("ledger_entries?select=*", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(request.body)
      });
      return response.status(200).json(rows[0]);
    }

    response.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Unexpected API error" });
  }
}
