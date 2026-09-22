import { NextResponse } from "next/server";

/**
 * Runtime URLs for the browser (not baked at image build time).
 * Set via web service env in docker-compose (.env on the host).
 *
 * Note: access env via process.env[name] so Next does not inline empty
 * values at build time.
 */
export async function GET() {
  const env = process.env as Record<string, string | undefined>;
  const apiDirect = (env["API_DIRECT_URL"] || env["NEXT_PUBLIC_API_DIRECT_URL"] || "").trim();
  const ws = (env["WS_URL"] || env["NEXT_PUBLIC_WS_URL"] || "").trim();
  return NextResponse.json({
    api_direct: apiDirect,
    ws_url: ws,
  });
}
