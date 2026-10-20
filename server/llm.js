/**
 * LLM 代理：密钥只留在服务器，浏览器不接触。
 * 支持多套配置：请求默认使用「当前启用」的那一套，也允许显式指定 profileId（用于测试）。
 * 兼容 OpenAI 形态的 /chat/completions 接口。
 */

import { activeProfile, getProfile } from './llm-config.js'

const normalizeEndpoint = (base) => {
  const text = String(base || '').trim().replace(/\/+$/, '')
  if (!text) return ''
  if (/\/chat\/completions$/i.test(text)) return text
  if (/\/v1$/i.test(text)) return `${text}/chat/completions`
  return `${text}/chat/completions`
}

const parseExtraParams = (raw) => {
  if (!raw) return {}
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/** 给前端看的当前配置摘要（不含密钥） */
export const llmStatus = () => {
  const profile = activeProfile()
  if (!profile) {
    return { configured: false, profileId: '', name: '', model: '', endpoint: '' }
  }
  return {
    configured: Boolean(profile.apiKey && profile.apiBase),
    profileId: profile.id,
    name: profile.name,
    model: profile.model,
    endpoint: normalizeEndpoint(profile.apiBase),
  }
}

/**
 * @param {{systemPrompt:string, userPrompt:string, temperature?:number, maxTokens?:number, timeout?:number, profileId?:string}} payload
 */
export const chatCompletion = async ({
  systemPrompt = '',
  userPrompt = '',
  temperature = 0.8,
  maxTokens = 2000,
  timeout = 120000,
  profileId = '',
  profile: profileOverride = null,
} = {}) => {
  const profile = profileOverride || getProfile(profileId)

  if (!profile) {
    return {
      success: false,
      error: '尚未配置 AI 接口，请到「设置 · AI 接口」里新增一套配置并启用',
      data: null,
    }
  }
  if (!profile.apiBase) {
    return { success: false, error: `配置「${profile.name}」缺少接口地址`, data: null }
  }
  if (!profile.apiKey) {
    return { success: false, error: `配置「${profile.name}」缺少 API Key`, data: null }
  }

  const endpoint = normalizeEndpoint(profile.apiBase)
  const extra = parseExtraParams(profile.extraParams)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.min(Number(timeout) || 120000, 180000))

  const send = async (tokens) => fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${profile.apiKey}`,
    },
    signal: controller.signal,
    body: JSON.stringify({
      model: profile.model,
      messages: [
        { role: 'system', content: String(systemPrompt || '') },
        { role: 'user', content: String(userPrompt || '') },
      ],
      temperature,
      max_tokens: tokens,
      stream: false,
      ...extra,
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

    return { success: true, error: '', data: content, model: profile.model }
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { success: false, error: '生成超时，已中断', data: null }
    }
    return { success: false, error: `请求异常：${error?.message || error}`, data: null }
  } finally {
    clearTimeout(timer)
  }
}

/** 连通性测试：只发一句话，返回耗时 */
export const testCompletion = async (options = {}) => {
  const started = Date.now()
  const result = await chatCompletion({
    systemPrompt: '你是连通性测试助手，只回复用户要求的内容。',
    userPrompt: '只回复两个字：可用',
    temperature: 0,
    maxTokens: 128,
    timeout: 25000,
    profileId: options.profileId || '',
    profile: options.profile || null,
  })

  return {
    ...result,
    latency: Date.now() - started,
    data: result.success ? String(result.data || '').slice(0, 80) : null,
  }
}
