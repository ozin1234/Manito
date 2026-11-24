import { NextResponse } from "next/server";

const COOKIE = "kroad_admin_session";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const problem = (code: string, message: string, status: number) => NextResponse.json({ error: { code, message } }, { status, headers });
function sessionToken(request: Request) { return request.headers.get("cookie")?.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? ""; }
async function engine(path: string, request: Request, body?: string) {
  const base = process.env.GROAD_INDEPENDENT_API_URL, key = process.env.GROAD_INDEPENDENT_API_KEY;
  if (!base || !key) throw new Error("ENGINE_NOT_CONFIGURED");
  return fetch(new URL(path, base), { method: request.method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-KROAD-Admin-Session": sessionToken(request) }, ...(body === undefined ? {} : { body }), cache: "no-store", signal: AbortSignal.timeout(12_000) });
}
function clear(response: NextResponse) { response.cookies.set(COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/api/admin", maxAge: 0 }); return response; }
async function handler(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params, action = path.join("/");
  if (!/^(?:login|logout|session|cases(?:\/[a-zA-Z0-9-]+)?)$/.test(action)) return problem("NOT_FOUND", "관리 경로를 찾지 못했습니다.", 404);
  const origin = new URL(process.env.KROAD_PUBLIC_ORIGIN || request.url).origin;
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname);
  if (!local && !origin.startsWith("https://")) return problem("HTTPS_REQUIRED", "기관 관리자는 HTTPS 연결이 필요합니다.", 403);
  if (request.method !== "GET") {
    if (request.headers.get("origin") !== origin) return problem("INVALID_ORIGIN", "같은 사이트에서 다시 요청해 주세요.", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return problem("INVALID_CONTENT_TYPE", "JSON 요청이 필요합니다.", 415);
  }
  try {
    if (action === "session" && request.method === "GET" && !sessionToken(request)) {
      const status = await engine("/v1/admin/status", request);
      if (!status.ok) throw new Error();
      return NextResponse.json({ authenticated: false, ...(await status.json() as { configured: boolean }) }, { headers });
    }
    if (action !== "login" && !sessionToken(request)) return problem("ADMIN_UNAUTHORIZED", "기관 관리자 로그인이 필요합니다.", 401);
    if ((action === "login" || action === "logout") && request.method !== "POST" || action === "session" && request.method !== "GET" || action === "cases" && request.method !== "GET" || action.startsWith("cases/") && !["GET", "PATCH"].includes(request.method)) return problem("METHOD_NOT_ALLOWED", "지원하지 않는 요청입니다.", 405);
    if (Number(request.headers.get("content-length") ?? 0) > 8192) return problem("REQUEST_TOO_LARGE", "요청 내용이 너무 큽니다.", 413);
    const body = request.method === "GET" ? undefined : await request.text();
    if (body && Buffer.byteLength(body) > 8192) return problem("REQUEST_TOO_LARGE", "요청 내용이 너무 큽니다.", 413);
    const response = await engine(`/v1/admin/${action}${request.method === "GET" ? new URL(request.url).search : ""}`, request, body);
    const data = await response.json() as Record<string, unknown>;
    if (action === "login" && response.ok) {
      if (typeof data.token !== "string") throw new Error();
      const result = NextResponse.json({ authenticated: true, user: data.user, role: data.role, expiresAt: data.expiresAt }, { headers });
      result.cookies.set(COOKIE, data.token, { httpOnly: true, sameSite: "strict", secure: origin.startsWith("https://"), path: "/api/admin", maxAge: 8 * 3600 });
      return result;
    }
    if (action === "session" && response.ok) return NextResponse.json({ authenticated: true, configured: true, ...data }, { headers });
    if (action === "session" && response.status === 401) return clear(NextResponse.json({ authenticated: false, configured: true }, { headers }));
    const result = NextResponse.json(data, { status: response.status, headers });
    return action === "logout" ? clear(result) : result;
  } catch { return problem("ADMIN_UNAVAILABLE", "관리 서버에 연결하지 못했습니다. 서버 실행과 관리자 설정을 확인해 주세요.", 503); }
}
export const GET = handler;
export const POST = handler;
export const PATCH = handler;
