import { NextResponse } from "next/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response(null, { status: 404 });
  const base = process.env.GROAD_INDEPENDENT_API_URL;
  const key = process.env.GROAD_INDEPENDENT_API_KEY;
  if (!base || !key) return new Response(null, { status: 503 });
  try {
    const response = await fetch(new URL(`/v1/reports/${id}/photo`, base), {
      headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(12_000),
    });
    if (response.status === 404) return new Response(null, { status: 404 });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !["image/jpeg", "image/png", "image/webp"].includes(type)) return new Response(null, { status: 503 });
    return new Response(response.body, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ error: { code: "PHOTO_UNAVAILABLE" } }, { status: 503 }); }
}
