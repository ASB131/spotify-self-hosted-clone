import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";

/**
 * Prefer a file written at container start (see Dockerfile entrypoint) so Next
 * cannot inline empty env values at build time.
 */
export async function GET() {
  const filePath = "/tmp/resonance-runtime.json";
  if (existsSync(filePath)) {
    try {
      const data = JSON.parse(readFileSync(filePath, "utf8"));
      return NextResponse.json({
        api_direct: String(data.api_direct || ""),
        ws_url: String(data.ws_url || ""),
      });
    } catch {
      /* fall through */
    }
  }
  const env = process.env as Record<string, string | undefined>;
  return NextResponse.json({
    api_direct: (env["API_DIRECT_URL"] || env["NEXT_PUBLIC_API_DIRECT_URL"] || "").trim(),
    ws_url: (env["WS_URL"] || env["NEXT_PUBLIC_WS_URL"] || "").trim(),
  });
}
