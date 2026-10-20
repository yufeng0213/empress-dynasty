/**
 * 女帝王朝 · 服务端
 * 一个进程同时负责：静态资源托管、LLM 代理、存档读写。
 */

import express from 'express'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chatCompletion, llmConfig } from './llm.js'
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
    llm: llmConfig(),
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

  console.log(
    `[llm] ${label || 'LLM'} ${result.success ? 'ok' : 'fail'} ${Date.now() - started}ms`
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
  const info = llmConfig()
  console.log(`女帝王朝 · 服务已启动 http://0.0.0.0:${PORT}`)
  console.log(`  存档目录: ${storePath}`)
  console.log(`  LLM: ${info.configured ? `${info.model} @ ${info.endpoint}` : '未配置（.env 缺少 LLM_API_KEY）'}`)
})
