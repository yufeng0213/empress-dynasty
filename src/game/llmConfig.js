/**
 * AI 接口配置客户端。
 * 配置与密钥都保存在服务端，浏览器只拿到掩码后的列表。
 */

const BASE_URL = import.meta.env.BASE_URL || '/'
const API = `${BASE_URL}api/llm`.replace(/\/{2,}/g, '/')

const request = async (path, options = {}) => {
  const response = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const payload = await response.json().catch(() => null)
  if (!payload) {
    throw new Error(`请求失败（${response.status}）`)
  }
  return payload
}

export const llmConfigApi = {
  async load() {
    const data = await request('/config')
    if (!data.ok) throw new Error(data.error || '读取配置失败')
    return data
  },

  async create(payload) {
    const data = await request('/profiles', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (!data.ok) throw new Error(data.error || '保存失败')
    return data
  },

  async update(id, payload) {
    const data = await request(`/profiles/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
    if (!data.ok) throw new Error(data.error || '保存失败')
    return data
  },

  async remove(id) {
    const data = await request(`/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!data.ok) throw new Error(data.error || '删除失败')
    return data
  },

  async activate(id) {
    const data = await request('/active', {
      method: 'POST',
      body: JSON.stringify({ id }),
    })
    if (!data.ok) throw new Error(data.error || '切换失败')
    return data
  },

  async test(payload) {
    return request('/test', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
}

export default llmConfigApi
