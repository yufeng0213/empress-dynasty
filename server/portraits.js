/**
 * 立绘库：图片落在 DATA_DIR/portraits，索引是同目录的 index.json。
 *
 * 前端会把整张拼图切成单张，再以 data URL 上传；
 * 这样服务端不需要任何图像处理依赖，也能兼容用户自己做的资源包。
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = resolve(process.env.DATA_DIR || join(ROOT, 'data'))
const PORTRAIT_DIR = join(DATA_DIR, 'portraits')
const INDEX_PATH = join(PORTRAIT_DIR, 'index.json')

const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const MAX_BATCH = 20
const GENDERS = new Set(['male', 'female', 'all'])

const ensureDir = () => {
  if (!existsSync(PORTRAIT_DIR)) mkdirSync(PORTRAIT_DIR, { recursive: true })
}

const cleanGender = (value) => (GENDERS.has(value) ? value : 'male')

const readIndex = () => {
  ensureDir()
  if (!existsSync(INDEX_PATH)) return { version: 1, portraits: [] }
  try {
    const data = JSON.parse(readFileSync(INDEX_PATH, 'utf8'))
    return {
      version: 1,
      portraits: Array.isArray(data?.portraits)
        ? data.portraits.filter((item) => item?.id && item?.file)
        : [],
    }
  } catch (error) {
    console.warn('[portraits] 索引损坏，按空库处理：', error.message)
    return { version: 1, portraits: [] }
  }
}

const writeIndex = (data) => {
  ensureDir()
  const tmp = `${INDEX_PATH}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, INDEX_PATH)
}

const normalize = (item, index) => ({
  id: String(item.id),
  name: String(item.name || `立绘 ${index + 1}`),
  gender: cleanGender(item.gender),
  width: Number(item.width) || 0,
  height: Number(item.height) || 0,
  createdAt: Number(item.createdAt) || 0,
})

export const listPortraits = () => readIndex().portraits.map(normalize)

export const findPortrait = (id) => {
  if (!id) return null
  const index = readIndex()
  const found = index.portraits.find((item) => item.id === String(id))
  return found ? { ...found } : null
}

export const portraitPath = (item) => join(PORTRAIT_DIR, String(item.file))

export const portraitsPath = () => INDEX_PATH

const decodeDataUrl = (value) => {
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,([a-z0-9+/=\s]+)$/i.exec(String(value || ''))
  if (!match) throw new Error('只支持 PNG / JPEG / WebP')
  const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase()
  const base64 = match[2].replace(/\s+/g, '')
  const buffer = Buffer.from(base64, 'base64')
  if (!buffer.length) throw new Error('图片内容为空')
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('单张图片超过 6MB')
  return { buffer, ext }
}

const saveOne = (input, state) => {
  const { buffer, ext } = decodeDataUrl(input?.dataUrl)
  const id = `pt_${randomBytes(6).toString('hex')}`
  const file = `${id}.${ext}`
  writeFileSync(join(PORTRAIT_DIR, file), buffer)
  const entry = {
    id,
    file,
    name: String(input.name || `立绘 ${state.portraits.length + 1}`).slice(0, 40),
    gender: cleanGender(input.gender),
    width: Math.max(0, Math.round(Number(input.width) || 0)),
    height: Math.max(0, Math.round(Number(input.height) || 0)),
    createdAt: Date.now(),
  }
  state.portraits.push(entry)
  return entry
}

/**
 * 批量添加。失败单张不会影响其他图片。
 * @returns {{ ok: boolean, portraits: object[], errors: string[] }}
 */
export const addPortraits = (items) => {
  ensureDir()
  const state = readIndex()
  const portraits = []
  const errors = []

  for (const item of (Array.isArray(items) ? items : []).slice(0, MAX_BATCH)) {
    try {
      portraits.push(saveOne(item, state))
    } catch (error) {
      errors.push(error.message || '导入失败')
    }
  }

  if (portraits.length > 0) writeIndex(state)
  return {
    ok: portraits.length > 0,
    portraits: portraits.map(normalize),
    errors,
  }
}

export const updatePortrait = (id, patch = {}) => {
  const state = readIndex()
  const target = state.portraits.find((item) => item.id === String(id))
  if (!target) return { ok: false, error: '立绘不存在' }

  if (patch.name !== undefined) {
    const name = String(patch.name).trim().slice(0, 40)
    if (!name) return { ok: false, error: '名称不能为空' }
    target.name = name
  }
  if (patch.gender !== undefined) target.gender = cleanGender(patch.gender)

  writeIndex(state)
  return { ok: true, portrait: normalize(target, 0) }
}

export const removePortrait = (id) => {
  const state = readIndex()
  const index = state.portraits.findIndex((item) => item.id === String(id))
  if (index < 0) return { ok: false, error: '立绘不存在' }

  const [removed] = state.portraits.splice(index, 1)
  try {
    unlinkSync(join(PORTRAIT_DIR, String(removed.file)))
  } catch (error) {
    if (error.code !== 'ENOENT') {
      state.portraits.splice(index, 0, removed)
      return { ok: false, error: '删除文件失败' }
    }
  }
  writeIndex(state)
  return { ok: true, id: String(id) }
}
