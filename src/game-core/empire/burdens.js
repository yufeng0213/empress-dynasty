/**
 * CK3 式负面状态：压力、君主特质、领地 debuff。
 *
 * 这些状态不直接生成事件，只在每个月咬一次人：
 * 扣健康、扣钱、扣合法性、推高东宫/后宫，最后可能把人咬死。
 */

import { clamp } from './random.js'

export const BURDEN_TRAITS = {
  paranoid: {
    label: '多疑',
    desc: '每年压力 +2，人物好感缓慢下降。',
  },
  sickly: {
    label: '病弱',
    desc: '每年健康 -2，疾病与难产风险上升。',
  },
  cruel: {
    label: '残暴',
    desc: '暴政 +2/年，恐惧 +2/年。朝臣顺服，但没人敢说真话。',
  },
  drunkard: {
    label: '酗酒',
    desc: '压力 -3/年，健康 -1/年，威望 -1/年。',
  },
  ambitious: {
    label: '野心',
    desc: '压力 +1/年，东宫势力 +2/年。',
  },
  generous: {
    label: '慷慨',
    desc: '国库 -80/年，民心 +1/年。',
  },
}

export const REALM_DEBUFFS = {
  empty_treasury: {
    label: '国库空虚',
    desc: '每年国库 -100，军力 -1。',
  },
  faction: {
    label: '党争',
    desc: '每年威望 -1，朝局持续内耗。',
  },
  unpaid_army: {
    label: '边军欠饷',
    desc: '每年军力 -2，兵变风险上升。',
  },
  plague: {
    label: '疫病',
    desc: '每年民心 -2，健康 -1。',
  },
  harem_poison: {
    label: '后宫毒害',
    desc: '每年健康 -1，后宫张力 +2。',
  },
  heir_threat: {
    label: '东宫逼宫',
    desc: '每年威望 -2，东宫势力 +2。',
  },
  debt: {
    label: '债台高筑',
    desc: '每年国库 -200，威望 -1。',
  },
}

const clampStat = (value) => clamp(Number(value) || 0, 0, 100)

export const ensureBurdenFields = (state) => {
  if (!state) return state
  if (!state.ruler || typeof state.ruler !== 'object') state.ruler = {}
  if (typeof state.ruler.stress !== 'number') state.ruler.stress = 24
  state.ruler.stress = clamp(state.ruler.stress, 0, 100)
  if (typeof state.ruler.tyranny !== 'number') state.ruler.tyranny = 0
  state.ruler.tyranny = clampStat(state.ruler.tyranny)
  if (typeof state.ruler.dread !== 'number') state.ruler.dread = 0
  state.ruler.dread = clampStat(state.ruler.dread)
  if (!Array.isArray(state.ruler.traits)) state.ruler.traits = []
  if (!Array.isArray(state.realmDebuffs)) state.realmDebuffs = []
  if (!Array.isArray(state.burdenLog)) state.burdenLog = []
  return state
}

export const addBurdenTrait = (state, traitId) => {
  ensureBurdenFields(state)
  if (!BURDEN_TRAITS[traitId] || state.ruler.traits.includes(traitId)) return false
  state.ruler.traits.push(traitId)
  state.burdenLog.unshift({
    id: `trait_${traitId}_${state.calendar?.year || 1}_${state.calendar?.month || 1}`,
    text: `获得特质：${BURDEN_TRAITS[traitId].label}`,
  })
  state.burdenLog = state.burdenLog.slice(0, 40)
  return true
}

export const addRealmDebuff = (state, debuffId) => {
  ensureBurdenFields(state)
  if (!REALM_DEBUFFS[debuffId] || state.realmDebuffs.includes(debuffId)) return false
  state.realmDebuffs.push(debuffId)
  state.burdenLog.unshift({
    id: `debuff_${debuffId}_${state.calendar?.year || 1}_${state.calendar?.month || 1}`,
    text: `获得负面状态：${REALM_DEBUFFS[debuffId].label}`,
  })
  state.burdenLog = state.burdenLog.slice(0, 40)
  return true
}

export const addStress = (state, amount) => {
  ensureBurdenFields(state)
  state.ruler.stress = clamp((Number(state.ruler.stress) || 0) + (Number(amount) || 0), 0, 100)
}

/**
 * 给事件/选择用的统一效果入口。
 * 支持 stress / trait / debuff / tyranny / dread。
 */
export const applyBurdenEffects = (state, effects = {}) => {
  ensureBurdenFields(state)
  if (effects.stress) addStress(state, effects.stress)
  if (effects.trait) addBurdenTrait(state, effects.trait)
  if (effects.debuff) addRealmDebuff(state, effects.debuff)
  if (effects.tyranny) state.ruler.tyranny = clamp((Number(state.ruler.tyranny) || 0) + (Number(effects.tyranny) || 0), 0, 100)
  if (effects.dread) state.ruler.dread = clamp((Number(state.ruler.dread) || 0) + (Number(effects.dread) || 0), 0, 100)
}

