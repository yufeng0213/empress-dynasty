/**
 * 皇嗣成长、手足关系、东宫势力与议婚。
 *
 * 月度只做小的成长与关系漂移；大的手足/东宫事件按周期生成奏折。
 * 孩子不是独立小游戏：亲密度、声望、野心和婚姻都会进入继承与朝局。
 */

import { clamp, randInt } from './random.js'
import {
  averageAbility,
  generateChildName,
  getCharacterStat,
  getSurname,
  pickAvatarId,
  rollAbilityStats,
} from './characters.js'
import { recordActivity } from './activity.js'

const clone = (value) => JSON.parse(JSON.stringify(value))

export const CHILD_STAGES = [
  { id: 'infant', label: '幼年', min: 0, max: 4 },
  { id: 'enlighten', label: '启蒙', min: 5, max: 9 },
  { id: 'youth', label: '少年', min: 10, max: 13 },
  { id: 'coming', label: '及笄/及冠', min: 14, max: 17 },
  { id: 'adult', label: '成年', min: 18, max: 200 },
]

export const getChildStage = (age) => (
  CHILD_STAGES.find((stage) => age >= stage.min && age <= stage.max) || CHILD_STAGES[0]
)

const monthIndex = (state) => (
  ((Number(state?.calendar?.year) || 1) - 1) * 12 + (Number(state?.calendar?.month) || 1)
)

const log = (state, title, desc, type = 'child') => {
  if (!Array.isArray(state.log)) state.log = []
  state.log.unshift({
    id: `log_${state.calendar?.year || 1}_${state.calendar?.month || 1}_child_${state.log.length + 1}`,
    year: state.calendar?.year || 1,
    month: state.calendar?.month || 1,
    type,
    title,
    desc,
  })
  if (state.log.length > 500) state.log = state.log.slice(-500)
}

const childActor = (child) => ({
  id: child.id,
  name: child.name,
  office: child.office || '子嗣',
  role: 'child',
  label: '子嗣',
})

const aliveChildren = (state) => (state.characters || []).filter((item) => (
  item.role === 'child' && item.alive !== false
))

const supporterStatus = (item) => (
  item.rulerLoyalty < 40 && item.heirLoyalty > 70
    ? '只知东宫'
    : (item.heirLoyalty > item.rulerLoyalty + 20 ? '亲东宫' : '观望')
)

const makeSupporter = (state, heir, character, roleTag) => {
  if (!character) return null
  const rulerLoyalty = clamp(Math.round(Number(character.loyalty) || 55), 0, 100)
  const heirLoyalty = clamp(
    Math.round(48 + (Number(heir.ambition) || 0) / 4 + (Number(heir.intimacy) || 0) / 6 - rulerLoyalty / 10),
    20,
    98,
  )
  const impact = clamp(
    6 + Math.round((Number(character.ability) || 50) / 10)
      + (Number(character.rank) > 0 ? Math.max(0, 6 - Number(character.rank)) : 0),
    4,
    24,
  )
  return {
    id: `supporter_${heir.id}_${character.id}`,
    characterId: character.id,
    name: character.name,
    office: character.office || character.roleLabel || '',
    faction: character.faction || '',
    factionName: character.factionName || '',
    roleTag,
    rulerLoyalty,
    heirLoyalty,
    impact,
    status: supporterStatus({ rulerLoyalty, heirLoyalty }),
  }
}

const ensureHeirSupporters = (state) => {
  ensureChildFieldsBasic(state)
  const heir = (state.characters || []).find((item) => (
    item.id === state.designatedHeirId && item.role === 'child' && item.alive !== false
  ))
  if (!heir) {
    state.heirFaction.supporters = []
    state.heirFaction.influence = clamp(Number(state.heirFaction.otherInfluence) || 0, 0, 100)
    return []
  }

  const existing = (state.heirFaction.supporters || []).filter((item) => {
    const character = (state.characters || []).find((entry) => entry.id === item.characterId)
    return character && character.alive !== false
  })
  if (existing.length > 0) {
    for (const item of existing) {
      item.status = supporterStatus(item)
      item.rulerLoyalty = clamp(Math.round(Number(item.rulerLoyalty) || 0), 0, 100)
      item.heirLoyalty = clamp(Math.round(Number(item.heirLoyalty) || 0), 0, 100)
      item.impact = clamp(Math.round(Number(item.impact) || 0), 0, 30)
    }
    state.heirFaction.supporters = existing
    state.heirFaction.influence = clamp(
      (Number(state.heirFaction.otherInfluence) || 0)
        + existing.reduce((sum, item) => sum + item.impact, 0),
      0,
      100,
    )
    return existing
  }

  const pool = (state.characters || []).filter((item) => (
    item.alive !== false && ['minister', 'clan', 'servant'].includes(item.role)
  ))
  const used = new Set()
  const picks = []
  const take = (roleTag, sorter) => {
    const candidates = pool
      .filter((item) => !used.has(item.id))
      .sort(sorter)
    const picked = candidates[0]
    if (!picked) return
    used.add(picked.id)
    const supporter = makeSupporter(state, heir, picked, roleTag)
    if (supporter) picks.push(supporter)
  }

  take('太子太傅', (a, b) => (Number(b.civil) || 0) - (Number(a.civil) || 0))
  take('东宫武卫', (a, b) => (Number(b.military) || 0) - (Number(a.military) || 0))
  take('内廷耳目', (a, b) => (
    (a.role === 'servant' ? 1 : 0) - (b.role === 'servant' ? 1 : 0)
      || (Number(b.strategy) || 0) - (Number(a.strategy) || 0)
  ))

  state.heirFaction.supporters = picks
  const current = Number(state.heirFaction.influence) || 0
  const sum = picks.reduce((total, item) => total + item.impact, 0)
  state.heirFaction.otherInfluence = clamp(Math.max(0, current - sum), 0, 100)
  state.heirFaction.influence = clamp(state.heirFaction.otherInfluence + sum, 0, 100)
  return picks
}

const ensureChildFieldsBasic = (state) => {
  if (!state) return state
  if (!Array.isArray(state.characters)) state.characters = []
  if (!state.heirFaction || typeof state.heirFaction !== 'object') {
    state.heirFaction = { influence: 0, otherInfluence: 0, lastEventMonth: 0, supporters: [] }
  }
  if (typeof state.heirFaction.influence !== 'number') state.heirFaction.influence = 0
  if (typeof state.heirFaction.otherInfluence !== 'number') state.heirFaction.otherInfluence = 0
  if (typeof state.heirFaction.lastEventMonth !== 'number') state.heirFaction.lastEventMonth = 0
  if (!Array.isArray(state.heirFaction.supporters)) state.heirFaction.supporters = []
  if (!state.childMarriage || typeof state.childMarriage !== 'object') state.childMarriage = null
  return state
}

