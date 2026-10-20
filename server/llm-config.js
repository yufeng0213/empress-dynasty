/**
 * LLM 配置仓库：多套接口配置，可保存、切换、删除。
 *
 * 设计原则：
 * - 密钥只落盘在服务器（DATA_DIR/llm-profiles.json），接口只回传掩码。
 * - 仍然支持 .env 里的单套配置，作为只读的「环境变量」配置项。
 * - 任何时刻只有一个激活配置，/api/chat 默认使用它。
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const DATA_DIR = resolve(process.env.DATA_DIR || 'data')
const CONFIG_FILE = join(DATA_DIR, 'llm-profiles.json')
const TEMP_FILE = `${CONFIG_FILE}.tmp`

const ENV_PROFILE_ID = 'env'

const ENV_PROFILE = {
  id: ENV_PROFILE_ID,
  name: '服务器环境变量',
  // 兼容旧部署：只写了 Key 和模型时，仍默认走 OpenAI 兼容地址
  apiBase: process.env.LLM_API_BASE || 'https://api.openai.com/v1/chat/completions',
  model: process.env.LLM_MODEL || 'gpt-4o-mini',
  apiKey: process.env.LLM_API_KEY || '',
  extraParams: process.env.LLM_EXTRA_PARAMS || '',
  readOnly: true,
  source: 'env',
}

const state = {
  activeId: '',
  profiles: [],
}

const ensureDir = () => {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

const sanitizeText = (value, max = 400) => String(value ?? '').trim().slice(0, max)

const parseExtra = (raw) => {
  const text = sanitizeText(raw, 2000)
  if (!text) return { ok: true, value: '' }
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: '额外参数必须是 JSON 对象，例如 {"top_p":0.95}' }
    }
    return { ok: true, value: text }
  } catch {
    return { ok: false, error: '额外参数不是合法 JSON' }
  }
}

const normalizeApiBase = (raw) => {
  const text = sanitizeText(raw, 500)
  if (!text) return { ok: false, error: '接口地址不能为空' }
  if (!/^https?:\/\//i.test(text)) return { ok: false, error: '接口地址需以 http:// 或 https:// 开头' }
  return { ok: true, value: text }
}

const makeId = () => `llm_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

const load = () => {
  ensureDir()
  if (!existsSync(CONFIG_FILE)) return
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
    state.activeId = typeof parsed?.activeId === 'string' ? parsed.activeId : ''
    state.profiles = Array.isArray(parsed?.profiles)
      ? parsed.profiles.filter((item) => item && typeof item.id === 'string')
      : []
  } catch (error) {
    console.error('[llm-config] 配置解析失败，已备份:', error.message)
    try {
      renameSync(CONFIG_FILE, join(DATA_DIR, `llm-profiles.corrupt.${Date.now()}.json`))
    } catch {
      // 忽略
    }
  }
}

const save = () => {
  ensureDir()
  writeFileSync(TEMP_FILE, JSON.stringify({ activeId: state.activeId, profiles: state.profiles }, null, 2), 'utf8')
  renameSync(TEMP_FILE, CONFIG_FILE)
}

export const envConfigured = () => Boolean(ENV_PROFILE.apiKey && ENV_PROFILE.apiBase)

const keyHint = (key) => {
  const text = String(key || '')
  if (!text) return ''
  if (text.length <= 8) return '已保存'
  return `${text.slice(0, 3)}••••${text.slice(-4)}`
}

/** 对外暴露的配置：绝不包含密钥明文 */
const maskProfile = (profile) => ({
  id: profile.id,
  name: profile.name,
  apiBase: profile.apiBase,
  model: profile.model,
  extraParams: profile.extraParams || '',
  hasKey: Boolean(profile.apiKey),
  keyHint: keyHint(profile.apiKey),
  readOnly: Boolean(profile.readOnly),
  source: profile.source || 'local',
  updatedAt: profile.updatedAt || 0,
})

const findStored = (id) => state.profiles.find((item) => item.id === id) || null

const resolveEnv = () => (envConfigured() ? { ...ENV_PROFILE } : null)

