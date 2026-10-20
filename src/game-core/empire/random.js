/**
 * 确定性随机数（mulberry32）
 * 同一个 seed 必得同一批人物，便于复现与调试。
 */

export const createRng = (seed = Date.now()) => {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const randInt = (rng, min, max) => {
  const low = Math.ceil(Math.min(min, max))
  const high = Math.floor(Math.max(min, max))
  return low + Math.floor(rng() * (high - low + 1))
}

export const pick = (rng, list) => {
  if (!Array.isArray(list) || list.length === 0) return null
  return list[Math.floor(rng() * list.length)]
}

export const chance = (rng, probability) => rng() < probability

export const shuffle = (rng, list) => {
  const result = [...(Array.isArray(list) ? list : [])]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
