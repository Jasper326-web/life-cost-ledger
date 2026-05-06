import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertAccess } from "./_shared/guard";
import { getSupabase, isSupabaseConfigured } from "./_shared/supabase";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (assertAccess(request, response)) return;

  if (request.method === "GET") {
    if (!isSupabaseConfigured()) return response.status(200).json({ categories: [], entries: [] });

    const scope = String(request.query.scope || "personal");
    const periodType = String(request.query.periodType || "month");
    const periodStart = String(request.query.periodStart || "");
    const supabase = getSupabase();

    const [{ data: categories, error: categoryError }, { data: entries, error: entryError }] =
      await Promise.all([
        supabase.from("ledger_categories").select("*").order("sort_order", { ascending: true }),
        supabase
          .from("ledger_entries")
          .select("*, ledger_categories(*)")
          .eq("scope", scope)
          .eq("period_type", periodType)
          .eq("period_start", periodStart)
          .order("created_at", { ascending: true })
      ]);

    if (categoryError || entryError) {
      return response.status(500).json({ error: categoryError?.message || entryError?.message });
    }

    return response.status(200).json({ categories, entries });
  }

  if (request.method === "POST") {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("ledger_entries").insert(request.body).select("*").single();
    if (error) return response.status(500).json({ error: error.message });
    return response.status(200).json(data);
  }

  response.status(405).json({ error: "Method not allowed" });
}
