/**
 * 立绘库接口客户端。
 * 图片由服务端保存在 data/portraits，前端只拿 URL 和元数据。
 */

const BASE_URL = import.meta.env.BASE_URL || '/'
const API_BASE = `${BASE_URL}api/portraits`.replace(/\/{2,}/g, '/')

const request = async (path = '', options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `立绘请求失败 ${response.status}`)
  }
  return data
}

export const portraitUrl = (id) => (
  id ? `${API_BASE}/${encodeURIComponent(id)}/file` : ''
)

export const portraitApi = {
  async list() {
    const data = await request()
    return Array.isArray(data.portraits) ? data.portraits : []
  },

  async add(items) {
    const data = await request('', {
      method: 'POST',
      body: JSON.stringify({ items }),
    })
    return { portraits: data.portraits || [], errors: data.errors || [] }
  },

  async update(id, patch) {
    return await request(`/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    })
  },

  async remove(id) {
    return await request(`/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
}