export const ensureChildFields = (state) => {
  ensureChildFieldsBasic(state)
  const children = aliveChildren(state)
  for (const child of children) {
    const stage = getChildStage(Number(child.age) || 0)
    child.stage = stage.id
    child.stageLabel = stage.label
    if (typeof child.intimacy !== 'number') child.intimacy = 60
    if (typeof child.reputation !== 'number') child.reputation = clamp(Number(child.ability) || 40, 0, 100)
    if (typeof child.lastVisitMonth !== 'number') child.lastVisitMonth = 0
    if (typeof child.educationFocus !== 'string') child.educationFocus = 'civil'
    if (typeof child.marriageStatus !== 'string') child.marriageStatus = 'single'
    if (typeof child.betrothedId !== 'string') child.betrothedId = ''
    if (typeof child.spouseId !== 'string') child.spouseId = ''
    if (typeof child.crushId !== 'string') child.crushId = ''
    if (!child.secretAffair || typeof child.secretAffair !== 'object') child.secretAffair = null
    if (child.secretAffair && typeof child.secretAffair.lastEventMonth !== 'number') {
      child.secretAffair.lastEventMonth = 0
    }
    if (!child.pregnancy || typeof child.pregnancy !== 'object') child.pregnancy = null
    if (typeof child.weddingScale !== 'string') child.weddingScale = ''
    if (!child.siblings || typeof child.siblings !== 'object') child.siblings = {}
    for (const other of children) {
      if (other.id === child.id) continue
      if (typeof child.siblings[other.id] !== 'number') child.siblings[other.id] = 0
    }
  }
  ensureHeirSupporters(state)
  return state
}

export const getHeirSupporters = (state) => {
  ensureChildFields(state)
  return (state?.heirFaction?.supporters || []).map((item) => ({ ...item }))
}

const recalcHeirInfluence = (state) => {
  state.heirFaction.influence = clamp(
    (Number(state.heirFaction.otherInfluence) || 0)
      + (state.heirFaction.supporters || []).reduce((sum, item) => sum + (Number(item.impact) || 0), 0),
    0,
    100,
  )
}

/**
 * 对东宫支持者本人下手：召见 / 让太子自选 / 裁抑
 */
export const interactHeirSupporter = (state, supporterId, action) => {
  if (!state || state.status !== 'playing') {
    return { success: false, state, message: '当前无法行动' }
  }
  ensureChildFields(state)
  const heir = (state.characters || []).find((item) => (
    item.id === state.designatedHeirId && item.role === 'child' && item.alive !== false
  ))
  if (!heir) return { success: false, state, message: '尚未立储' }
  const supporter = (state.heirFaction.supporters || []).find((item) => item.id === supporterId)
  if (!supporter) return { success: false, state, message: '找不到这位支持者' }
  if ((Number(state.actionPoints) || 0) <= 0) {
    return { success: false, state, message: '本旬行动点已用完' }
  }

  const next = clone(state)
  ensureChildFields(next)
  const targetHeir = next.characters.find((item) => item.id === next.designatedHeirId)
  const target = next.heirFaction.supporters.find((item) => item.id === supporterId)
  if (!target) return { success: false, state, message: '此人已不在东宫名册' }
  next.actionPoints = Math.max(0, (next.actionPoints || 0) - 1)
  let label = ''

  if (action === 'audience') {
    target.rulerLoyalty = clamp((Number(target.rulerLoyalty) || 0) + 5, 0, 100)
    target.heirLoyalty = clamp((Number(target.heirLoyalty) || 0) - 2, 0, 100)
    target.status = supporterStatus(target)
    label = `召见${target.name}`
    log(next, label, `${target.name}答应得很好，但退下时没有看陛下。`, 'heir')
  } else if (action === 'heir_choose') {
    target.heirLoyalty = clamp((Number(target.heirLoyalty) || 0) + 3, 0, 100)
    target.rulerLoyalty = clamp((Number(target.rulerLoyalty) || 0) - 2, 0, 100)
    target.status = supporterStatus(target)
    next.heirFaction.otherInfluence = clamp((Number(next.heirFaction.otherInfluence) || 0) + 2, 0, 100)
    recalcHeirInfluence(next)
    if (targetHeir) targetHeir.intimacy = clamp((Number(targetHeir.intimacy) || 0) + 2, 0, 100)
    label = `让太子自选${target.name}`
    log(next, label, `${target.name}谢了东宫，没有谢陛下。`, 'heir')
  } else if (action === 'suppress') {
    next.heirFaction.supporters = next.heirFaction.supporters.filter((item) => item.id !== supporterId)
    if (targetHeir) targetHeir.intimacy = clamp((Number(targetHeir.intimacy) || 0) - 4, 0, 100)
    recalcHeirInfluence(next)
    label = `裁抑${target.name}`
    log(next, label, `${target.name}被移出东宫名册。太子没有来问。`, 'heir')
  } else {
    return { success: false, state, message: '未知操作' }
  }

  recordActivity(next, label, 'heir')
  next.updatedAt = Date.now()
  return { success: true, state: next, message: label }
}

const createGrandchild = (state, child, spouse, rng) => {
  const gender = rng() < 0.5 ? '女' : '男'
  const name = generateChildName(rng, getSurname(child.name), gender)
  const stats = rollAbilityStats(rng, 'child', { parentStats: [child, spouse] })
  return {
    id: `dyn_grandchild_${child.id}_${Date.now()}_${Math.floor(rng() * 9999)}`,
    name,
    gender,
    role: 'child',
    roleLabel: '子嗣',
    office: `皇${gender === '女' ? '孙女' : '孙'}`,
    faction: '',
    factionName: '',
    age: 0,
    stage: 'infant',
    stageLabel: '幼年',
    intimacy: 55,
    reputation: averageAbility(stats),
    lastVisitMonth: monthIndex(state),
    educationFocus: 'civil',
    marriageStatus: 'single',
    betrothedId: '',
    spouseId: '',
    crushId: '',
    siblings: {},
    loyalty: 62,
    ambition: 25,
    ...stats,
    ability: averageAbility(stats),
    health: randInt(rng, 55, 90),
    fertility: randInt(rng, 55, 92),
    tags: ['皇孙'],
    avatarId: pickAvatarId(rng, gender),
    alive: true,
    bio: '',
    bioPending: true,
    parentIds: [child.id, spouse.id],
    cadet: true,
    birthMonth: monthIndex(state),
    childrenIds: [],
  }
}

