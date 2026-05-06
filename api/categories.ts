import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertAccess } from "./_shared/guard";
import { getSupabase } from "./_shared/supabase";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (assertAccess(request, response)) return;
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });

  const supabase = getSupabase();
  const { data: last } = await supabase
    .from("ledger_categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("ledger_categories")
    .insert({
      name: request.body.name,
      flow_type: request.body.flow_type || "expense",
      sort_order: Number(last?.sort_order || 0) + 1
    })
    .select("*")
    .single();

  if (error) return response.status(500).json({ error: error.message });
  response.status(200).json(data);
}
