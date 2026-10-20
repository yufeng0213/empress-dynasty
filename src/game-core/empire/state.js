/**
 * 王朝状态机
 *
 * 纯函数：输入状态 + 操作，输出新状态。不依赖浏览器、存档或 LLM。
 * 覆盖：历法、月度收支、奏折、生育、继承争夺、换代。
 */

import { chance, clamp, createRng, pick, randInt } from './random.js'
import {
  CHILD_TAGS,
  averageAbility,
  ensureAbilityStats,
  generateCast,
  generateChildName,
  generateRuler,
  getAbilityStats,
  getSurname,
  pickAvatarId,
  rollAbilityStats,
} from './characters.js'
import { FACTIONS, INITIAL_RESOURCES } from './constants.js'
import { createEventById, ensureEventFields, rollMonthlyEvent } from './events.js'
import { rollScene } from './scenes.js'
import { rollHaremEvent } from './harem.js'
import { ensureConspiracyFields, purgeCharacter as purgeConspiracyTarget, tickConspiracies } from './conspiracy.js'
import { ensureIntakeFields, rollGiftConsortEvent, tickWhispers } from './intake.js'
import { ensureMortalityFields, recordDeath, tickMortality } from './mortality.js'
import { ensureAppointmentFields } from './appointment.js'
import {
  ensureBureaucracyFields,
  computeRegionalTax,
  computeAdministrativeCost,
  computeArmyUpkeep,
  rollLocalReportEvent,
  rollTriennialReviewEvent,
  tickBureaucracy,
} from './bureaucracy.js'
import { ensureAvatarFields } from './avatar.js'
import { ensurePalaceFields, resetPalaceForMonth } from './palace.js'
import { ensureActivityFields, getActivitiesForMonth, recordActivity } from './activity.js'
import { applyChildSecretAction, ensureChildFields, tickChildren } from './children.js'
import { ensureChatFields } from './chat.js'
import { ensureCityFields } from './city.js'
import { addBurdenTrait, ensureBurdenFields, tickBurdens } from './burdens.js'

const ERA_NAMES = ['天启', '永熙', '承光', '景元', '弘昌', '靖和', '元祐', '昭宁', '乾明', '太和']
const MAX_ARCHIVE = 30
const MAX_LOG = 500

const clone = (value) => JSON.parse(JSON.stringify(value))

export const getMonthIndex = (state) => {
  const year = Number(state?.calendar?.year) || 1
  const month = Number(state?.calendar?.month) || 1
  return (year - 1) * 12 + month
}

const addLog = (state, type, title, desc) => {
  state.log.push({
    id: `log_${state.calendar.year}_${state.calendar.month}_${state.log.length + 1}`,
    year: state.calendar.year,
    month: state.calendar.month,
    type,
    title,
    desc,
  })
  if (state.log.length > MAX_LOG) {
    state.log = state.log.slice(-MAX_LOG)
  }
}

/**
 * 开局资源：由五维给倾向，但只做小幅修正，避免开局差距过大。
 */
export const computeStartResources = (stats = {}) => {
  const civil = clamp(Number(stats.civil) || 0, 0, 95)
  const military = clamp(Number(stats.military) || 0, 0, 95)
  const strategy = clamp(Number(stats.strategy) || 0, 0, 95)
  const charm = clamp(Number(stats.charm) || 0, 0, 95)
  const finance = clamp(Number(stats.finance) || 0, 0, 95)

  return {
    treasury: Math.round(9000 + finance * 40),
    prestige: clamp(40 + Math.round(charm * 0.3), 0, 100),
    popularity: clamp(45 + Math.round(civil * 0.25), 0, 100),
    military: clamp(25 + Math.round(military * 0.4), 0, 100),
    intelligence: clamp(25 + Math.round(strategy * 0.35), 0, 100),
    clan: 55,
  }
}

const createBaseState = (seed, dynastyName, eraName, options = {}) => {
  const rng = createRng(seed)
  const ruler = generateRuler(rng, { abilityStats: options.rulerStats })
  const characters = generateCast(rng, {
    consortMale: options.consortMale,
    consortFemale: options.consortFemale,
  })

  return {
    version: 2,
    config: {
      consortMale: Math.max(0, Math.min(12, Number(options.consortMale) || 0)),
      consortFemale: Math.max(0, Math.min(12, Number(options.consortFemale) || 0)),
    },
    id: `dyn_${seed}_${Math.random().toString(36).slice(2, 7)}`,
    seed,
    dynastyName,
    eraName,
    generation: 1,
    status: 'playing',
    settings: { blindStats: Boolean(options.blindStats) },
    rumors: [],
    selection: null,
    lastSelectionMonth: 0,
    lastGiftMonth: 0,
    vacancies: [],
    appointment: null,
    activityLog: [],
    lastSummary: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    calendar: { year: 1, month: 1 },
    ruler,
    resources: {
      ...INITIAL_RESOURCES,
      ...(options.rulerStats ? computeStartResources(options.rulerStats) : {}),
    },
    characters,
    heirs: [],
    designatedHeirId: '',
    pending: [],
    archive: [],
    pregnancies: [],
    succession: null,
    pastRulers: [],
    recentEventIds: [],
    flags: {},
    actionPoints: 2,
    maxActionPoints: 2,
    stats: { months: 0, eventsResolved: 0, childrenBorn: 0, missed: 0, struggles: 0, haremEvents: 0 },
    log: [],
  }
}

/**
 * 新朝开局
 */