/**
 * 每月成长：亲密度衰减、五维缓慢成长、手足关系漂移、东宫势力。
 */
export const tickChildren = (state, rng, month) => {
  ensureChildFields(state)
  const events = []
  const children = aliveChildren(state)
  if (children.length === 0) return events

  for (const child of children) {
    const age = Number(child.age) || 0
    const stage = getChildStage(age)
    if (child.stage !== stage.id) {
      child.stage = stage.id
      child.stageLabel = stage.label
      log(state, `${child.name}入${stage.label}`, `${child.office}${child.name}进入${stage.label}。`, 'child')
    }

    if (age >= 5) {
      const focus = child.educationFocus || 'civil'
      const keys = focus === 'military' ? ['military', 'strategy'] : ['civil', 'strategy']
      for (const key of keys) {
        if (rng() < 0.45) child[key] = clamp((Number(child[key]) || 0) + 1, 0, 100)
      }
      child.reputation = clamp((Number(child.reputation) || 0) + (rng() < 0.4 ? 1 : 0), 0, 100)
    }

    if (month - (Number(child.lastVisitMonth) || 0) > 2) {
      child.intimacy = clamp((Number(child.intimacy) || 0) - 1, 0, 100)
    }

    if (age >= 14 && child.marriageStatus === 'single' && !child.crushId && rng() < 0.03) {
      child.crushId = 'pending'
      log(state, `${child.name}有了心事`, `${child.office}${child.name}近来常问起某位朝臣子女。`, 'child')
    }

    // 拒婚后的私会：书信 → 私会 → 风闻 → 私定
    if (child.secretAffair?.active) {
      if (rng() < 0.45) {
        child.secretAffair.stage = Math.min(3, (Number(child.secretAffair.stage) || 0) + 1)
      }
      child.secretAffair.scandal = clamp(
        (Number(child.secretAffair.scandal) || 0)
          + 3 + (Number(child.secretAffair.stage) || 0) * 2,
        0,
        100,
      )
      if (child.secretAffair.scandal >= 55 && !child.secretAffair.alerted) {
        child.secretAffair.alerted = true
        if (!Array.isArray(state.rumors)) state.rumors = []
        state.rumors.unshift({
          id: `rumor_child_affair_${month}_${child.id}`,
          year: state.calendar?.year || 1,
          month: state.calendar?.month || 1,
          text: `${child.office}${child.name}与${child.secretAffair.candidate?.name || '某人'}私下往来，宫人已有风闻。`,
          characterId: child.id,
          revealed: false,
          plot: 0,
        })
        state.rumors = state.rumors.slice(0, 60)
        log(state, `${child.name}的风闻`, `东宫与${child.secretAffair.candidate?.name || '某人'}私下往来的消息，传到了内廷。`, 'child')
      }
    }

    // 婚后生育：仅异性婚姻自然受孕；同性婚姻走「过继」
    const spouse = (state.characters || []).find((item) => (
      item.id === child.spouseId && item.alive !== false
    ))
    if (child.marriageStatus === 'married' && spouse && child.gender !== spouse.gender) {
      if (!child.pregnancy) {
        const chance = 0.1
          + (Number(child.health) || 70) / 500
          + (Number(child.fertility) || 70) / 500
          - Math.max(0, (Number(child.age) || 20) - 30) * 0.005
        if (rng() < clamp(chance, 0.04, 0.32)) {
          child.pregnancy = {
            startMonth: month,
            dueMonth: month + 10,
            partnerId: spouse.id,
          }
          log(state, `${child.name}有喜`, `太医院诊出喜脉。东宫上下都松了一口气。`, 'child')
        }
      } else if (month >= (Number(child.pregnancy.dueMonth) || month + 1)) {
        const baby = createGrandchild(state, child, spouse, rng)
        child.pregnancy = null
        child.childrenIds = [...(child.childrenIds || []), baby.id]
        state.characters.push(baby)
        log(state, `${child.name}得子`, `${child.office}${child.name}与${spouse.name}诞下${baby.gender === '女' ? '女儿' : '儿子'}，赐名${baby.name}。`, 'child')
      }
    }
  }

  // 手足关系：母族不同、后宫张力高时更容易恶化
  for (let i = 0; i < children.length; i += 1) {
    for (let j = i + 1; j < children.length; j += 1) {
      const first = children[i]
      const second = children[j]
      const sameMother = first.parentIds?.[1] && first.parentIds?.[1] === second.parentIds?.[1]
      const drift = sameMother ? (rng() < 0.15 ? 1 : 0) : (rng() < 0.18 ? -1 : 0)
      if (drift !== 0) {
        first.siblings[second.id] = clamp((Number(first.siblings[second.id]) || 0) + drift, -100, 100)
        second.siblings[first.id] = clamp((Number(second.siblings[first.id]) || 0) + drift, -100, 100)
      }
    }
  }

  // 私会风闻：达到阈值后生成独立剧情奏折，而不是只弹一条密报
  if (events.length === 0) {
    const secretChild = children.find((item) => (
      item.secretAffair?.active
      && (Number(item.secretAffair.scandal) || 0) >= 55
      && (
        !Number(item.secretAffair.lastEventMonth)
        || month - Number(item.secretAffair.lastEventMonth) >= 6
      )
    ))
    if (secretChild) {
      secretChild.secretAffair.lastEventMonth = month
      events.push(createSecretScene(state, secretChild))
    }
  }

  // 东宫名册：支持者会随君主/太子的关系缓慢漂移
  ensureHeirSupporters(state)
  const heir = children.find((item) => item.id === state.designatedHeirId)
  if (heir && Number(heir.age) >= 12) {
    for (const supporter of state.heirFaction.supporters || []) {
      if (rng() < 0.35) {
        supporter.rulerLoyalty = clamp((Number(supporter.rulerLoyalty) || 0) - 1, 0, 100)
      }
      if (rng() < 0.4) {
        supporter.heirLoyalty = clamp((Number(supporter.heirLoyalty) || 0) + 1, 0, 100)
      }
      supporter.status = supporterStatus(supporter)
    }

    const gain = 1 + Math.round((Number(heir.ambition) || 0) / 60)
      + Math.round((Number(heir.reputation) || 0) / 80)
      + (Number(heir.intimacy) < 40 ? 1 : 0)
    state.heirFaction.otherInfluence = clamp(
      (Number(state.heirFaction.otherInfluence) || 0) + gain,
      0,
      100,
    )
    state.heirFaction.influence = clamp(
      (Number(state.heirFaction.otherInfluence) || 0)
        + (state.heirFaction.supporters || []).reduce((sum, item) => sum + (Number(item.impact) || 0), 0),
      0,
      100,
    )

    if (
      state.heirFaction.influence >= 60
      && state.heirFaction.lastEventMonth < month - 5
      && rng() < 0.55
    ) {
      state.heirFaction.lastEventMonth = month
      events.push(createHeirEvent(state, heir, month))
    }
  }

  const eventChildren = children.filter((item) => (Number(item.age) || 0) >= 5)

  // 大型手足事件：每 6 个月最多一次
  if (eventChildren.length >= 2 && month % 6 === 0 && rng() < 0.65) {
    const first = eventChildren[Math.floor(rng() * eventChildren.length)]
    const others = eventChildren.filter((item) => item.id !== first.id)
    const second = others[Math.floor(rng() * others.length)]
    if (second) events.push(createSiblingEvent(state, first, second, month))
  }

  // 小型成长事件：每月最多一次，且不与大型事件抢
  if (events.length === 0 && eventChildren.length > 0 && rng() < 0.32) {
    const child = eventChildren[Math.floor(rng() * eventChildren.length)]
    if (child) events.push(createSmallEvent(state, child, month))
  }

  return events.slice(0, 1)
}

