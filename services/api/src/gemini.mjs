import { ApiError } from "./providers.mjs";

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
const MAX_ATTEMPTS = 4;
const TOTAL_TIMEOUT_MS = 85_000; // The web proxy stops waiting after 100 seconds.

function retryDelay(response, attempt) {
  const header = response?.headers.get("retry-after");
  const seconds = header === null || header === undefined ? NaN : Number(header);
  const retryAfterMs = Number.isFinite(seconds) ? seconds * 1000 : header ? Date.parse(header) - Date.now() : NaN;
  const backoffMs = 1000 * 2 ** attempt * (0.8 + Math.random() * 0.4);
  return Math.min(10_000, Math.max(backoffMs, Number.isFinite(retryAfterMs) ? retryAfterMs : 0));
}

async function wait(ms) { await new Promise((resolve) => setTimeout(resolve, ms)); }

export async function generateGeminiJson({ key, model = DEFAULT_GEMINI_MODEL, contents, systemInstruction, schema, timeoutMs = 45_000, totalTimeoutMs = TOTAL_TIMEOUT_MS, maxOutputTokens = 6000 }) {
  if (!key) throw new ApiError("AI_NOT_CONFIGURED", "서버에 GEMINI_API_KEY를 설정해 주세요.", 503);
  if (!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(model)) throw new ApiError("AI_MODEL_ERROR", "Gemini 모델 ID를 확인해 주세요.", 503);
  const payload = { systemInstruction: { parts: [{ text: systemInstruction }] }, contents, generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema, maxOutputTokens } };
  let response;
  const deadline = Date.now() + Math.min(TOTAL_TIMEOUT_MS, totalTimeoutMs);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 1000) break;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(Math.min(timeoutMs, remaining - 500)) });
    } catch {
      response = undefined;
      if (attempt === MAX_ATTEMPTS - 1) break;
    }
    if (response && ![408, 429].includes(response.status) && response.status < 500) break;
    if (attempt === MAX_ATTEMPTS - 1) break;
    const delay = retryDelay(response, attempt);
    if (deadline - Date.now() <= delay + 1000) break;
    await response?.body?.cancel();
    await wait(delay);
  }
  if (!response) throw new ApiError("AI_UNAVAILABLE", "Gemini 서버 응답을 받지 못했습니다. 입력을 유지하고 다시 요청해 주세요.", 503);
  if ([401, 403].includes(response.status)) throw new ApiError("AI_AUTH_ERROR", "서버의 Gemini API 키 또는 해당 프로젝트 권한을 확인해 주세요.", 503);
  if (response.status === 429) throw new ApiError("AI_RATE_LIMIT", "Gemini 요청 한도에 도달했습니다. 잠시 후 다시 요청해 주세요.", 429);
  if (response.status === 408) throw new ApiError("AI_UNAVAILABLE", "Gemini 요청 시간이 초과됐습니다. 입력을 유지하고 다시 요청해 주세요.", 503);
  if (response.status >= 500) throw new ApiError("AI_UNAVAILABLE", "Gemini 서버가 일시적으로 요청을 처리하지 못했습니다. 입력을 유지하고 잠시 후 다시 요청해 주세요.", 503);
  if (response.status === 404) throw new ApiError("AI_MODEL_ERROR", "설정한 Gemini 모델을 사용할 수 없습니다. 서버의 UWAT_MODEL을 확인해 주세요.", 503);
  if (!response.ok) throw new ApiError("AI_PROVIDER_ERROR", "Gemini 모델 ID와 요청 설정을 확인해야 합니다. 임의 판단으로 대신 저장하지 않았습니다.", 502);
  let result;
  try { result = await response.json(); } catch { throw new ApiError("AI_RESPONSE_INVALID", "Gemini 응답을 읽지 못했습니다.", 502); }
  const candidate = result.candidates?.[0];
  if (result.promptFeedback?.blockReason || ["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"].includes(candidate?.finishReason)) throw new ApiError("AI_REFUSED", "이 입력은 Gemini가 처리하지 못했습니다. 다른 사진으로 다시 요청해 주세요.", 422);
  if (!candidate || candidate.finishReason !== "STOP") throw new ApiError("AI_INCOMPLETE", "Gemini 판단이 끝나지 않았습니다. 입력을 유지하고 다시 요청해 주세요.", 502);
  const text = (candidate.content?.parts ?? []).filter((part) => typeof part.text === "string" && part.thought !== true).map((part) => part.text).join("");
  try { return JSON.parse(text); } catch { throw new ApiError("AI_RESPONSE_INVALID", "Gemini 판단 형식을 읽지 못했습니다.", 502); }
}
