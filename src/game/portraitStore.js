/**
 * 立绘库与「人物 → 立绘」分配关系。
 *
 * - 图片本身在服务器 data/portraits
 * - 分配关系按存档（run.id）存进 KV，换设备也能看到
 * - 没分配的人物继续走旧的 avatarId / 姓氏首字兜底
 */

import { reactive } from 'vue'
import { kvStorage } from '../storage/kv.js'
import { portraitApi, portraitUrl } from './portraits.js'

const ASSIGN_KEY = 'portrait_assignments'

export const portraitState = reactive({
  loaded: false,
  loading: false,
  error: '',
  portraits: [],
  assignments: {},
})

let loadingPromise = null

const normalizeAssignments = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result = {}
  for (const [runId, map] of Object.entries(value)) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) continue
    const entries = Object.entries(map).filter(([, portraitId]) => typeof portraitId === 'string' && portraitId)
    if (entries.length) result[runId] = Object.fromEntries(entries)
  }
  return result
}

export const loadPortraitLibrary = async (force = false) => {
  if (loadingPromise && !force) return loadingPromise
  if (portraitState.loaded && !force) return portraitState

  portraitState.loading = true
  portraitState.error = ''

  loadingPromise = (async () => {
    try {
      const [portraits, assignments] = await Promise.all([
        portraitApi.list(),
        kvStorage.get(ASSIGN_KEY),
      ])
      portraitState.portraits = portraits
      portraitState.assignments = normalizeAssignments(assignments)
      portraitState.loaded = true
      return portraitState
    } catch (error) {
      portraitState.error = error?.message || '读取立绘库失败'
      throw error
    } finally {
      portraitState.loading = false
      loadingPromise = null
    }
  })()

  return loadingPromise
}

const persistAssignments = async () => {
  await kvStorage.set(ASSIGN_KEY, portraitState.assignments)
}

export const assignmentsForRun = (runId) => (
  runId ? portraitState.assignments[runId] || {} : {}
)

export const portraitFor = (runId, person) => {
  if (!runId || !person?.id) return ''
  const id = portraitState.assignments[runId]?.[person.id]
  return id ? portraitUrl(id) : ''
}

const hashString = (value) => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * 没手动分配时，用人物 id 稳定地预览一张同性立绘。
 * 这样导入资源包后，全城人物立刻有脸；手动分配仍然优先。
 */
export const displayPortraitFor = (runId, person) => {
  const assigned = portraitFor(runId, person)
  if (assigned) return assigned
  if (!person?.id || !portraitState.portraits.length) return ''

  const gender = person.gender === '女' ? 'female' : 'male'
  const matching = portraitState.portraits
    .filter((item) => item.gender === 'all' || item.gender === gender)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
  if (!matching.length) return ''

  const used = new Set(Object.values(assignmentsForRun(runId)))
  const free = matching.filter((item) => !used.has(item.id))
  const pool = free.length ? free : matching
  const index = hashString(String(person.id)) % pool.length
  return portraitUrl(pool[index].id)
}

export const portraitIdFor = (runId, characterId) => (
  portraitState.assignments[runId]?.[characterId] || ''
)

export const assignedCharacterId = (run, portraitId) => {
  if (!run || !portraitId) return ''
  const map = assignmentsForRun(run.id)
  return Object.keys(map).find((characterId) => map[characterId] === portraitId) || ''
}

export const assignPortrait = async (runId, characterId, portraitId) => {
  if (!runId || !characterId) throw new Error('缺少存档或人物')
  const current = { ...(portraitState.assignments[runId] || {}) }
  if (portraitId) current[characterId] = portraitId
  else delete current[characterId]

  portraitState.assignments = {
    ...portraitState.assignments,
    [runId]: current,
  }
  await persistAssignments()
}

const ROLE_PRIORITY = {
  ruler: 0,
  prince: 1,
  princess: 1,
  child: 1,
  consort: 2,
  minister: 3,
  clan: 4,
  servant: 5,
}

/**
 * 把还没分配的立绘按性别补给人物的未分配槽位。
 * 只补空缺，不覆盖手动选择。
 */
export const autoAssignPortraits = async (run) => {
  if (!run?.id || !Array.isArray(run.characters)) return 0

  const map = { ...(portraitState.assignments[run.id] || {}) }
  const used = new Set(Object.values(map))
  const free = portraitState.portraits.filter((portrait) => !used.has(portrait.id))
  if (!free.length) return 0

  const roster = [
    ...(run.ruler?.id ? [run.ruler] : []),
    ...run.characters.filter((person) => person?.id && person.id !== run.ruler?.id),
  ]
  const characters = roster
    .filter((person) => person?.id && person.alive !== false && !map[person.id])
    .sort((a, b) => {
      const rank = (person) => (
        person.id === run.ruler?.id ? 0 : (ROLE_PRIORITY[person.role] ?? 9)
      )
      const roleDiff = rank(a) - rank(b)
      if (roleDiff) return roleDiff
      return (Number(b.age) || 0) - (Number(a.age) || 0)
    })

  let count = 0
  for (const person of characters) {
    const gender = person.gender === '女' ? 'female' : 'male'
    const index = free.findIndex((portrait) => portrait.gender === 'all' || portrait.gender === gender)
    if (index < 0) continue
    const [portrait] = free.splice(index, 1)
    map[person.id] = portrait.id
    count += 1
  }

  if (count > 0) {
    portraitState.assignments = { ...portraitState.assignments, [run.id]: map }
    await persistAssignments()
  }
  return count
}

export const clearRunAssignments = async (runId) => {
  if (!runId || !portraitState.assignments[runId]) return
  const next = { ...portraitState.assignments }
  delete next[runId]
  portraitState.assignments = next
  await persistAssignments()
}

export const uploadPortraitSlices = async (items, onProgress) => {
  const batchSize = 6
  const added = []
  const errors = []

  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize)
    const result = await portraitApi.add(batch)
    added.push(...result.portraits)
    errors.push(...result.errors)
    onProgress?.(Math.min(index + batchSize, items.length), items.length)
  }

  if (added.length > 0) {
    portraitState.portraits = [...portraitState.portraits, ...added]
    portraitState.loaded = true
  }
  return { added, errors }
}

export const updatePortraitMeta = async (id, patch) => {
  const data = await portraitApi.update(id, patch)
  const index = portraitState.portraits.findIndex((item) => item.id === id)
  if (index >= 0 && data.portrait) {
    portraitState.portraits[index] = { ...portraitState.portraits[index], ...data.portrait }
  }
  return data.portrait
}

export const removePortrait = async (id) => {
  await portraitApi.remove(id)

  portraitState.portraits = portraitState.portraits.filter((item) => item.id !== id)

  let changed = false
  const next = {}
  for (const [runId, map] of Object.entries(portraitState.assignments)) {
    const entries = Object.entries(map).filter(([, portraitId]) => portraitId !== id)
    if (entries.length !== Object.keys(map).length) changed = true
    if (entries.length) next[runId] = Object.fromEntries(entries)
  }
  if (changed) {
    portraitState.assignments = next
    await persistAssignments()
  }
}