const createSmallEvent = (state, child, month) => {
  const actor = childActor(child)
  const isYoung = Number(child.age) < 10
  return {
    instanceId: `child_small_${month}_${child.id}`,
    eventId: 'child_small',
    kind: 'child',
    title: isYoung ? '不肯读书' : '课业',
    source: '东宫',
    text: `${child.office}${child.name}近日${isYoung ? '不肯读书，只爱在御花园射鸟' : '常在东宫书房留到很晚'}。太傅说，孩子没有偷懒，只是不肯说为什么。`,
    actors: [actor],
    year: state.calendar?.year || 1,
    month: state.calendar?.month || 1,
    resolved: false,
    missed: false,
    choices: [
      {
        id: 'strict',
        text: '严加管教',
        hint: '文治 +2 · 亲密度 -3',
        effects: [
          { target: 'character', id: child.id, key: 'civil', value: 2 },
          { target: 'childIntimacy', childId: child.id, value: -3 },
        ],
        resultText: `${child.name}被关在书房抄书。第二天，太傅说孩子没有逃课。`,
      },
      {
        id: 'talk',
        text: '坐下来问一问',
        hint: '亲密度 +4 · 圣听 +1',
        effects: [
          { target: 'childIntimacy', childId: child.id, value: 4 },
          { target: 'resource', key: 'intelligence', value: 1 },
        ],
        resultText: `${child.name}说了几句。最后一句是“母皇最近很忙”。`,
      },
      {
        id: 'reward',
        text: '赏赐，不再追问',
        hint: '亲密度 +2 · 野心 +1',
        effects: [
          { target: 'childIntimacy', childId: child.id, value: 2 },
          { target: 'character', id: child.id, key: 'ambition', value: 1 },
        ],
        resultText: `赏赐送进东宫。孩子收了，没有多问。`,
      },
    ],
  }
}

const createSiblingEvent = (state, first, second, month) => {
  const relation = Number(first.siblings?.[second.id]) || 0
  return {
    instanceId: `child_sibling_${month}_${first.id}_${second.id}`,
    eventId: 'child_sibling',
    kind: 'child',
    title: '手足',
    source: '东宫',
    text: `${first.office}${first.name}与${second.office}${second.name}争起了同一位伴读。两个人都没有退，内侍站在廊下，不敢劝。`,
    actors: [childActor(first), childActor(second)],
    year: state.calendar?.year || 1,
    month: state.calendar?.month || 1,
    resolved: false,
    missed: false,
    choices: [
      {
        id: 'first',
        text: `偏向${first.name}`,
        hint: `${first.name}亲密 +4 · ${second.name}亲密 -6 · 手足 -5`,
        effects: [
          { target: 'childIntimacy', childId: first.id, value: 4 },
          { target: 'childIntimacy', childId: second.id, value: -6 },
          { target: 'siblingRelation', aId: first.id, bId: second.id, value: -5 },
        ],
        resultText: `${first.name}先选了。${second.name}没有争，只在门口站了一会儿。`,
      },
      {
        id: 'second',
        text: `偏向${second.name}`,
        hint: `${second.name}亲密 +4 · ${first.name}亲密 -6 · 手足 -5`,
        effects: [
          { target: 'childIntimacy', childId: second.id, value: 4 },
          { target: 'childIntimacy', childId: first.id, value: -6 },
          { target: 'siblingRelation', aId: first.id, bId: second.id, value: -5 },
        ],
        resultText: `${second.name}先选了。${first.name}没有再提这件事。`,
      },
      {
        id: 'both',
        text: '各配一位伴读',
        hint: '国库 -300 · 双方亲密 +3 · 手足 +4',
        effects: [
          { target: 'resource', key: 'treasury', value: -300 },
          { target: 'childIntimacy', childId: first.id, value: 3 },
          { target: 'childIntimacy', childId: second.id, value: 3 },
          { target: 'siblingRelation', aId: first.id, bId: second.id, value: 4 },
        ],
        resultText: '各配了一位伴读。两个人都没有再闹。',
      },
      {
        id: 'scold',
        text: '斥责挑起争端的人',
        hint: '双方亲密 -2 · 野心 +2 · 威望 +1',
        effects: [
          { target: 'childIntimacy', childId: first.id, value: -2 },
          { target: 'childIntimacy', childId: second.id, value: -2 },
          { target: 'character', id: first.id, key: 'ambition', value: 2 },
          { target: 'resource', key: 'prestige', value: 1 },
        ],
        resultText: '两个人都被训了一顿。廊下安静下来，但谁也没有认错。',
      },
    ],
  }
}

