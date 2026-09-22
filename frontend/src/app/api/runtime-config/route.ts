import { NextResponse } from "next/server";

/**
 * Runtime URLs for the browser (not baked at image build time).
 * Set via web service env in docker-compose (.env on the host).
 */
export async function GET() {
  const apiDirect = (
    process.env.API_DIRECT_URL ||
    process.env.NEXT_PUBLIC_API_DIRECT_URL ||
    ""
  ).trim();
  const ws = (process.env.WS_URL || process.env.NEXT_PUBLIC_WS_URL || "").trim();
  return NextResponse.json({
    api_direct: apiDirect,
    ws_url: ws,
  });
}
