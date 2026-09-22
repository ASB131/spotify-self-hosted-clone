import { NextRequest, NextResponse } from "next/server";

const backend = () => process.env.INTERNAL_API_URL || "http://127.0.0.1:8000";

async function proxy(req: NextRequest, segments: string[]) {
  const path = segments.join("/");
  const target = `${backend()}/api/v1/${path}${req.nextUrl.search}`;
  const headers = new Headers(req.headers);
  headers.delete("host");
  const cookie = req.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const auth = req.headers.get("authorization");
  if (auth) headers.set("authorization", auth);
  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }
  const res = await fetch(target, init);
  const outHeaders = new Headers(res.headers);
  return new NextResponse(res.body, { status: res.status, headers: outHeaders });
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
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