const createSecretScene = (state, child) => {
  const candidate = child.secretAffair?.candidate || {}
  const scandal = Number(child.secretAffair?.scandal) || 0
  return {
    instanceId: `scene_secret_${monthIndex(state)}_${child.id}`,
    eventId: 'scene_secret_affair',
    kind: 'scene',
    sceneType: 'secret_affair',
    title: '东宫风闻',
    source: '内廷',
    text: `${child.office}${child.name}与${candidate.name || '某人'}私下往来的事，传到了御前。御史没有点名，只问东宫近来为何夜里常有人出入。风闻已经压了${scandal >= 75 ? '很久' : '一阵'}。`,
    actors: [childActor(child)],
    year: state.calendar?.year || 1,
    month: state.calendar?.month || 1,
    resolved: false,
    missed: false,
    choices: [
      {
        id: 'allow',
        text: '成全，补办定亲',
        hint: '国库 -500 · 威望 -2 · 子女亲密 +10',
        effects: [{ target: 'childSecretAction', childId: child.id, action: 'allow' }],
        resultText: '你补办了定亲。东宫的事，终于摆到了明面上。',
      },
      {
        id: 'separate',
        text: '拆散，送出京',
        hint: '子女亲密 -15 · 野心 +8',
        effects: [{ target: 'childSecretAction', childId: child.id, action: 'separate' }],
        resultText: `${candidate.name || '对方'}被送出了京。${child.name}没有哭。`,
      },
      {
        id: 'suppress',
        text: '压下，不许再查',
        hint: '威望 -2 · 风闻 +10',
        effects: [{ target: 'childSecretAction', childId: child.id, action: 'suppress' }],
        resultText: '风闻暂时压下了。但宫里的人，开始记别的东西。',
      },
      {
        id: 'punish',
        text: '公开惩处',
        hint: '威望 +3 · 子女亲密 -20',
        effects: [{ target: 'childSecretAction', childId: child.id, action: 'punish' }],
        resultText: `牵涉的人被公开惩处。${child.name}没有再提${candidate.name || '对方'}。`,
      },
    ],
  }
}

const createHeirEvent = (state, heir, month) => {
  const names = (state.heirFaction?.supporters || [])
    .slice(0, 2)
    .map((item) => item.name)
    .join('、')
  return {
  instanceId: `child_heir_${month}_${heir.id}`,
  eventId: 'child_heir_faction',
  kind: 'child',
  title: '东宫私宴',
  source: '东宫',
  text: `太子${heir.name}在东宫设宴，${names || '几位东宫属官'}都到了。席上没有提朝政，但散席后，兵部的一份折子被压了下来。`,
  actors: [childActor(heir)],
  year: state.calendar?.year || 1,
  month: state.calendar?.month || 1,
  resolved: false,
  missed: false,
  choices: [
    {
      id: 'suppress',
      text: '裁抑东宫',
      hint: '东宫势力 -10 · 太子亲密 -5 · 威望 +1',
      effects: [
        { target: 'heirInfluence', value: -10 },
        { target: 'childIntimacy', childId: heir.id, value: -5 },
        { target: 'resource', key: 'prestige', value: 1 },
      ],
      resultText: `东宫裁抑。${heir.name}没有争辩，只把宴席的名单交了出来。`,
    },
    {
      id: 'allow',
      text: '放任',
      hint: '东宫势力 +8 · 太子亲密 +2',
      effects: [
        { target: 'heirInfluence', value: 8 },
        { target: 'childIntimacy', childId: heir.id, value: 2 },
      ],
      resultText: '你没有过问。东宫的车马，开始比往常多。',
    },
    {
      id: 'guide',
      text: '亲自过问',
      hint: '东宫势力 +3 · 太子亲密 +4 · 圣听 +2',
      effects: [
        { target: 'heirInfluence', value: 3 },
        { target: 'childIntimacy', childId: heir.id, value: 4 },
        { target: 'resource', key: 'intelligence', value: 2 },
      ],
      resultText: `你去了东宫。${heir.name}把宴席的名单交给了你，没有藏。`,
    },
  ],
  }
}

/**
 * 与孩子互动：探望 / 考课 / 骑射 / 训诫
 */
export const interactChild = (state, childId, action) => {
  if (!state || state.status !== 'playing') {
    return { success: false, state, message: '当前无法行动' }
  }
  ensureChildFields(state)
  if ((state.actionPoints || 0) <= 0) {
    return { success: false, state, message: '本旬行动点已用完' }
  }
  const child = (state.characters || []).find((item) => (
    item.id === childId && item.role === 'child' && item.alive !== false
  ))
  if (!child) return { success: false, state, message: '找不到这位子嗣' }

  const next = clone(state)
  ensureChildFields(next)
  const target = next.characters.find((item) => item.id === childId)
  if (action === 'study' && Number(target.age) < 5) {
    return { success: false, state, message: '孩子还太小，未到开蒙年龄' }
  }
  if (action === 'drill' && Number(target.age) < 8) {
    return { success: false, state, message: '孩子还太小，不能骑射' }
  }
  if (action === 'warn' && Number(target.age) < 5) {
    return { success: false, state, message: '孩子还太小，听不懂训诫' }
  }
  next.actionPoints = Math.max(0, (next.actionPoints || 0) - 1)
  target.lastVisitMonth = monthIndex(next)
  let label = ''

  if (action === 'visit') {
    target.intimacy = clamp((Number(target.intimacy) || 0) + 4, 0, 100)
    label = `探望${target.name}`
    log(next, label, `${target.office}${target.name}留你说了会儿话。`)
  } else if (action === 'study') {
    target.educationFocus = 'civil'
    target.civil = clamp((Number(target.civil) || 0) + 2, 0, 100)
    target.intimacy = clamp((Number(target.intimacy) || 0) - 1, 0, 100)
    label = `考课${target.name}`
    log(next, label, `${target.name}的文治长进。`)
  } else if (action === 'drill') {
    target.educationFocus = 'military'
    target.military = clamp((Number(target.military) || 0) + 2, 0, 100)
    target.health = clamp((Number(target.health) || 0) + 1, 0, 100)
    label = `骑射${target.name}`
    log(next, label, `${target.name}在演武场跑了三圈。`)
  } else if (action === 'warn') {
    target.ambition = clamp((Number(target.ambition) || 0) - 3, 0, 100)
    target.intimacy = clamp((Number(target.intimacy) || 0) - 4, 0, 100)
    label = `训诫${target.name}`
    log(next, label, `${target.name}低头认错。`)
  } else {
    return { success: false, state, message: '未知操作' }
  }

  recordActivity(next, label, 'child')
  next.updatedAt = Date.now()
  return { success: true, state: next, message: label }
}