export const createDynastyRun = (options = {}) => {
  const seed = Number(options.seed) || Date.now()
  const dynastyName = String(options.dynastyName || '大晟').trim() || '大晟'
  const eraName = String(options.eraName || '天启').trim() || '天启'
  const state = createBaseState(seed, dynastyName, eraName, {
    consortMale: options.consortMale,
    consortFemale: options.consortFemale,
    blindStats: options.blindStats,
    rulerStats: options.rulerStats,
  })

  addLog(
    state,
    'found',
    `${dynastyName}立国`,
    `${state.ruler.name}即皇帝位，改元${eraName}，时年十六。`,
  )

  // 地方官与行政区
  ensureBureaucracyFields(state, { generate: true })
  ensureAvatarFields(state)
  ensureAbilityStats(state)
  ensurePalaceFields(state)
  ensureChildFields(state)
  ensureChatFields(state)
  ensureCityFields(state)
  ensureBurdenFields(state)
  const startingTrait = state.ruler.health < 55
    ? 'sickly'
    : (Number(state.ruler.ambition) > 60 ? 'ambitious' : 'paranoid')
  addBurdenTrait(state, startingTrait)

  // 开局就给一份奏折，避免第一屏无事可做
  const firstEvent = rollMonthlyEvent(state, createRng(seed + 131), 1)
  state.pending = [firstEvent]
  state.recentEventIds = [firstEvent.eventId]

  return state
}

/**
 * 月度收支
 */
export const computeMonthlyIncome = (state) => {
  const popularity = Number(state?.resources?.popularity) || 0
  const military = Number(state?.resources?.military) || 0
  const characters = Array.isArray(state?.characters) ? state.characters : []
  const living = characters.filter((item) => item.alive !== false)
  const consorts = living.filter((item) => item.role === 'consort').length

  const regionalTax = computeRegionalTax(state)
  const adminCost = computeAdministrativeCost(state)
  const armyUpkeep = computeArmyUpkeep(state)
  const rankSalary = living.reduce((sum, item) => (
    sum + (Number(item.rank) > 0 ? (10 - Number(item.rank)) * 6 : 0)
  ), 0)
  const tax = Math.round(820 + popularity * 8 + military * 2 + regionalTax)
  const salary = Math.round(560 + living.length * 4 + rankSalary)
  const harem = Math.round(180 + consorts * 26)
  const totalExpense = salary + harem + adminCost + armyUpkeep

  return {
    tax,
    regionalTax,
    salary,
    harem,
    adminCost,
    armyUpkeep,
    totalExpense,
    net: tax - totalExpense,
  }
}

/* ============================================================
 * 效果结算
 * ============================================================ */

const applyToCharacter = (state, character, key, value) => {
  if (!character || character.alive === false) return
  if (![
    'loyalty', 'ambition', 'ability', 'health', 'fertility', 'performance',
    'civil', 'military', 'strategy', 'charm', 'finance',
  ].includes(key)) return
  character[key] = clamp(Math.round((Number(character[key]) || 0) + (Number(value) || 0)), 0, 100)
  if (['civil', 'military', 'strategy', 'charm', 'finance'].includes(key)) {
    character.ability = averageAbility(character)
  }
  if (key === 'health' && character.health <= 0) {
    recordDeath(state, character, 'illness', {
      desc: `${character.office || ''}${character.name}因伤病不治身亡，年${character.age}。`,
    })
  }
}

export const applyEffects = (state, effects) => {
  const list = Array.isArray(effects) ? effects : []
  const rng = createRng(Number(state.seed) + getMonthIndex(state) * 31)

  for (const effect of list) {
    if (!effect) continue
    if (effect.target === 'resource') {
      const key = effect.key
      if (key === 'treasury') {
        state.resources.treasury = clamp(
          Math.round((Number(state.resources.treasury) || 0) + (Number(effect.value) || 0)),
          -999999,
          9999999,
        )
      } else if (key in state.resources) {
        state.resources[key] = clamp(
          Math.round((Number(state.resources[key]) || 0) + (Number(effect.value) || 0)),
          0,
          100,
        )
      }
    } else if (effect.target === 'ruler') {
      if (effect.key === 'lifespan') {
        state.ruler.lifespan = Math.max(1, (Number(state.ruler.lifespan) || 0) + (Number(effect.value) || 0))
      } else if (effect.key === 'prestige') {
        state.ruler.prestige = clamp((Number(state.ruler.prestige) || 0) + (Number(effect.value) || 0), 0, 100)
      } else if (effect.key in state.ruler) {
        state.ruler[effect.key] = clamp(
          (Number(state.ruler[effect.key]) || 0) + (Number(effect.value) || 0),
          0,
          100,
        )
      }
    } else if (effect.target === 'role') {
      for (const character of state.characters) {
        if (character.role === effect.role) applyToCharacter(state, character, effect.key, effect.value)
      }
    } else if (effect.target === 'faction') {
      for (const character of state.characters) {
        if (character.faction === effect.faction) applyToCharacter(state, character, effect.key, effect.value)
      }
    } else if (effect.target === 'character') {
      const character = state.characters.find((item) => item.id === effect.id)
      applyToCharacter(state, character, effect.key, effect.value)
    } else if (effect.target === 'randomRole') {
      const pool = state.characters.filter((item) => item.alive !== false && item.role === effect.role)
      if (pool.length > 0) {
        applyToCharacter(state, pick(rng, pool), effect.key, effect.value)
      }
    } else if (effect.target === 'expose') {
      const target = state.characters.find((item) => item.id === effect.characterId)
      if (target) target.exposed = true
    } else if (effect.target === 'dismiss') {
      const target = state.characters.find((item) => item.id === effect.characterId && item.alive !== false)
      if (target) {
        recordDeath(state, target, 'dismiss', {
          desc: `${target.office || ''}${target.name}京察不合格，勒令致仕。`,
        })
      }
    } else if (effect.target === 'regionUnrest') {
      const region = (state.regions || []).find((item) => item.id === effect.regionId)
      if (region) {
        region.unrest = clamp((Number(region.unrest) || 0) + (Number(effect.value) || 0), 0, 100)
      }
    } else if (effect.target === 'childIntimacy') {
      const child = (state.characters || []).find((item) => item.id === effect.childId)
      if (child) {
        child.intimacy = clamp((Number(child.intimacy) || 0) + (Number(effect.value) || 0), 0, 100)
      }
    } else if (effect.target === 'siblingRelation') {
      const first = (state.characters || []).find((item) => item.id === effect.aId)
      const second = (state.characters || []).find((item) => item.id === effect.bId)
      if (first && second) {
        if (!first.siblings) first.siblings = {}
        if (!second.siblings) second.siblings = {}
        first.siblings[second.id] = clamp((Number(first.siblings[second.id]) || 0) + (Number(effect.value) || 0), -100, 100)
        second.siblings[first.id] = clamp((Number(second.siblings[first.id]) || 0) + (Number(effect.value) || 0), -100, 100)
      }
    } else if (effect.target === 'heirInfluence') {
      if (!state.heirFaction) state.heirFaction = { influence: 0, lastEventMonth: 0 }
      state.heirFaction.influence = clamp((Number(state.heirFaction.influence) || 0) + (Number(effect.value) || 0), 0, 100)
    } else if (effect.target === 'childSecretAction') {
      applyChildSecretAction(state, effect.childId, effect.action)
    } else if (effect.target === 'giftConsort') {
      const consort = effect.consort
      if (consort && !state.characters.some((item) => item.id === consort.id)) {
        state.characters.push({ ...consort, bioPending: true })
      }
    } else if (effect.target === 'rumor') {
      if (!Array.isArray(state.rumors)) state.rumors = []
      state.rumors.unshift({
        id: `rumor_${state.calendar.year}_${state.calendar.month}_${state.rumors.length + 1}`,
        year: state.calendar.year,
        month: state.calendar.month,
        text: String(effect.text || '').trim(),
        characterId: effect.characterId || '',
        revealed: Boolean(effect.revealed),
        plot: 0,
      })
      state.rumors = state.rumors.slice(0, 60)
    } else if (effect.target === 'pregnancy') {
      if (effect.action === 'lose') {
        const index = state.pregnancies.findIndex((item) => item.carrierId === effect.characterId)
        if (index >= 0) state.pregnancies.splice(index, 1)
      }
    } else if (effect.target === 'flag') {
      state.flags[effect.key] = effect.value
    }
  }
}

