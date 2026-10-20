/**
 * 存档存储：单文件 JSON + 原子写 + 串行队列。
 * 自己一个人玩，没必要上数据库；但必须保证进程崩溃不写坏文件。
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const DATA_DIR = resolve(process.env.DATA_DIR || 'data')
const STORE_FILE = join(DATA_DIR, 'kv.json')
const TEMP_FILE = `${STORE_FILE}.tmp`

let store = {}
let writeQueue = Promise.resolve()

const ensureDir = () => {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
}

const load = () => {
  ensureDir()
  if (!existsSync(STORE_FILE)) {
    store = {}
    return
  }
  try {
    const raw = readFileSync(STORE_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    store = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch (error) {
    // 文件损坏时保留备份，避免直接覆盖掉用户数据
    console.error('[store] 存档解析失败，已备份为 kv.corrupt.json:', error.message)
    try {
      renameSync(STORE_FILE, join(dirname(STORE_FILE), `kv.corrupt.${Date.now()}.json`))
    } catch {
      // 忽略
    }
    store = {}
  }
}

const flush = () => {
  const snapshot = JSON.stringify(store, null, 2)
  writeQueue = writeQueue.then(() => {
    ensureDir()
    writeFileSync(TEMP_FILE, snapshot, 'utf8')
    renameSync(TEMP_FILE, STORE_FILE)
  }).catch((error) => {
    console.error('[store] 写入失败:', error.message)
    throw error
  })
  return writeQueue
}

load()

export const kvStore = {
  get(key) {
    return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null
  },

  keys() {
    return Object.keys(store)
  },

  async set(key, value) {
    store[key] = value
    await flush()
  },

  async remove(key) {
    if (Object.prototype.hasOwnProperty.call(store, key)) {
      delete store[key]
      await flush()
    }
  },
}

export const storePath = STORE_FILE
