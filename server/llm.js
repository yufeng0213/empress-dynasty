/**
 * LLM 代理：密钥只留在服务器，浏览器不接触。
 * 默认走 OpenAI 兼容的 /chat/completions 接口。
 */

const API_BASE = process.env.LLM_API_BASE || 'https://api.openai.com/v1/chat/completions'
const API_KEY = process.env.LLM_API_KEY || ''
const MODEL = process.env.LLM_MODEL || 'gpt-4o-mini'

const parseExtraParams = () => {
  const raw = process.env.LLM_EXTRA_PARAMS
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    console.warn('[llm] LLM_EXTRA_PARAMS 不是合法 JSON，已忽略')
    return {}
  }
}

const EXTRA_PARAMS = parseExtraParams()

export const llmConfig = () => ({
  configured: Boolean(API_KEY && API_BASE),
  model: MODEL,
  endpoint: API_BASE,
})

const normalizeEndpoint = (base) => {
  // 允许只填到 /v1，自动补全路径
  if (/\/chat\/completions\/?$/.test(base)) return base
  return `${base.replace(/\/+$/, '')}/chat/completions`
}

/**
 * @param {{systemPrompt:string, userPrompt:string, temperature?:number, maxTokens?:number, timeout?:number, label?:string}} payload
 */
export const chatCompletion = async ({
  systemPrompt = '',
  userPrompt = '',
  temperature = 0.8,
  maxTokens = 2000,
  timeout = 120000,
}) => {
  if (!API_KEY) {
    return { success: false, error: '服务器未配置 LLM_API_KEY，请检查 .env', data: null }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.min(Number(timeout) || 120000, 180000))

  const send = async (tokens) => fetch(normalizeEndpoint(API_BASE), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    signal: controller.signal,
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: String(systemPrompt || '') },
        { role: 'user', content: String(userPrompt || '') },
      ],
      temperature,
      max_tokens: tokens,
      stream: false,
      ...EXTRA_PARAMS,
    }),
  })

  try {
    let response = await send(maxTokens)
    let errorText = ''

    if (!response.ok) {
      errorText = await response.text().catch(() => '')

      // 部分模型拒绝过大的 max_tokens，降档重试一次
      if (maxTokens > 8192 && /max[_\s-]?tokens/i.test(errorText)) {
        response = await send(8192)
        errorText = response.ok ? '' : await response.text().catch(() => '')
      }

      if (!response.ok) {
        return {
          success: false,
          error: `上游接口失败 ${response.status} ${errorText}`.slice(0, 500),
          data: null,
        }
      }
    }

    const payload = await response.json()
    const content = payload?.choices?.[0]?.message?.content

    if (typeof content !== 'string' || !content.trim()) {
      return { success: false, error: '上游返回内容为空', data: null }
    }

    return { success: true, error: '', data: content }
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { success: false, error: '生成超时，已中断', data: null }
    }
    return { success: false, error: `请求异常：${error?.message || error}`, data: null }
  } finally {
    clearTimeout(timer)
  }
}