/* ============================================================
 * 奏折
 * ============================================================ */

export const resolveEvent = (state, instanceId, choiceId) => {
  if (!state || state.status !== 'playing') {
    return { success: false, state, message: '当前无法批阅奏折' }
  }
  const event = state.pending.find((item) => item.instanceId === instanceId)
  if (!event) {
    return { success: false, state, message: '奏折不存在或已批' }
  }
  const choice = event.choices.find((item) => item.id === choiceId)
  if (!choice) {
    return { success: false, state, message: '选项不存在' }
  }

  const next = clone(state)
  ensureEventFields(next)
  const target = next.pending.find((item) => item.instanceId === instanceId)
  applyEffects(next, choice.effects)

  if (choice.followUp?.eventId) {
    next.scheduledEvents.push({
      id: `sch_${getMonthIndex(next)}_${choice.followUp.eventId}_${next.scheduledEvents.length + 1}`,
      eventId: choice.followUp.eventId,
      dueMonth: getMonthIndex(next) + (Number(choice.followUp.delay) || 1),
      context: {
        actorId: target.actors?.[0]?.id || '',
      },
    })
  }

  next.pending = next.pending.filter((item) => item.instanceId !== instanceId)
  next.archive.unshift({
    ...target,
    resolved: true,
    missed: false,
    choiceId,
    choiceText: choice.text,
    resultText: choice.resultText || '',
    resolvedAt: Date.now(),
  })
  next.archive = next.archive.slice(0, MAX_ARCHIVE)
  next.stats.eventsResolved = (next.stats.eventsResolved || 0) + 1
  addLog(next, 'event', `${target.title} · ${choice.text}`, choice.resultText || choice.hint || '')
  recordActivity(next, `批阅《${target.title}》：${choice.text}`, 'event')
  next.updatedAt = Date.now()

  return { success: true, state: next, message: '' }
}

/* ============================================================
 * 生育
 * ============================================================ */

const createChild = (state, carrier, rng) => {
  const gender = chance(rng, 0.5) ? '女' : '男'
  const surname = getSurname(state.ruler.name || '姜') || '姜'
  const name = generateChildName(rng, surname, gender)
  const index = state.characters.filter((item) => item.role === 'child').length + 1
  const numerals = ['长', '二', '三', '四', '五', '六', '七', '八', '九', '十']
  const numeral = numerals[index - 1] || String(index)
  const office = `皇${numeral}${gender === '女' ? '女' : '子'}`

  const childStats = rollAbilityStats(rng, 'child', { parentStats: [carrier, state.ruler] })
  const tags = []
  while (tags.length < 2) {
    const tag = pick(rng, CHILD_TAGS)
    if (tag && !tags.includes(tag)) tags.push(tag)
  }

  return {
    id: `dyn_child_${state.generation}_${index}`,
    name,
    gender,
    role: 'child',
    roleLabel: '子嗣',
    office,
    faction: '',
    factionName: '',
    age: 0,
    stage: 'infant',
    stageLabel: '幼年',
    intimacy: 60,
    reputation: averageAbility(childStats),
    lastVisitMonth: getMonthIndex(state),
    educationFocus: 'civil',
    marriageStatus: 'single',
    betrothedId: '',
    spouseId: '',
    crushId: '',
    siblings: {},
    loyalty: randInt(rng, 62, 96),
    ambition: randInt(rng, 12, 72),
    ...childStats,
    ability: averageAbility(childStats),
    health: clamp(Math.round(((Number(carrier.health) || 70) + 78) / 2) + randInt(rng, -10, 10), 20, 100),
    fertility: randInt(rng, 50, 96),
    tags,
    avatarId: pickAvatarId(rng, gender),
    alive: true,
    bio: '',
    bioPending: true,
    parentIds: [state.ruler.id, carrier.id],
    birthMonth: getMonthIndex(state),
    childrenIds: [],
  }
}

