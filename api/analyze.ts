import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertAccess } from "./shared/guard";
import { supabaseRest } from "./shared/supabase";
import { runModelAnalysis } from "./shared/analysis";
import type { Category, Entry, PeriodType, ScopeType } from "./shared/types";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    if (assertAccess(request, response)) return;
    if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });

    const scope = (request.body.scope || "personal") as ScopeType;
    const periodType = (request.body.periodType || "month") as PeriodType;
    const periodStart = request.body.periodStart as string;
    const question = request.body.question || "本期收支结构有什么问题？";
    const entryQuery = new URLSearchParams({
      select: "*",
      scope: `eq.${scope}`,
      period_type: `eq.${periodType}`,
      period_start: `eq.${periodStart}`,
      order: "created_at.asc"
    });

    const [categories, entries] = await Promise.all([
      supabaseRest<Category[]>("ledger_categories?select=*&order=sort_order.asc"),
      supabaseRest<Entry[]>(`ledger_entries?${entryQuery.toString()}`)
    ]);

    const analysis = await runModelAnalysis({
      question,
      scope,
      periodType,
      periodStart,
      categories: categories || [],
      entries: entries || []
    });

    response.status(200).json({ analysis });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Unexpected API error" });
  }
}