/** 取激活配置（含密钥），没有可用配置时返回 null */
export const activeProfile = () => {
  if (state.activeId && state.activeId !== ENV_PROFILE_ID) {
    const stored = findStored(state.activeId)
    if (stored?.apiKey && stored.apiBase) return { ...stored }
  }
  const env = resolveEnv()
  if (env) return env
  const fallback = state.profiles.find((item) => item.apiKey && item.apiBase)
  return fallback ? { ...fallback } : null
}

/** 按 id 取配置（含密钥）；id 为空时用激活配置 */
export const getProfile = (id) => {
  if (!id) return activeProfile()
  if (id === ENV_PROFILE_ID) return resolveEnv()
  const stored = findStored(id)
  return stored ? { ...stored } : null
}

export const listConfig = () => {
  const list = []
  const env = resolveEnv()
  if (env) list.push(maskProfile(env))
  for (const item of state.profiles) list.push(maskProfile(item))
  const active = activeProfile()
  return {
    profiles: list,
    activeId: active?.id || '',
    envConfigured: envConfigured(),
    storagePath: CONFIG_FILE,
    dataDir: DATA_DIR,
  }
}

/** 新建配置 */
export const createProfile = (payload = {}) => {
  const name = sanitizeText(payload.name, 40) || '未命名配置'
  const base = normalizeApiBase(payload.apiBase)
  if (!base.ok) return { ok: false, error: base.error }
  const model = sanitizeText(payload.model, 120)
  if (!model) return { ok: false, error: '模型名不能为空' }
  const apiKey = sanitizeText(payload.apiKey, 400)
  if (!apiKey) return { ok: false, error: 'API Key 不能为空' }
  const extra = parseExtra(payload.extraParams)
  if (!extra.ok) return { ok: false, error: extra.error }

  const profile = {
    id: makeId(),
    name,
    apiBase: base.value,
    model,
    apiKey,
    extraParams: extra.value,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  state.profiles.push(profile)
  if (payload.activate !== false || !state.activeId) state.activeId = profile.id
  save()
  return { ok: true, profile: maskProfile(profile), activeId: state.activeId }
}

/** 更新配置；apiKey 留空表示沿用旧密钥 */
export const updateProfile = (id, payload = {}) => {
  const profile = findStored(id)
  if (!profile) return { ok: false, error: '配置不存在或不可编辑' }

  if (payload.name !== undefined) {
    const name = sanitizeText(payload.name, 40)
    if (!name) return { ok: false, error: '配置名称不能为空' }
    profile.name = name
  }
  if (payload.apiBase !== undefined) {
    const base = normalizeApiBase(payload.apiBase)
    if (!base.ok) return { ok: false, error: base.error }
    profile.apiBase = base.value
  }
  if (payload.model !== undefined) {
    const model = sanitizeText(payload.model, 120)
    if (!model) return { ok: false, error: '模型名不能为空' }
    profile.model = model
  }
  if (payload.apiKey !== undefined && String(payload.apiKey).trim()) {
    profile.apiKey = sanitizeText(payload.apiKey, 400)
  }
  if (payload.extraParams !== undefined) {
    const extra = parseExtra(payload.extraParams)
    if (!extra.ok) return { ok: false, error: extra.error }
    profile.extraParams = extra.value
  }
  profile.updatedAt = Date.now()
  save()
  return { ok: true, profile: maskProfile(profile) }
}

export const removeProfile = (id) => {
  if (id === ENV_PROFILE_ID) return { ok: false, error: '环境变量配置不可删除' }
  const index = state.profiles.findIndex((item) => item.id === id)
  if (index < 0) return { ok: false, error: '配置不存在' }
  state.profiles.splice(index, 1)
  if (state.activeId === id) state.activeId = ''
  save()
  return { ok: true, activeId: activeProfile()?.id || '' }
}

export const setActive = (id) => {
  if (!id) return { ok: false, error: '缺少配置 id' }
  if (id !== ENV_PROFILE_ID && !findStored(id)) return { ok: false, error: '配置不存在' }
  if (id === ENV_PROFILE_ID && !envConfigured()) {
    return { ok: false, error: '服务器环境变量未配置 LLM_API_KEY' }
  }
  state.activeId = id
  save()
  return { ok: true, activeId: id }
}

load()