const deliverChild = (state, pregnancy, rng) => {
  const carrier = state.characters.find((item) => item.id === pregnancy.carrierId)
  if (!carrier || carrier.alive === false) return

  const risk = clamp(
    0.04
      + Math.max(0, (Number(carrier.age) || 20) - 30) * 0.008
      + Math.max(0, 100 - (Number(carrier.health) || 80)) * 0.0015,
    0.02,
    0.4,
  )

  if (chance(rng, risk)) {
    carrier.health = clamp((Number(carrier.health) || 60) - 18, 0, 100)
    if (carrier.health <= 0) {
      recordDeath(state, carrier, 'childbirth', {
        desc: `${carrier.name}难产而亡，年${carrier.age}。内廷挂起了白幡。`,
      })
    } else {
      addLog(state, 'birth_fail', `${carrier.name}小产`, '胎未能保住。太医跪了一地。')
    }
    return
  }

  const child = createChild(state, carrier, rng)
  state.characters.push(child)
  state.heirs.push(child.id)
  state.stats.childrenBorn = (state.stats.childrenBorn || 0) + 1
  carrier.health = clamp((Number(carrier.health) || 60) - 8, 0, 100)
  addLog(
    state,
    'birth',
    `${child.office}出生`,
    `${carrier.name}诞下${child.gender === '女' ? '皇女' : '皇子'}，赐名${child.name}。`,
  )
}

/**
 * 安排侍寝
 */
export const arrangeConsort = (state, consortId) => {
  if (!state || state.status !== 'playing') {
    return { success: false, state, message: '当前无法安排' }
  }
  if ((state.actionPoints || 0) <= 0) {
    return { success: false, state, message: '本旬行动点已用完' }
  }
  const consort = state.characters.find((item) => (
    item.id === consortId && item.role === 'consort' && item.alive !== false
  ))
  if (!consort) {
    return { success: false, state, message: '找不到这位侍宠' }
  }
  if (state.pregnancies.some((item) => item.carrierId === consortId)) {
    return { success: false, state, message: '对方已有身孕' }
  }

  const next = clone(state)
  const target = next.characters.find((item) => item.id === consortId)
  next.actionPoints = Math.max(0, (next.actionPoints || 0) - 1)
  recordActivity(next, `召幸${target.name}`, 'harem')

  const ageFactor = target.age < 20 ? 1.1 : (target.age <= 30 ? 1 : Math.max(0.35, 1 - (target.age - 30) * 0.04))
  const probability = clamp(
    0.2
      * ((Number(next.ruler.fertility) || 60) / 70)
      * ((Number(target.fertility) || 60) / 70)
      * ((Number(target.health) || 70) / 80)
      * ageFactor,
    0.03,
    0.65,
  )

  const rng = createRng(Number(next.seed) + getMonthIndex(next) * 97 + next.actionPoints * 13)
  if (chance(rng, probability)) {
    next.pregnancies.push({
      id: `preg_${getMonthIndex(next)}_${target.id}`,
      carrierId: target.id,
      partnerId: next.ruler.id,
      startMonth: getMonthIndex(next),
      dueMonth: getMonthIndex(next) + 10,
      risk: clamp(0.04 + Math.max(0, target.age - 30) * 0.008, 0.02, 0.35),
    })
    addLog(next, 'pregnancy', `${target.name}有孕`, `太医诊出喜脉。举宫上下都松了一口气。`)
    next.updatedAt = Date.now()
    return { success: true, pregnant: true, state: next, message: `${target.name} 有孕了` }
  }

  addLog(next, 'pregnancy_fail', `召幸${target.name}`, '一夜无事。内廷照例记了档。')
  next.updatedAt = Date.now()
  return { success: true, pregnant: false, state: next, message: '本旬未能成孕' }
}

/* ============================================================
 * 人物处置
 * ============================================================ */

export const interactCharacter = (state, characterId, action) => {
  if (!state || state.status !== 'playing') {
    return { success: false, state, message: '当前无法行动' }
  }
  if ((state.actionPoints || 0) <= 0) {
    return { success: false, state, message: '本旬行动点已用完' }
  }
  const character = state.characters.find((item) => item.id === characterId && item.alive !== false)
  if (!character) {
    return { success: false, state, message: '找不到此人' }
  }

  const next = clone(state)
  const target = next.characters.find((item) => item.id === characterId)
  next.actionPoints = Math.max(0, (next.actionPoints || 0) - 1)

  if (action === 'reward') {
    next.resources.treasury = Math.round((Number(next.resources.treasury) || 0) - 100)
    target.loyalty = clamp((Number(target.loyalty) || 0) + 6, 0, 100)
    addLog(next, 'favor', `赏赐${target.name}`, '赐金百两。内库记了一笔。')
    recordActivity(next, `赏赐${target.name}（-100贯）`, 'favor')
  } else if (action === 'warn') {
    target.loyalty = clamp((Number(target.loyalty) || 0) - 4, 0, 100)
    target.ambition = clamp((Number(target.ambition) || 0) - 8, 0, 100)
    addLog(next, 'warn', `申斥${target.name}`, '殿上斥责数句。此人伏地请罪。')
    recordActivity(next, `申斥${target.name}`, 'warn')
  } else {
    return { success: false, state, message: '未知操作' }
  }

  next.updatedAt = Date.now()
  return { success: true, state: next, message: action === 'reward' ? `已赏赐${target.name}` : `已申斥${target.name}` }
}

