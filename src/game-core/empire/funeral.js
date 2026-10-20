/**
 * 丧仪与追封
 *
 * 死者不再是“从名单里消失”，而是可以治丧、追封：
 * - 提高民心与威望
 * - 安抚同派系/同身份的人
 * - 侍宠的子女获得继承合法性加成
 */

import { clamp, createRng, pick } from './random.js'
import { recordActivity } from './activity.js'

const getMonthIndex = (state) => (
  ((Number(state?.calendar?.year) || 1) - 1) * 12 + (Number(state?.calendar?.month) || 1)
)

const clone = (value) => JSON.parse(JSON.stringify(value))

export const FUNERAL_LEVELS = {
  simple: {
    id: 'simple',
    label: '薄葬',
    cost: 100,
    popularity: 1,
    prestige: 1,
    loyalty: 3,
    legitimacy: 2,
    desc: '依礼下葬，不惊动朝野',
  },
  grand: {
    id: 'grand',
    label: '厚葬',
    cost: 500,
    popularity: 3,
    prestige: 3,
    loyalty: 6,
    legitimacy: 5,
    desc: '辍朝一日，百官素服',
  },
  royal: {
    id: 'royal',
    label: '国葬',
    cost: 1500,
    popularity: 6,
    prestige: 6,
    loyalty: 10,
    legitimacy: 8,
    desc: '举国举哀，史官立传',
  },
}

const TITLES = {
  minister: ['文忠', '武烈', '文正', '忠肃', '恭毅'],
  clan: ['恭靖', '悼安', '怀顺'],
  consort: ['恭惠', '昭顺', '静淑', '温穆', '端和'],
  servant: ['忠勤', '恭谨', '勤恪'],
  child: ['悼怀', '殇敏', '怀愍'],
}

export const holdFuneral = (state, characterId, levelId) => {
  if (!state || state.status !== 'playing') {
    return { success: false, state, message: '当前无法治丧' }
  }
  const level = FUNERAL_LEVELS[levelId]
  if (!level) return { success: false, state, message: '未知的丧仪规格' }

  const character = (state.characters || []).find((item) => item.id === characterId)
  if (!character || character.alive !== false) {
    return { success: false, state, message: '此人还在世' }
  }
  if (character.funeralLevel) {
    return { success: false, state, message: '已经治过丧了' }
  }
  if ((Number(state.resources?.treasury) || 0) < level.cost) {
    return { success: false, state, message: `国库不足 ${level.cost} 贯` }
  }

  const next = clone(state)
  const target = next.characters.find((item) => item.id === characterId)
  const rng = createRng(Number(next.seed) + getMonthIndex(next) + characterId.length)

  target.funeralLevel = level.id
  target.funeralMonth = getMonthIndex(next)
  target.posthumousTitle = pick(rng, TITLES[target.role] || ['恭惠'])

  next.resources.treasury = Math.round((Number(next.resources.treasury) || 0) - level.cost)
  next.resources.popularity = clamp((Number(next.resources.popularity) || 0) + level.popularity, 0, 100)
  next.resources.prestige = clamp((Number(next.resources.prestige) || 0) + level.prestige, 0, 100)

  // 同派系的人会记这份情
  if (target.faction) {
    for (const item of next.characters || []) {
      if (item.alive !== false && item.faction === target.faction) {
        item.loyalty = clamp((Number(item.loyalty) || 0) + level.loyalty, 0, 100)
      }
    }
  }

  // 同为朝臣 / 同为侍宠，也会有兔死狐悲之感
  if (target.role === 'minister' || target.role === 'clan' || target.role === 'consort') {
    for (const item of next.characters || []) {
      if (item.alive !== false && item.role === target.role && item.id !== target.id) {
        item.loyalty = clamp((Number(item.loyalty) || 0) + Math.round(level.loyalty * 0.4), 0, 100)
      }
    }
  }

  // 侍宠的子女获得继承合法性
  if (target.role === 'consort') {
    for (const item of next.characters || []) {
      if (item.alive !== false && Array.isArray(item.parentIds) && item.parentIds.includes(target.id)) {
        item.legitimacyBonus = (Number(item.legitimacyBonus) || 0) + level.legitimacy
      }
    }
  }

  next.stats.funerals = (next.stats.funerals || 0) + 1
  next.log.push({
    id: `log_${next.calendar.year}_${next.calendar.month}_funeral_${next.log.length + 1}`,
    year: next.calendar.year,
    month: next.calendar.month,
    type: 'funeral',
    title: `${target.name}${level.label} · 追封${target.posthumousTitle}`,
    desc: `${level.desc}。国库 -${level.cost}，民心 +${level.popularity}，威望 +${level.prestige}。`,
  })
  if (next.log.length > 500) next.log = next.log.slice(-500)
  recordActivity(next, `${level.label}${target.name}（-${level.cost}贯），追封${target.posthumousTitle}`, 'funeral')
  next.updatedAt = Date.now()

  return {
    success: true,
    state: next,
    message: `${target.name}已${level.label}，追封${target.posthumousTitle}`,
  }
}
