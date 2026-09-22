import { NextRequest, NextResponse } from "next/server";

const backend = () => process.env.INTERNAL_API_URL || "http://127.0.0.1:8000";

/** Headers the browser sends that the API needs (esp. stream Range + FLAC UA detect). */
const FORWARD_REQUEST_HEADERS = [
  "cookie",
  "authorization",
  "content-type",
  "accept",
  "range",
  "user-agent",
  "if-range",
  "if-none-match",
  "if-modified-since",
] as const;

async function proxy(req: NextRequest, segments: string[]) {
  const path = segments.join("/");
  const target = `${backend()}/api/v1/${path}${req.nextUrl.search}`;
  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
    // Required so Range / streaming bodies are not buffered oddly by undici.
    cache: "no-store",
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }
  const res = await fetch(target, init);

  // Rebuild headers so multiple Set-Cookie values are preserved (login/session).
  const outHeaders = new Headers();
  res.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    outHeaders.append(key, value);
  });
  const getSetCookie = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const setCookies = typeof getSetCookie === "function" ? getSetCookie.call(res.headers) : [];
  for (const c of setCookies) {
    outHeaders.append("set-cookie", c);
  }

  return new NextResponse(res.body, { status: res.status, headers: outHeaders });
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path);
}

export async function HEAD(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path);
}

export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path);
}

export async function PUT(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path);
}

export async function PATCH(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path);
}

export async function DELETE(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path);
}