/* ============================================================
 * 立储与继承
 * ============================================================ */

export const designateHeir = (state, childId) => {
  const child = state.characters.find((item) => item.id === childId && item.alive !== false)
  if (!child || child.role !== 'child') {
    return { success: false, state, message: '只能从子嗣中择立' }
  }
  const next = clone(state)
  next.designatedHeirId = childId
  next.updatedAt = Date.now()
  addLog(next, 'heir', `立${child.name}为储`, `${child.office}${child.name}被册立为皇储。`)
  recordActivity(next, `立${child.name}为储`, 'heir')
  return { success: true, state: next, message: `已立${child.name}为储` }
}

const buildCandidates = (state) => {
  const children = state.characters.filter((item) => (
    item.alive !== false
    && item.role === 'child'
    && (item.age >= 6 || item.id === state.designatedHeirId)
    // 皇孙只有在父/母不在时才进入继承候选，避免和父辈同列
    && (!item.cadet || !state.characters.some((parent) => (
      parent.id === item.parentIds?.[0] && parent.alive !== false
    )))
  ))
  const clan = state.characters.filter((item) => item.alive !== false && item.role === 'clan' && item.age >= 16)
  const pool = children.length > 0
    ? children
    : (clan.length > 0
      ? clan
      // 最后的兜底：无子无宗室时，权臣可被拥立
      : state.characters.filter((item) => item.alive !== false && item.age >= 16).slice(0, 3))

  return pool.map((item) => ({
    id: item.id,
    name: item.name,
    gender: item.gender,
    age: item.age,
    office: item.office,
    ability: item.ability,
    legitimacy: clamp(
      (item.role === 'child' ? 62 : 38)
        + Math.round((Number(item.age) || 0) * 0.5)
        + Math.round((Number(item.ability) || 0) * 0.15)
        + (item.id === state.designatedHeirId ? 12 : 0)
        + (Number(item.legitimacyBonus) || 0),
      10,
      98,
    ),
    score: 0,
  })).sort((a, b) => b.legitimacy - a.legitimacy)
}

const buildFactionSupport = (state) => {
  const ids = ['qingliu', 'xungui', 'bianjun', 'zongshi']
  return ids.map((id) => {
    const members = state.characters.filter((item) => item.alive !== false && item.faction === id)
    const avgLoyalty = members.length > 0
      ? members.reduce((sum, item) => sum + (Number(item.loyalty) || 0), 0) / members.length
      : 30
    return {
      id,
      name: FACTIONS[id]?.name || id,
      power: clamp(Math.round(members.length * 8 + avgLoyalty * 0.55), 5, 100),
    }
  })
}

const enterSuccession = (state) => {
  state.status = 'succession'
  state.ruler.alive = false
  state.ruler.deathMonth = getMonthIndex(state)

  const candidates = buildCandidates(state)
  const designated = candidates.find((item) => item.id === state.designatedHeirId)
  const mode = designated ? 'heir' : 'struggle'

  candidates.forEach((item) => {
    item.score = item.legitimacy + randInt(createRng(state.seed + item.name.length), 0, 8)
  })

  const factions = buildFactionSupport(state)
  state.succession = {
    mode,
    round: 0,
    candidates,
    factions,
    winnerId: designated ? designated.id : '',
    deathLog: `${state.ruler.name}崩于${state.eraName}${state.calendar.year}年${state.calendar.month}月，年${state.ruler.age}。`,
  }
  state.stats.struggles = (state.stats.struggles || 0) + (mode === 'struggle' ? 1 : 0)
  addLog(state, 'death', `${state.ruler.name}崩`, mode === 'heir'
    ? `遗诏立${designated.name}为嗣。`
    : '未留遗诏。宗室、清流、边军各执一词。')

  refreshStruggleSupport(state)
}

const refreshStruggleSupport = (state) => {
  const succession = state.succession
  const totalScore = succession.candidates.reduce((sum, item) => sum + Math.max(1, item.score), 0)
  const totalPower = succession.factions.reduce((sum, item) => sum + item.power, 0) || 1
  succession.candidates.forEach((candidate) => {
    candidate.support = Math.round((candidate.score / totalScore) * (totalPower / succession.factions.length))
  })
}

/**
 * 推进一轮争位（共三轮）
 */
export const advanceStruggle = (state) => {
  if (!state || state.status !== 'succession' || !state.succession) return state
  const next = clone(state)
  const succession = next.succession

  if (succession.mode === 'heir') {
    succession.round = 3
    succession.winnerId = next.designatedHeirId
    refreshStruggleSupport(next)
    return next
  }

  succession.round = Math.min(3, (succession.round || 0) + 1)
  const rng = createRng(next.seed + succession.round * 733 + next.calendar.year)

  succession.candidates.forEach((candidate) => {
    const bonus = randInt(rng, -6, 12) + Math.round(candidate.legitimacy * 0.08)
    candidate.score = Math.max(1, candidate.score + bonus)
  })

  if (succession.round >= 3) {
    const winner = [...succession.candidates].sort((a, b) => b.score - a.score)[0]
    succession.winnerId = winner?.id || ''
    addLog(next, 'struggle', '争位落定', `${winner?.name || '某位宗室'}在三日廷议后胜出。`)
  }

  refreshStruggleSupport(next)
  next.updatedAt = Date.now()
  return next
}

