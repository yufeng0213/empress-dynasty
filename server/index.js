/**
 * 女帝王朝 · 服务端
 * 一个进程同时负责：静态资源托管、LLM 代理、AI 配置、存档读写。
 */

import express from 'express'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chatCompletion, llmStatus, testCompletion } from './llm.js'
import {
  activeProfile,
  createProfile,
  getProfile,
  listConfig,
  removeProfile,
  setActive,
  updateProfile,
} from './llm-config.js'
import { kvStore, storePath } from './store.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DIST = join(ROOT, 'dist')
const PORT = Number(process.env.PORT) || 3001

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '8mb' }))

/* ===== 健康检查 ===== */

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    llm: llmStatus(),
    storage: storePath,
    uptime: Math.round(process.uptime()),
  })
})

/* ===== 存档 KV ===== */

app.get('/api/kv', (req, res) => {
  res.json({ keys: kvStore.keys() })
})

app.get('/api/kv/:key', (req, res) => {
  res.json({ value: kvStore.get(req.params.key) })
})

app.put('/api/kv/:key', async (req, res) => {
  try {
    const value = req.body?.value ?? null
    await kvStore.set(req.params.key, value)
    res.json({ ok: true })
  } catch (error) {
    console.error('[api] 存档写入失败:', error.message)
    res.status(500).json({ ok: false, error: '存档写入失败' })
  }
})

app.delete('/api/kv/:key', async (req, res) => {
  try {
    await kvStore.remove(req.params.key)
    res.json({ ok: true })
  } catch (error) {
    console.error('[api] 存档删除失败:', error.message)
    res.status(500).json({ ok: false, error: '存档删除失败' })
  }
})

/* ===== AI 接口配置 ===== */

app.get('/api/llm/config', (req, res) => {
  res.json({ ok: true, ...listConfig() })
})

app.post('/api/llm/profiles', (req, res) => {
  const result = createProfile(req.body || {})
  if (!result.ok) return res.status(400).json(result)
  res.json({ ok: true, ...result, ...listConfig() })
})

app.put('/api/llm/profiles/:id', (req, res) => {
  const result = updateProfile(req.params.id, req.body || {})
  if (!result.ok) return res.status(400).json(result)
  res.json({ ok: true, ...result, ...listConfig() })
})

app.delete('/api/llm/profiles/:id', (req, res) => {
  const result = removeProfile(req.params.id)
  if (!result.ok) return res.status(400).json(result)
  res.json({ ok: true, ...result, ...listConfig() })
})

app.post('/api/llm/active', (req, res) => {
  const result = setActive(String(req.body?.id || ''))
  if (!result.ok) return res.status(400).json(result)
  res.json({ ok: true, ...result, ...listConfig() })
})

/**
 * 测试连接。
 * - { profileId }：测试已保存的配置
 * - { apiBase, model, apiKey, extraParams, id }：测试表单里尚未保存的内容；
 *   若没传 apiKey 但传了 id，则沿用已保存的密钥。
 */
app.post('/api/llm/test', async (req, res) => {
  const body = req.body || {}
  let profile = null

  if (body.apiBase || body.model) {
    const stored = body.id ? getProfile(String(body.id)) : null
    profile = {
      id: 'draft',
      name: String(body.name || stored?.name || '未保存配置'),
      apiBase: String(body.apiBase || stored?.apiBase || ''),
      model: String(body.model || stored?.model || ''),
      apiKey: String(body.apiKey || stored?.apiKey || ''),
      extraParams: body.extraParams !== undefined ? String(body.extraParams || '') : (stored?.extraParams || ''),
    }
    if (!profile.apiKey) {
      return res.json({ success: false, error: '请填写 API Key（编辑已保存配置时可留空）', data: null })
    }
    if (!profile.apiBase || !profile.model) {
      return res.json({ success: false, error: '请填写接口地址与模型名', data: null })
    }
  } else {
    profile = getProfile(String(body.profileId || ''))
    if (!profile) {
      return res.json({ success: false, error: '没有可测试的配置', data: null })
    }
  }

  const result = await testCompletion({ profile })
  res.json(result)
})

/* ===== LLM 代理 ===== */

app.post('/api/chat', async (req, res) => {
  const started = Date.now()
  const { systemPrompt, userPrompt, temperature, maxTokens, timeout, label } = req.body || {}

  if (!userPrompt) {
    return res.status(400).json({ success: false, error: '缺少 userPrompt', data: null })
  }

  const result = await chatCompletion({
    systemPrompt,
    userPrompt,
    temperature: typeof temperature === 'number' ? temperature : 0.8,
    maxTokens: Number(maxTokens) || 2000,
    timeout: Number(timeout) || 120000,
  })

  const info = llmStatus()
  console.log(
    `[llm] ${label || 'LLM'} ${result.success ? 'ok' : 'fail'} ${Date.now() - started}ms`
    + (info.configured ? ` :: ${info.model}` : ' :: 未配置')
    + (result.success ? '' : ` :: ${result.error}`),
  )

  res.json(result)
})

/* ===== 静态资源 ===== */

if (existsSync(DIST)) {
  app.use(express.static(DIST, {
    index: false,
    setHeaders(res, path) {
      if (path.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache')
      } else if (/\/assets\//.test(path)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      }
    },
  }))

  // SPA 兜底（不拦截 /api）
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(join(DIST, 'index.html'))
  })
} else {
  app.get('/', (req, res) => {
    res.type('text/plain').send('尚未构建前端：请先执行 npm run build')
  })
}

app.listen(PORT, '0.0.0.0', () => {
  const info = llmStatus()
  console.log(`女帝王朝 · 服务已启动 http://0.0.0.0:${PORT}`)
  console.log(`  存档目录: ${storePath}`)
  console.log(`  AI 配置: ${listConfig().storagePath}`)
  console.log(`  AI 接口: ${info.configured ? `${info.name} · ${info.model} @ ${info.endpoint}` : '未配置（可在网页「设置 · AI 接口」中添加）'}`)
})
