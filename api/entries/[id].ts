import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertAccess } from "../_shared/guard";
import { supabaseRest } from "../_shared/supabase";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    if (assertAccess(request, response)) return;

    const id = String(request.query.id);

    if (request.method === "PATCH") {
      const rows = await supabaseRest<unknown[]>(`ledger_entries?id=eq.${id}&select=*`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(request.body)
      });
      return response.status(200).json(rows[0]);
    }

    if (request.method === "DELETE") {
      await supabaseRest(`ledger_entries?id=eq.${id}`, { method: "DELETE" });
      return response.status(200).json({ ok: true });
    }

    response.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Unexpected API error" });
  }
}