/**
 * 完成继位
 */
export const completeSuccession = (state, options = {}) => {
  if (!state || state.status !== 'succession' || !state.succession?.winnerId) {
    return { success: false, state, message: '尚未决出胜者' }
  }
  const next = clone(state)
  const winner = next.characters.find((item) => item.id === next.succession.winnerId)
  if (!winner) {
    return { success: false, state, message: '胜者数据丢失' }
  }

  const oldRuler = next.ruler
  next.pastRulers.push({
    name: oldRuler.name,
    eraName: next.eraName,
    fromYear: 1,
    toYear: next.calendar.year,
    age: oldRuler.age,
  })

  next.characters = next.characters.filter((item) => item.id !== winner.id)
  next.heirs = next.heirs.filter((id) => id !== winner.id)
  next.designatedHeirId = ''

  const eraName = String(options.eraName || '').trim() || pick(createRng(next.seed + next.generation), ERA_NAMES)
  const dynastyName = String(options.dynastyName || '').trim() || next.dynastyName

  const winnerStats = getAbilityStats(winner)
  next.generation += 1
  next.eraName = eraName
  next.dynastyName = dynastyName
  next.ruler = {
    id: winner.id,
    name: winner.name,
    gender: winner.gender,
    age: winner.age,
    health: clamp(winner.health, 20, 100),
    lifespan: winner.age + randInt(createRng(next.seed + winner.age), 26, 38),
    fertility: winner.fertility,
    prestige: clamp(next.resources.prestige, 10, 100),
    ...winnerStats,
    ability: averageAbility(winnerStats),
    tags: Array.isArray(winner.tags) ? [...winner.tags] : [],
    alive: true,
  }

  // 朝臣忠诚按新君合法性重算，不继承旧帝私交
  const legitimacyBase = next.succession.mode === 'heir' ? 8 : 2
  next.characters.forEach((item) => {
    if (item.alive === false) return
    item.loyalty = clamp(
      Math.round((Number(item.loyalty) || 50) - 10 + legitimacyBase + randInt(createRng(next.seed + item.id.length), -8, 8)),
      0,
      100,
    )
  })

  next.status = 'playing'
  next.succession = null
  next.pending = []
  next.actionPoints = next.maxActionPoints
  next.updatedAt = Date.now()

  addLog(
    next,
    'succession',
    `${winner.name}继位`,
    `改国号${dynastyName}，改元${eraName}。第${next.generation}代。`,
  )
  recordActivity(next, `${winner.name}继位，改元${eraName}`, 'succession')

  return { success: true, state: next, message: `${winner.name}继位，改元${eraName}` }
}

/* ============================================================
 * 月度推进
 * ============================================================ */

const shouldRulerDie = (state, rng) => {
  if (state.ruler.health <= 0) return true
  if (state.ruler.age >= state.ruler.lifespan) return true
  const ageRisk = Math.max(0, state.ruler.age - 40) ** 2 * 0.0005
  const healthRisk = Math.max(0, 45 - state.ruler.health) * 0.002
  return rng() < clamp(0.015 + ageRisk + healthRisk, 0.01, 0.85)
}

