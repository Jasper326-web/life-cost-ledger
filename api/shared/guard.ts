import type { VercelRequest, VercelResponse } from "@vercel/node";

export function assertAccess(request: VercelRequest, response: VercelResponse) {
  const expected = process.env.APP_ACCESS_CODE;
  if (!expected) return false;

  if (request.headers["x-app-access-code"] === expected) return false;

  response.status(401).json({ error: "ACCESS_CODE_REQUIRED" });
  return true;
}
