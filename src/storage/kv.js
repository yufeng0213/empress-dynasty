/**
 * 键值存储：全部走服务端 /api/kv，换设备、清缓存都不会丢档。
 * 接口与原 Android 版 kvStorage 完全一致（get / set / remove / keys），
 * 因此业务层不需要任何改动。
 */

// 用相对的 API 路径：挂在域名根目录时是 /api/kv，
// 挂在 /empress-dynasty/ 这类子路径时自动变成 ./api/kv。
const BASE_URL = import.meta.env.BASE_URL || '/'
const API_BASE = `${BASE_URL}api/kv`.replace(/\/{2,}/g, '/')
const PREFIX = 'avg_llm_'

// 读取缓存，避免同一回合内重复请求
const cache = new Map()

const request = async (url, options = {}, retry = true) => {
  try {
    return await fetch(url, options)
  } catch (error) {
    if (!retry) throw error
    // 网络抖动重试一次
    await new Promise((resolve) => setTimeout(resolve, 300))
    return await fetch(url, options)
  }
}

export const kvStorage = {
  async get(key) {
    if (cache.has(key)) return cache.get(key)

    try {
      const response = await request(`${API_BASE}/${encodeURIComponent(PREFIX + key)}`)
      if (!response.ok) return null
      const data = await response.json()
      const value = data?.value ?? null
      cache.set(key, value)
      return value
    } catch (error) {
      console.warn('[kvStorage] get failed:', error?.message || error)
      return null
    }
  },

  async set(key, value) {
    cache.set(key, value)

    const response = await request(`${API_BASE}/${encodeURIComponent(PREFIX + key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    })

    if (!response.ok) {
      cache.delete(key)
      const detail = await response.text().catch(() => '')
      throw new Error(`存档写入失败 ${response.status} ${detail}`)
    }
  },

  async remove(key) {
    cache.delete(key)
    const response = await request(`${API_BASE}/${encodeURIComponent(PREFIX + key)}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      throw new Error(`删除失败 ${response.status}`)
    }
  },

  async keys() {
    const response = await request(API_BASE)
    if (!response.ok) return []
    const data = await response.json()
    const keys = Array.isArray(data?.keys) ? data.keys : []
    return keys
      .filter((item) => item.startsWith(PREFIX))
      .map((item) => item.slice(PREFIX.length))
  },
}

export default { kvStorage }