const randomCandidate = (rng, child, parent, index, origin) => {
  const gender = rng() < 0.5 ? '女' : '男'
  const surname = parent ? getSurname(parent.name) : ''
  const name = generateChildName(rng, surname, gender)
  const age = randInt(rng, 15, 22)
  const faction = parent?.faction || ''
  const family = parent
    ? `${parent.office || ''}${parent.name}之${gender === '女' ? '女' : '子'}`
    : origin
  return {
    id: `marry_${child.id}_${index}_${Math.floor(rng() * 99999)}`,
    name,
    gender,
    age,
    origin,
    family,
    faction,
    factionName: parent?.factionName || '',
    parentId: parent?.id || '',
    parentName: parent?.name || '',
    civil: randInt(rng, 35, 88),
    military: randInt(rng, 20, 82),
    strategy: randInt(rng, 30, 88),
    charm: randInt(rng, 40, 92),
    finance: randInt(rng, 25, 80),
    tags: [origin, parent?.factionName || '无派系'],
  }
}

/**
 * 生成议婚候选：不限定朝臣子女，也包含宗室、外使、地方大族。
 */
export const startChildMarriage = (state, childId, options = {}) => {
  if (!state || state.status !== 'playing') {
    return { success: false, state, message: '当前无法议婚' }
  }
  ensureChildFields(state)
  const child = (state.characters || []).find((item) => (
    item.id === childId && item.role === 'child' && item.alive !== false
  ))
  if (!child) return { success: false, state, message: '找不到这位子嗣' }
  if ((Number(child.age) || 0) < 14) {
    return { success: false, state, message: '未满 14 岁，暂不议婚' }
  }
  if (child.marriageStatus !== 'single') {
    return { success: false, state, message: '此人已有婚约' }
  }

  const next = clone(state)
  ensureChildFields(next)
  const rng = createRngForMarriage(next, childId)
  const parents = (next.characters || []).filter((item) => (
    item.alive !== false
    && item.id !== child.id
    && (item.role === 'minister' || item.role === 'clan')
  ))

  const candidates = []
  const usedParents = new Set()
  const origins = ['朝臣子女', '宗室', '外使']
  for (let i = 0; i < origins.length; i += 1) {
    let origin = origins[i]
    let parent = null
    if (origin === '朝臣子女') {
      const available = parents.filter((item) => !usedParents.has(item.id))
      if (available.length > 0) {
        parent = available[Math.floor(rng() * available.length)]
        usedParents.add(parent.id)
      } else {
        origin = '地方大族'
      }
    }
    candidates.push(randomCandidate(rng, child, parent, i, origin))
  }

  next.childMarriage = {
    childId: child.id,
    childName: child.name,
    candidates,
  }
  next.updatedAt = Date.now()
  return { success: true, state: next, message: `为${child.name}择婚` }
}

const createRngForMarriage = (state, childId) => {
  let seed = 0
  for (const char of `${state.seed}_${childId}_${monthIndex(state)}`) {
    seed = (seed * 31 + char.charCodeAt(0)) >>> 0
  }
  let value = seed || 1
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 4294967296
  }
}

const createSpouseCharacter = (state, child, candidate) => ({
  id: `dyn_spouse_${candidate.id}`,
  name: candidate.name,
  gender: candidate.gender,
  role: 'clan',
  roleLabel: '姻亲',
  office: child.gender === '女' ? '驸马都尉' : '王妃',
  faction: candidate.faction || 'zongshi',
  factionName: candidate.factionName || candidate.origin,
  age: candidate.age,
  loyalty: 62,
  ambition: 40,
  civil: candidate.civil,
  military: candidate.military,
  strategy: candidate.strategy,
  charm: candidate.charm,
  finance: candidate.finance,
  ability: Math.round((candidate.civil + candidate.military + candidate.strategy + candidate.charm + candidate.finance) / 5),
  health: 80,
  fertility: 70,
  tags: ['姻亲', candidate.origin],
  avatarId: 0,
  alive: true,
  bio: '',
  bioPending: true,
  spouseOf: child.id,
  source: 'marriage',
})

export const CHILD_WEDDING_LEVELS = {
  simple: { label: '简礼', cost: 800, prestige: 2, popularity: 1, heir: 2, intimacy: 3, family: 3 },
  normal: { label: '常礼', cost: 1600, prestige: 5, popularity: 3, heir: 5, intimacy: 6, family: 6 },
  grand: { label: '奢礼', cost: 3000, prestige: 8, popularity: 5, heir: 9, intimacy: 8, family: 9 },
}

const createWeddingScene = (state, child, spouse, level) => ({
  instanceId: `scene_wedding_${monthIndex(state)}_${child.id}`,
  eventId: 'scene_wedding',
  kind: 'scene',
  sceneType: 'wedding',
  title: '大婚',
  source: '礼部',
  text: `${child.office}${child.name}与${spouse?.name || '婚约对象'}行${level.label}。百官在丹墀下候了半个时辰，${spouse?.factionName || '姻亲'}的车马从宫门一直排到御街。`,
  actors: [
    childActor(child),
    spouse ? {
      id: spouse.id,
      name: spouse.name,
      office: spouse.office || '姻亲',
      role: spouse.role,
      label: '姻亲',
    } : null,
  ].filter(Boolean),
  year: state.calendar?.year || 1,
  month: state.calendar?.month || 1,
  resolved: false,
  missed: false,
  choices: [
    {
      id: 'feast',
      text: '赐宴百官',
      hint: '民心 +2 · 国库 -200',
      effects: [
        { target: 'resource', key: 'popularity', value: 2 },
        { target: 'resource', key: 'treasury', value: -200 },
      ],
      resultText: '宴席摆到御街。百官谢恩，京城的酒铺当日卖空。',
    },
    {
      id: 'kin',
      text: '加赏姻亲',
      hint: '姻亲忠诚 +5 · 国库 -150',
      effects: [
        { target: 'character', id: spouse?.id || '', key: 'loyalty', value: 5 },
        { target: 'resource', key: 'treasury', value: -150 },
      ],
      resultText: `赏赐送进${spouse?.name || '姻亲'}府上。第二日，姻亲家的女眷进宫谢恩。`,
    },
    {
      id: 'rest',
      text: '礼成即散',
      hint: '威望 +1 · 国库 +100',
      effects: [
        { target: 'resource', key: 'prestige', value: 1 },
        { target: 'resource', key: 'treasury', value: 100 },
      ],
      resultText: '礼成，撤宴。礼部省下一笔，朝臣说陛下节俭。',
    },
  ],
})

/**
 * 大婚：定亲后举行。简礼 / 常礼 / 奢礼。
 */
