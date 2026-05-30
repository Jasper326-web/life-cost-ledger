import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    if (request.method === "POST") {
      const saving = normalizeSavingBody(request.body);
      const rows = await supabaseRest<unknown[]>("family_savings?select=*", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(saving)
      });
      return response.status(200).json(rows[0]);
    }

    response.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : "Unexpected API error" });
  }
}

function normalizeSavingBody(body: Record<string, unknown>) {
  return {
    period_type: body.period_type === "year" ? "year" : "month",
    period_start: String(body.period_start || ""),
    person: body.person === "yubao" ? "yubao" : "yangbao",
    source_name: String(body.source_name || "").trim(),
    amount: Number(body.amount || 0),
    note: String(body.note || "")
  };
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
  return (await result.json()) as T;
}
