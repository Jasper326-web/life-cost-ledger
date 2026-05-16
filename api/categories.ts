import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    if (denyWithoutAccessCode(request, response)) return;
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

    response.status(200).json(rows[0]);
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Unexpected API error" });
  }
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