const addResource = (state, key, value) => {
  if (!value) return
  if (key === 'treasury') {
    state.resources.treasury = Math.max(0, Math.round((Number(state.resources.treasury) || 0) + value))
    return
  }
  if (['popularity', 'prestige', 'intelligence', 'military'].includes(key)) {
    state.resources[key] = clamp((Number(state.resources[key]) || 0) + value, 0, 100)
  }
}

/**
 * 每月咬一次。必须在 advanceMonth 的死亡判定之前调用。
 */
export const tickBurdens = (state) => {
  ensureBurdenFields(state)
  let healthDelta = 0
  let stressDelta = 0
  const lines = []
  const isYearStart = (Number(state.calendar?.month) || 1) === 1

  // 当家本身就有压力：每三个月涨一点，民怨低时更快
  if ((Number(state.stats?.months) || 0) % 3 === 0) stressDelta += 1
  if ((Number(state.resources?.popularity) || 0) < 35) stressDelta += 1

  // 特质和领地 debuff 按年结算，避免一个月把人咬死
  if (isYearStart) {
    for (const traitId of state.ruler.traits) {
      if (traitId === 'paranoid') stressDelta += 2
      if (traitId === 'sickly') healthDelta -= 2
      if (traitId === 'cruel') {
        state.ruler.tyranny = clamp((Number(state.ruler.tyranny) || 0) + 2, 0, 100)
        state.ruler.dread = clamp((Number(state.ruler.dread) || 0) + 2, 0, 100)
      }
      if (traitId === 'drunkard') {
        stressDelta -= 3
        healthDelta -= 1
        addResource(state, 'prestige', -1)
      }
      if (traitId === 'ambitious') {
        stressDelta += 1
        if (state.heirFaction) {
          state.heirFaction.otherInfluence = clamp((Number(state.heirFaction.otherInfluence) || 0) + 2, 0, 100)
        }
      }
      if (traitId === 'generous') {
        addResource(state, 'treasury', -80)
        addResource(state, 'popularity', 1)
      }
    }

    for (const debuffId of state.realmDebuffs) {
      if (debuffId === 'empty_treasury') {
        addResource(state, 'treasury', -100)
        addResource(state, 'military', -1)
      }
      if (debuffId === 'faction') addResource(state, 'prestige', -1)
      if (debuffId === 'unpaid_army') {
        addResource(state, 'military', -2)
        if (Math.random() < 0.08) {
          addResource(state, 'prestige', -3)
          lines.push('边军又在闹饷。这次没有折子，只有逃兵。')
        }
      }
      if (debuffId === 'plague') {
        addResource(state, 'popularity', -2)
        healthDelta -= 1
      }
      if (debuffId === 'harem_poison') {
        healthDelta -= 1
        state.haremTensionBoost = clamp((Number(state.haremTensionBoost) || 0) + 2, -30, 100)
      }
      if (debuffId === 'heir_threat') {
        addResource(state, 'prestige', -2)
        if (state.heirFaction) {
          state.heirFaction.otherInfluence = clamp((Number(state.heirFaction.otherInfluence) || 0) + 2, 0, 100)
        }
      }
      if (debuffId === 'debt') {
        addResource(state, 'treasury', -200)
        addResource(state, 'prestige', -1)
      }
    }
  }

  state.ruler.health = clamp((Number(state.ruler.health) || 0) + healthDelta, 0, 100)
  state.ruler.stress = clamp((Number(state.ruler.stress) || 0) + stressDelta, 0, 100)

  if (state.ruler.stress >= 100) {
    state.ruler.stress = 100
    state.ruler.health = 0
    lines.push('压力压垮了最后一根神经。太医说是中风。')
  }
  if (isYearStart && state.ruler.tyranny >= 60 && Math.random() < 0.08) {
    state.ruler.health = 0
    lines.push('夜里禁军没有换防。刺客进殿时，宫人没有喊。')
  }
  if (state.ruler.health <= 0) {
    state.ruler.health = 0
    lines.push('病势已经压不住了。')
  }

  if (state.burdenLog.length > 40) state.burdenLog = state.burdenLog.slice(0, 40)
  if (lines.length > 0) {
    state.burdenLog.unshift({
      id: `burden_tick_${state.calendar?.year || 1}_${state.calendar?.month || 1}`,
      text: lines.join(' '),
    })
    state.burdenLog = state.burdenLog.slice(0, 40)
  }
  return state
}

export const getBurdenSummary = (state) => {
  ensureBurdenFields(state)
  return {
    stress: Number(state.ruler.stress) || 0,
    health: Number(state.ruler.health) || 0,
    tyranny: Number(state.ruler.tyranny) || 0,
    dread: Number(state.ruler.dread) || 0,
    traits: (state.ruler.traits || []).map((id) => ({ id, ...BURDEN_TRAITS[id] })).filter((item) => item.label),
    debuffs: (state.realmDebuffs || []).map((id) => ({ id, ...REALM_DEBUFFS[id] })).filter((item) => item.label),
  }
}
