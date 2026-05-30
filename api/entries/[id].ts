import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
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

async function supabaseRest<T>(path: string, init: RequestInit = {}) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase environment variables.");

  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Content-Type", "application/json");

  const result = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path}`, { ...init, headers });
  if (!result.ok) throw new Error(`Supabase REST ${result.status}: ${(await result.text()).slice(0, 500)}`);
  if (result.status === 204) return undefined as T;
  return (await result.json()) as T;
}