export const holdChildWedding = (state, childId, scale = 'normal') => {
  if (!state || state.status !== 'playing') {
    return { success: false, state, message: '当前无法举行大婚' }
  }
  ensureChildFields(state)
  const level = CHILD_WEDDING_LEVELS[scale] || CHILD_WEDDING_LEVELS.normal
  const child = (state.characters || []).find((item) => (
    item.id === childId && item.role === 'child' && item.alive !== false
  ))
  if (!child) return { success: false, state, message: '找不到这位子嗣' }
  if (child.marriageStatus !== 'betrothed') {
    return { success: false, state, message: '尚未定亲，不能举行大婚' }
  }
  const spouse = (state.characters || []).find((item) => item.id === child.spouseId && item.alive !== false)
  if (!spouse) return { success: false, state, message: '婚约对象已不在' }
  if ((Number(state.resources.treasury) || 0) < level.cost) {
    return { success: false, state, message: `国库不足 ${level.cost} 贯` }
  }

  const next = clone(state)
  ensureChildFields(next)
  const target = next.characters.find((item) => item.id === childId)
  const targetSpouse = next.characters.find((item) => item.id === target.spouseId)
  next.resources.treasury -= level.cost
  next.resources.prestige = clamp((Number(next.resources.prestige) || 0) + level.prestige, 0, 100)
  next.resources.popularity = clamp((Number(next.resources.popularity) || 0) + level.popularity, 0, 100)
  target.marriageStatus = 'married'
  target.weddingScale = level.label
  target.intimacy = clamp((Number(target.intimacy) || 0) + level.intimacy, 0, 100)
  next.heirFaction.otherInfluence = clamp(
    (Number(next.heirFaction.otherInfluence) || 0) + (target.id === next.designatedHeirId ? level.heir : 1),
    0,
    100,
  )
  recalcHeirInfluence(next)
  if (targetSpouse) {
    targetSpouse.loyalty = clamp((Number(targetSpouse.loyalty) || 0) + level.family, 0, 100)
  }
  if (target.id === next.designatedHeirId) {
    for (const other of aliveChildren(next)) {
      if (other.id === target.id || !target.siblings) continue
      target.siblings[other.id] = clamp((Number(target.siblings[other.id]) || 0) - 1, -100, 100)
      other.siblings[target.id] = clamp((Number(other.siblings[target.id]) || 0) - 1, -100, 100)
    }
  }
  log(next, `${target.name}大婚`, `以${level.label}与${targetSpouse?.name || '婚约对象'}成婚。`, 'marriage')
  recordActivity(next, `${target.name}大婚（${level.label}，-${level.cost}贯）`, 'marriage')
  if (!Array.isArray(next.pending)) next.pending = []
  next.pending.push(createWeddingScene(next, target, targetSpouse, level))
  next.updatedAt = Date.now()
  return { success: true, state: next, message: `${target.name}已大婚` }
}

/**
 * 在当前 state 上直接处理私会（供 resolveEvent 的自定义 effect 复用）。
 * 不 clone，调用方必须先 clone。
 */
export const applyChildSecretAction = (state, childId, action = 'suppress') => {
  if (!state) return { success: false, message: '存档不存在' }
  ensureChildFields(state)
  const child = (state.characters || []).find((item) => (
    item.id === childId && item.role === 'child' && item.alive !== false
  ))
  if (!child?.secretAffair?.active) {
    return { success: false, message: '没有正在发酵的私会' }
  }
  const target = state.characters.find((item) => item.id === childId)
  const affair = target.secretAffair
  const candidate = affair.candidate
  let message = ''

  if (action === 'allow') {
    if ((Number(state.resources.treasury) || 0) < 500) {
      return { success: false, message: '国库不足 500 贯，办不了这门婚事' }
    }
    state.resources.treasury -= 500
    state.resources.prestige = clamp((Number(state.resources.prestige) || 0) - 2, 0, 100)
    target.marriageStatus = 'betrothed'
    target.betrothedId = candidate.id
    target.crushId = ''
    target.intimacy = clamp((Number(target.intimacy) || 0) + 10, 0, 100)
    if (!target.spouseId || !state.characters.some((item) => item.id === target.spouseId)) {
      const spouse = createSpouseCharacter(state, target, candidate)
      state.characters.push(spouse)
      target.spouseId = spouse.id
    }
    state.heirFaction.otherInfluence = clamp(
      (Number(state.heirFaction.otherInfluence) || 0) + (target.id === state.designatedHeirId ? 4 : 1),
      0,
      100,
    )
    recalcHeirInfluence(state)
    target.secretAffair = null
    message = `补办定亲。${target.name}与${candidate.name}的事，终于摆到了明面上。`
    log(state, `${target.name}补办定亲`, message, 'marriage')
    recordActivity(state, `${target.name}与${candidate.name}补办定亲（-500贯）`, 'marriage')
  } else if (action === 'separate') {
    target.marriageStatus = 'single'
    target.intimacy = clamp((Number(target.intimacy) || 0) - 15, 0, 100)
    target.ambition = clamp((Number(target.ambition) || 0) + 8, 0, 100)
    target.secretAffair = null
    message = `${candidate.name}被送出了京。${target.name}没有哭。`
    log(state, `${target.name}私会被拆`, message, 'marriage')
    recordActivity(state, `拆散${target.name}与${candidate.name}`, 'marriage')
  } else if (action === 'suppress') {
    state.resources.prestige = clamp((Number(state.resources.prestige) || 0) - 2, 0, 100)
    affair.scandal = clamp((Number(affair.scandal) || 0) + 10, 0, 100)
    message = '风闻暂时压下了。但宫里的人，开始记别的东西。'
    log(state, `${target.name}私会被压`, message, 'marriage')
    recordActivity(state, `压下${target.name}的私会风闻`, 'marriage')
  } else if (action === 'punish') {
    state.resources.prestige = clamp((Number(state.resources.prestige) || 0) + 3, 0, 100)
    target.intimacy = clamp((Number(target.intimacy) || 0) - 20, 0, 100)
    target.marriageStatus = 'single'
    target.secretAffair = null
    message = `牵涉的人被公开惩处。${target.name}没有再提${candidate.name}。`
    log(state, `${target.name}私会被惩`, message, 'marriage')
    recordActivity(state, `公开惩处${target.name}的私会`, 'marriage')
  } else {
    return { success: false, message: '未知操作' }
  }

  return { success: true, message }
}

export const resolveChildSecretAffair = (state, childId, action = 'suppress') => {
  if (!state || state.status !== 'playing') {
    return { success: false, state, message: '当前无法处置' }
  }
  const next = clone(state)
  ensureChildFields(next)
  const result = applyChildSecretAction(next, childId, action)
  if (!result.success) return { success: false, state, message: result.message }
  next.updatedAt = Date.now()
  return { success: true, state: next, message: result.message }
}

/**
 * 过继：同性婚姻 / 无子女时接继承线
 */
