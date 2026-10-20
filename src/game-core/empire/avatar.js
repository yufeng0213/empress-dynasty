/**
 * 内置随机头像：只存编号，UI 按性别拼路径。
 * 没有对应性别的图池时编号为 0，UI 用姓氏字兜底。
 */

import { AVATAR_COUNTS } from './constants.js'
import { createRng, randInt } from './random.js'

const hashId = (id) => {
  let hash = 0
  for (const char of String(id || '')) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }
  return hash
}

const countForGender = (gender) => (
  Number(AVATAR_COUNTS[gender === '男' ? 'male' : 'female']) || 0
)

const assignAvatar = (state, character) => {
  const count = countForGender(character.gender)
  if (count <= 0) return 0
  const rng = createRng((Number(state.seed) || 1) + hashId(character.id))
  return randInt(rng, 1, count)
}

/**
 * 给老存档或新生成的人物补齐头像编号
 */
export const ensureAvatarFields = (state) => {
  if (!state || !Array.isArray(state.characters)) return state
  for (const character of state.characters) {
    const count = countForGender(character.gender)
    if (count <= 0) {
      if (!Number.isInteger(character.avatarId)) character.avatarId = 0
      continue
    }
    if (!Number.isInteger(character.avatarId) || character.avatarId <= 0) {
      character.avatarId = assignAvatar(state, character)
    } else if (character.avatarId > count) {
      character.avatarId = ((character.avatarId - 1) % count) + 1
    }
  }
  return state
}
