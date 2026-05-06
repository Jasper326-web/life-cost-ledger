import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertAccess } from "./_shared/guard";
import { getSupabase } from "./_shared/supabase";
import { runModelAnalysis } from "./_shared/analysis";
import type { PeriodType, ScopeType } from "./_shared/types";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (assertAccess(request, response)) return;
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });

  const scope = (request.body.scope || "personal") as ScopeType;
  const periodType = (request.body.periodType || "month") as PeriodType;
  const periodStart = request.body.periodStart as string;
  const question = request.body.question || "本期收支结构有什么问题？";
  const supabase = getSupabase();

  const [{ data: categories, error: categoryError }, { data: entries, error: entryError }] =
    await Promise.all([
      supabase.from("ledger_categories").select("*").order("sort_order", { ascending: true }),
      supabase
        .from("ledger_entries")
        .select("*")
        .eq("scope", scope)
        .eq("period_type", periodType)
        .eq("period_start", periodStart)
        .order("created_at", { ascending: true })
    ]);

  if (categoryError || entryError) {
    return response.status(500).json({ error: categoryError?.message || entryError?.message });
  }

  const analysis = await runModelAnalysis({
    question,
    scope,
    periodType,
    periodStart,
    categories: categories || [],
    entries: entries || []
  });

  response.status(200).json({ analysis });
}