export const adoptChildForChild = (state, childId) => {
  if (!state || state.status !== 'playing') {
    return { success: false, state, message: '当前无法过继' }
  }
  ensureChildFields(state)
  const child = (state.characters || []).find((item) => (
    item.id === childId && item.role === 'child' && item.alive !== false
  ))
  if (!child) return { success: false, state, message: '找不到这位子嗣' }
  if (child.marriageStatus !== 'married') {
    return { success: false, state, message: '大婚之后才能过继' }
  }
  if ((child.childrenIds || []).length > 0) {
    return { success: false, state, message: '已有子女，不必再过继' }
  }
  if ((Number(state.resources.treasury) || 0) < 300) {
    return { success: false, state, message: '国库不足 300 贯' }
  }

  const next = clone(state)
  ensureChildFields(next)
  const target = next.characters.find((item) => item.id === childId)
  const spouse = next.characters.find((item) => item.id === target.spouseId)
  const rng = createRngForMarriage(next, `${childId}_adopt`)
  const gender = rng() < 0.5 ? '女' : '男'
  const name = generateChildName(rng, getSurname(target.name), gender)
  const stats = rollAbilityStats(rng, 'child', {
    parentStats: [target, spouse].filter(Boolean),
  })
  const index = (target.childrenIds || []).length + 1
  const adopted = {
    id: `dyn_adopt_${target.id}_${index}`,
    name,
    gender,
    role: 'child',
    roleLabel: '子嗣',
    office: `养${gender === '女' ? '女' : '子'}`,
    faction: '',
    factionName: '',
    age: randInt(rng, 2, 6),
    stage: 'infant',
    stageLabel: '幼年',
    intimacy: 58,
    reputation: averageAbility(stats),
    lastVisitMonth: monthIndex(next),
    educationFocus: 'civil',
    marriageStatus: 'single',
    betrothedId: '',
    spouseId: '',
    crushId: '',
    siblings: {},
    loyalty: 65,
    ambition: 30,
    ...stats,
    ability: averageAbility(stats),
    health: randInt(rng, 55, 85),
    fertility: randInt(rng, 55, 90),
    tags: ['过继'],
    avatarId: pickAvatarId(rng, gender),
    alive: true,
    bio: '',
    bioPending: true,
    parentIds: [target.id, spouse?.id || ''],
    adopted: true,
    legitimacyBonus: -8,
    birthMonth: monthIndex(next),
    childrenIds: [],
  }
  next.characters.push(adopted)
  target.childrenIds = [...(target.childrenIds || []), adopted.id]
  next.resources.treasury -= 300
  log(next, `${target.name}过继${adopted.name}`, `从宗室过继${adopted.name}，承东宫香火。`, 'child')
  recordActivity(next, `${target.name}过继${adopted.name}（-300贯）`, 'child')
  next.updatedAt = Date.now()
  return { success: true, state: next, message: `已过继${adopted.name}` }
}

/**
 * 处理议婚：approve / refuse / delay
 */
export const resolveChildMarriage = (state, candidateId, action = 'approve') => {
  if (!state || state.status !== 'playing') {
    return { success: false, state, message: '当前无法议婚' }
  }
  ensureChildFields(state)
  const proposal = state.childMarriage
  if (!proposal) return { success: false, state, message: '当前没有议婚' }
  const candidate = proposal.candidates.find((item) => item.id === candidateId)
  if (!candidate) return { success: false, state, message: '找不到这位候选' }

  const next = clone(state)
  ensureChildFields(next)
  const child = next.characters.find((item) => item.id === next.childMarriage.childId)
  if (!child) return { success: false, state, message: '子嗣数据丢失' }

  if (action === 'approve') {
    if ((Number(next.resources.treasury) || 0) < 800) {
      return { success: false, state, message: '国库不足 800 贯，办不了这门婚事' }
    }
    next.resources.treasury -= 800
    child.marriageStatus = 'betrothed'
    child.betrothedId = candidate.id
    child.crushId = ''
    child.intimacy = clamp((Number(child.intimacy) || 0) + 10, 0, 100)
    next.heirFaction.influence = clamp((Number(next.heirFaction.influence) || 0) + (child.id === next.designatedHeirId ? 6 : 2), 0, 100)

    const spouse = createSpouseCharacter(next, child, candidate)
    next.characters.push(spouse)
    child.spouseId = spouse.id
    if (candidate.parentId) {
      const parent = next.characters.find((item) => item.id === candidate.parentId && item.alive !== false)
      if (parent) parent.loyalty = clamp((Number(parent.loyalty) || 0) + 8, 0, 100)
    }
    log(next, `${child.name}定亲`, `与${candidate.family}${candidate.name}定亲。`, 'marriage')
    recordActivity(next, `${child.name}与${candidate.name}定亲（-800贯）`, 'marriage')
  } else if (action === 'refuse') {
    child.marriageStatus = 'refused'
    child.intimacy = clamp((Number(child.intimacy) || 0) - 12, 0, 100)
    child.ambition = clamp((Number(child.ambition) || 0) + 5, 0, 100)
    child.secretAffair = {
      candidate: { ...candidate },
      stage: 0,
      scandal: 8,
      active: true,
      alerted: false,
      startMonth: monthIndex(next),
    }
    log(next, `${child.name}婚事被拒`, `${child.name}没有再提${candidate.name}。`, 'marriage')
    recordActivity(next, `拒绝${child.name}与${candidate.name}的婚事`, 'marriage')
  } else if (action === 'delay') {
    child.intimacy = clamp((Number(child.intimacy) || 0) - 2, 0, 100)
    log(next, `${child.name}婚事暂缓`, `先考察${candidate.name}。`, 'marriage')
    recordActivity(next, `暂缓${child.name}的婚事`, 'marriage')
  } else {
    return { success: false, state, message: '未知操作' }
  }

  next.childMarriage = null
  next.updatedAt = Date.now()
  return {
    success: true,
    state: next,
    message: action === 'approve' ? `${child.name}与${candidate.name}定亲` : (action === 'refuse' ? '已拒绝婚事' : '婚事暂缓'),
  }
}

export const getChildSiblingRows = (state, childId) => {
  ensureChildFields(state)
  const child = (state.characters || []).find((item) => item.id === childId)
  if (!child) return []
  return (state.characters || [])
    .filter((item) => item.alive !== false && item.role === 'child' && item.id !== childId)
    .map((other) => ({
      id: other.id,
      name: other.name,
      office: other.office,
      value: Number(child.siblings?.[other.id]) || 0,
    }))
}