export const advanceMonth = (state) => {
  if (!state || state.status !== 'playing') return state

  const next = clone(state)
  ensureConspiracyFields(next)
  ensureIntakeFields(next)
  ensureBureaucracyFields(next, { generate: false })
  ensureAvatarFields(next)
  ensureAbilityStats(next)
  ensureActivityFields(next)
  ensureEventFields(next)
  ensurePalaceFields(next)
  ensureChildFields(next)
  ensureChatFields(next)
  ensureCityFields(next)
  ensureBurdenFields(next)
  const prevYear = Number(next.calendar?.year) || 1
  const prevMonth = Number(next.calendar?.month) || 1
  const treasuryBefore = Number(state.lastSummary?.treasuryAfter ?? state.resources?.treasury) || 0
  const beforeAlive = new Set(
    (next.characters || []).filter((item) => item.alive !== false).map((item) => item.id),
  )
  const beforeIds = new Set((next.characters || []).map((item) => item.id))
  const rng = createRng(Number(next.seed) + getMonthIndex(next) * 7717)

  // 1. 上旬未批的奏折
  if (Array.isArray(next.pending) && next.pending.length > 0) {
    for (const event of next.pending) {
      next.resources.prestige = clamp((next.resources.prestige || 0) - 2, 0, 100)
      next.resources.intelligence = clamp((next.resources.intelligence || 0) - 2, 0, 100)
      next.stats.missed = (next.stats.missed || 0) + 1

      // 兵变不能拖：压着不批，对方就当你默许了
      if (event.kind === 'rebellion') {
        next.ruler.health = clamp((next.ruler.health || 60) - 15, 0, 100)
        next.resources.treasury = Math.round((Number(next.resources.treasury) || 0) - 1000)
        next.resources.prestige = clamp((next.resources.prestige || 0) - 6, 0, 100)
        next.rumors.unshift({
          id: `rumor_rebel_missed_${getMonthIndex(next)}`,
          year: next.calendar.year,
          month: next.calendar.month,
          text: '兵变无人处置。宫门换了守卫，朝臣开始称病不朝。',
          characterId: '',
          revealed: true,
          plot: 100,
        })
      }

      next.archive.unshift({ ...event, resolved: true, missed: true, choiceText: '未批' })
    }
    next.archive = next.archive.slice(0, MAX_ARCHIVE)
    addLog(next, 'missed', '奏折积压', `${next.pending.length}份奏折未批，威望与圣听受损。`)
    next.pending = []
  }

  // 2. 时间推进
  next.calendar.month += 1
  let yearChanged = false
  if (next.calendar.month > 12) {
    next.calendar.month = 1
    next.calendar.year += 1
    yearChanged = true
    next.ruler.age += 1
    next.ruler.health = clamp(next.ruler.health - (next.ruler.age > 40 ? 2 : 1), 0, 100)

    // 所有人同步长一岁；年长者健康缓慢下滑
    for (const character of next.characters) {
      if (character.alive === false) continue
      character.age = (Number(character.age) || 0) + 1
      if (character.age > 55) {
        character.health = clamp((Number(character.health) || 60) - 1, 0, 100)
        if (character.health <= 0 && character.role !== 'consort') {
          recordDeath(next, character, 'age', {
            desc: `${character.office || ''}${character.name}寿终，年${character.age}。`,
          })
        }
      }
    }
  }

  // 3. 收支与民心
  const income = computeMonthlyIncome(next)
  next.resources.treasury = clamp(
    Math.round((Number(next.resources.treasury) || 0) + income.net),
    -999999,
    9999999,
  )

  const targetPopularity = clamp(
    45 + Math.round((Number(next.resources.prestige) || 0) * 0.35),
    20,
    85,
  )
  let popularityDelta = 0
  if (next.resources.treasury < 2000) popularityDelta = -2
  else if (next.resources.popularity < targetPopularity) popularityDelta = 1
  else if (next.resources.popularity > targetPopularity + 15) popularityDelta = -2
  else if (next.resources.popularity > targetPopularity + 6) popularityDelta = -1
  next.resources.popularity = clamp((next.resources.popularity || 0) + popularityDelta, 0, 100)

  // 4. 怀孕与生产
  if (Array.isArray(next.pregnancies) && next.pregnancies.length > 0) {
    const due = next.pregnancies.filter((item) => getMonthIndex(next) >= item.dueMonth)
    next.pregnancies = next.pregnancies.filter((item) => getMonthIndex(next) < item.dueMonth)
    for (const pregnancy of due) {
      deliverChild(next, pregnancy, rng)
    }
  }

  // 4.5 生死：疾病、意外、暗杀（先结算，避免新事件引用已死的人）
  ensureMortalityFields(next)
  ensureAppointmentFields(next)
  ensureBureaucracyFields(next, { generate: false })
  const deathEvents = tickMortality(next, rng)
  tickBureaucracy(next, rng)

  // 5. 本月奏折 + 后宫事件
  const event = rollMonthlyEvent(next, rng, getMonthIndex(next))
  next.pending = [event]
  next.recentEventIds = [...(next.recentEventIds || []), event.eventId].slice(-10)

  // 之前选择埋下的后续事件
  const dueScheduled = (next.scheduledEvents || []).filter((item) => item.dueMonth <= getMonthIndex(next))
  next.scheduledEvents = (next.scheduledEvents || []).filter((item) => item.dueMonth > getMonthIndex(next))
  for (const scheduled of dueScheduled) {
    const followUp = createEventById(next, scheduled.eventId, rng, scheduled.context || {})
    if (followUp) next.pending.push(followUp)
  }

  // 固定每 3 个月一段剧情
  const scene = rollScene(next, rng, getMonthIndex(next))
  if (scene) next.pending.push(scene)

  const childEvents = tickChildren(next, rng, getMonthIndex(next))
  if (childEvents.length > 0) next.pending.push(...childEvents)

  const haremEvent = rollHaremEvent(next, rng)
  if (haremEvent) {
    next.pending.push(haremEvent)
    next.stats.haremEvents = (next.stats.haremEvents || 0) + 1
  }

  // 隐藏的私人图谋：结党、贪墨、兵变
  const conspiracyEvents = tickConspiracies(next, rng)
  if (conspiracyEvents.length > 0) {
    next.pending.push(...conspiracyEvents)
  }

  // 臣属进献与耳边风
  const giftEvent = rollGiftConsortEvent(next, rng)
  if (giftEvent) next.pending.push(giftEvent)
  const whisperEvent = tickWhispers(next, rng)
  if (whisperEvent) next.pending.push(whisperEvent)

  if (deathEvents.length > 0) {
    next.pending.push(...deathEvents)
  }

  const localReport = rollLocalReportEvent(next, rng)
  if (localReport) next.pending.push(localReport)

  const reviewEvent = rollTriennialReviewEvent(next, rng)
  if (reviewEvent) next.pending.push(reviewEvent)

  // 6. 行动点与统计
  next.actionPoints = next.maxActionPoints
  next.stats.months = (next.stats.months || 0) + 1

  addLog(
    next,
    'month',
    `${next.eraName}${next.calendar.year}年${next.calendar.month}月`,
    `税入 ${income.tax}，官俸 ${income.salary}，后宫 ${income.harem}，行政 ${income.adminCost}，军饷 ${income.armyUpkeep}，净 ${income.net > 0 ? '+' : ''}${income.net}。`,
  )

  // 7. 压力、特质、领地 debuff 月度结算；必须在死亡判定之前
  tickBurdens(next)

  // 8. 死亡判定：健康归零随时崩；寿元与年岁只在跨年时判
  const healthDead = (Number(next.ruler.health) || 0) <= 0
  if (next.status === 'playing' && (healthDead || (yearChanged && shouldRulerDie(next, rng)))) {
    enterSuccession(next)
  }

  resetPalaceForMonth(next)
  const activities = getActivitiesForMonth(next, prevYear, prevMonth)
  const deaths = (next.characters || [])
    .filter((item) => beforeAlive.has(item.id) && item.alive === false)
    .map((item) => ({ name: item.name, office: item.office || '', cause: item.deathCause || '' }))
  const newCharacters = (next.characters || [])
    .filter((item) => !beforeIds.has(item.id))
    .map((item) => ({ name: item.name, office: item.office || '', role: item.roleLabel || '' }))

  next.lastSummary = {
    year: next.calendar.year,
    month: next.calendar.month,
    finance: income,
    activities,
    deaths,
    newCharacters,
    newEvents: (next.pending || []).map((item) => item.title),
    treasuryBefore,
    treasuryAfter: next.resources.treasury,
    generation: next.generation,
  }

  next.updatedAt = Date.now()
  return next
}

