import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertAccess } from "./shared/guard";
import { supabaseRest } from "./shared/supabase";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    if (assertAccess(request, response)) return;
    if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });

    const lastRows = await supabaseRest<{ sort_order: number }[]>(
      "ledger_categories?select=sort_order&order=sort_order.desc&limit=1"
    );
    const rows = await supabaseRest<unknown[]>("ledger_categories?select=*", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        name: request.body.name,
        flow_type: request.body.flow_type || "expense",
        sort_order: Number(lastRows[0]?.sort_order || 0) + 1
      })
    });
    return response.status(200).json(rows[0]);
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Unexpected API error" });
  }
}
