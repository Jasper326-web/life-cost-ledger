import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertAccess } from "../_shared/guard";
import { getSupabase } from "../_shared/supabase";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (assertAccess(request, response)) return;

  const id = String(request.query.id);
  const supabase = getSupabase();

  if (request.method === "PATCH") {
    const { data, error } = await supabase
      .from("ledger_entries")
      .update(request.body)
      .eq("id", id)
      .select("*")
      .single();
    if (error) return response.status(500).json({ error: error.message });
    return response.status(200).json(data);
  }

  if (request.method === "DELETE") {
    const { error } = await supabase.from("ledger_entries").delete().eq("id", id);
    if (error) return response.status(500).json({ error: error.message });
    return response.status(200).json({ ok: true });
  }

  response.status(405).json({ error: "Method not allowed" });
}