/* ============================================================
 * 查询辅助
 * ============================================================ */

const normalizeName = (value, maxLength = 12) => (
  String(value || '').replace(/\s+/g, '').trim().slice(0, maxLength)
)

/**
 * 改人物名；也支持改当前君主（君主不在 characters 里）
 */
export const renameCharacter = (state, characterId, rawName) => {
  if (!state) return { success: false, state, message: '存档不存在' }
  const name = normalizeName(rawName, 12)
  if (!name) return { success: false, state, message: '名字不能为空' }

  const isRuler = state.ruler?.id === characterId
  const character = (state.characters || []).find((item) => item.id === characterId)
  if (!character && !isRuler) {
    return { success: false, state, message: '找不到此人' }
  }

  const duplicated = (state.characters || []).some((item) => (
    item.id !== characterId && item.name === name
  )) || (!isRuler && state.ruler?.name === name)
  if (duplicated) {
    return { success: false, state, message: '这个名字已经有人用了' }
  }

  const currentName = character?.name || (isRuler ? state.ruler?.name : '')
  if (currentName === name) {
    return { success: true, state, message: '名字未变' }
  }

  const next = clone(state)
  const target = (next.characters || []).find((item) => item.id === characterId)
  const oldName = target?.name || next.ruler?.name || ''

  if (target) target.name = name
  if (isRuler && next.ruler) next.ruler.name = name

  // 同步引用关系里的名字副本
  for (const item of next.characters || []) {
    if (item.patronId === characterId) item.patronName = name
    if (item.recommendedById === characterId) item.recommendedByName = name
    if (item.examMasterId === characterId) item.examMasterName = name
  }
  for (const candidate of next.succession?.candidates || []) {
    if (candidate.id === characterId) candidate.name = name
  }
  for (const candidate of next.selection?.candidates || []) {
    if (candidate.id === characterId) candidate.name = name
  }
  for (const candidate of next.examPool || []) {
    if (candidate.id === characterId) candidate.name = name
  }

  addLog(next, 'rename', `${oldName}改名${name}`, `旧名${oldName}，今名${name}。`)
  recordActivity(next, `将${oldName}改名为${name}`, 'rename')
  next.updatedAt = Date.now()
  return { success: true, state: next, message: `已改名为${name}` }
}

export const renameDynasty = (state, rawName) => {
  if (!state) return { success: false, state, message: '存档不存在' }
  const name = normalizeName(rawName, 8)
  if (!name) return { success: false, state, message: '国号不能为空' }
  if (name === state.dynastyName) return { success: true, state, message: '国号未变' }

  const next = clone(state)
  const oldName = next.dynastyName
  next.dynastyName = name
  addLog(next, 'rename', `改国号为${name}`, `旧国号${oldName}。`)
  recordActivity(next, `改国号为${name}`, 'rename')
  next.updatedAt = Date.now()
  return { success: true, state: next, message: `国号已改为${name}` }
}

export const renameEra = (state, rawName) => {
  if (!state) return { success: false, state, message: '存档不存在' }
  const name = normalizeName(rawName, 6)
  if (!name) return { success: false, state, message: '年号不能为空' }
  if (name === state.eraName) return { success: true, state, message: '年号未变' }

  const next = clone(state)
  const oldName = next.eraName
  next.eraName = name
  addLog(next, 'rename', `改元${name}`, `旧年号${oldName}，改元${name}。`)
  recordActivity(next, `改元${name}`, 'rename')
  next.updatedAt = Date.now()
  return { success: true, state: next, message: `年号已改为${name}` }
}

export const formatCalendar = (state) => {
  if (!state?.calendar) return ''
  return `${state.eraName}${state.calendar.year}年 ${state.calendar.month}月`
}

export const getAliveCharacters = (state, role = '') => {
  const list = Array.isArray(state?.characters) ? state.characters : []
  return list.filter((item) => item.alive !== false && (!role || item.role === role))
}

export const getRoleGroups = (state) => (
  ['minister', 'clan', 'consort', 'servant', 'child'].map((role) => ({
    role,
    items: getAliveCharacters(state, role),
  }))
)

export const summarizeRun = (state) => ({
  id: state.id,
  dynastyName: state.dynastyName,
  eraName: state.eraName,
  generation: state.generation,
  year: state.calendar?.year || 1,
  month: state.calendar?.month || 1,
  rulerName: state.ruler?.name || '',
  rulerAge: state.ruler?.age || 16,
  status: state.status,
  updatedAt: state.updatedAt || 0,
})

export const purgeCharacterById = (state, characterId) => {
  const next = clone(state)
  const result = purgeConspiracyTarget(next, characterId)
  if (!result.success) return { success: false, state, message: result.message }
  next.updatedAt = Date.now()
  return { success: true, state: next, message: result.message }
}

export const getPregnancyProgress = (state, pregnancy) => {
  const total = Math.max(1, pregnancy.dueMonth - pregnancy.startMonth)
  const elapsed = Math.max(0, getMonthIndex(state) - pregnancy.startMonth)
  return {
    elapsed,
    total,
    percent: clamp(Math.round((elapsed / total) * 100), 0, 100),
    remaining: Math.max(0, pregnancy.dueMonth - getMonthIndex(state)),
  }
}
