/**
 * 异步分析任务失败时，error.code → 用户友好主文案的映射。
 *
 * Why: 后端 error.message 可能是原始技术信息（如 "LLM API call failed: 429"），
 * 对普通用户不够友好；气泡内要展示一行易读的主文案，再把 error.message 作为
 * 小号灰字的细节行附在下方。
 * How: 未命中时回落到"分析失败"。
 */

const ERROR_MAIN_TEXT: Record<string, string> = {
  TIMEOUT: '分析超时，请尝试缩小时间范围后重试',
  API_ERROR: '外部接口调用失败，请稍后重试',
  LLM_ERROR: 'AI 模型暂时不可用，请稍后重试',
  INTENT_UNCLEAR: '未能理解你的问题，请换个说法再试',
  NO_DATA: '未查询到相关数据，请调整查询条件',
};

export const FALLBACK_ERROR_MAIN = '分析失败';

export function errorMainText(code: string | undefined): string {
  if (!code) return FALLBACK_ERROR_MAIN;
  return ERROR_MAIN_TEXT[code] ?? FALLBACK_ERROR_MAIN;
}

/**
 * 查映射但未命中时返回 undefined，便于调用方决定"用映射文案还是用原始 err.message"。
 * onError 等拿到 ApiError 的场景用这个：命中了用友好文案，没命中就展示后端原话。
 */
export function tryErrorMainText(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return ERROR_MAIN_TEXT[code];
}
