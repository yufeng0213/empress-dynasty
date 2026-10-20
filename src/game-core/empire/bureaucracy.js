/**
 * 官制：科举、品级、升迁、地方官与地方奏报
 *
 * 中央官与地方官共用一套人物数据，只是 postType/region 不同。
 * 地方官按月产税，也会因为考成、民心、治安产生奏报。
 */

import { clamp, createRng, randInt } from './random.js'
import { generateOfficialCharacter, getCharacterStat } from './characters.js'
import { recordActivity } from './activity.js'

export const REGION_DEFS = [
  { id: 'jiangnan', name: '江南', taxBase: 440, population: 1400000, desc: '鱼米之乡，赋税重地' },
  { id: 'guanzhong', name: '关中', taxBase: 340, population: 1100000, desc: '京畿门户，士绅众多' },
  { id: 'beijiang', name: '北境', taxBase: 260, population: 700000, desc: '边军驻地，民风悍勇' },
  { id: 'lingnan', name: '岭南', taxBase: 240, population: 600000, desc: '瘴疠之地，商路要冲' },
  { id: 'xiyu', name: '西域', taxBase: 180, population: 300000, desc: '互市口岸，胡汉杂处' },
]

// 每月人口税率（抽象的“田赋+商税”综合税率）
export const POPULATION_TAX_RATE = 0.0004
export const REGION_ADMIN_COST = 60

export const RANK_LABELS = {
  1: '正一品',
  2: '从一品',
  3: '正二品',
  4: '从二品',
  5: '正三品',
  6: '从三品',
  7: '正四品',
  8: '从四品',
  9: '正五品',
}

export const EXAM_COST = 500
export const EXAM_RANKS = ['状元', '榜眼', '探花']

const CENTRAL_OFFICES = {
  1: ['太师', '太傅', '太保'],
  2: ['尚书令', '中书令', '门下侍中'],
  3: ['吏部尚书', '户部尚书', '礼部尚书', '兵部尚书', '刑部尚书', '工部尚书'],
  4: ['吏部侍郎', '户部侍郎', '礼部侍郎', '兵部侍郎', '御史中丞', '大理寺卿'],
  5: ['吏部郎中', '户部郎中', '礼部郎中', '兵部郎中', '侍御史'],
  6: ['主事', '监察御史', '太学博士', '秘书郎'],
  7: ['主事', '都事', '经历'],
  8: ['录事', '参军', '典史'],
  9: ['吏员', '书吏'],
}

const LOCAL_OFFICE_BY_RANK = {
  1: '总督',
  2: '总督',
  3: '总督',
  4: '巡抚',
  5: '巡抚',
  6: '知府',
  7: '知府',
  8: '县令',
  9: '县令',
}

/**
 * 按新品的品级换一个具体官职名；中央官尽量避开重名
 */
export const getOfficeForRank = (state, character, rank) => {
  const targetRank = clamp(Number(rank) || 5, 1, 9)
  if (character?.postType === 'local') {
    const regionName = character.regionName || '地方'
    return `${regionName}${LOCAL_OFFICE_BY_RANK[targetRank] || '知府'}`
  }

  const used = new Set(
    (state?.characters || [])
      .filter((item) => item.alive !== false && item.id !== character?.id)
      .map((item) => item.office),
  )
  const pool = CENTRAL_OFFICES[targetRank] || ['主事']
  const available = pool.find((title) => !used.has(title))
  return available || `${pool[0]}（加衔）`
}

const getMonthIndex = (state) => (
  ((Number(state?.calendar?.year) || 1) - 1) * 12 + (Number(state?.calendar?.month) || 1)
)

const clone = (value) => JSON.parse(JSON.stringify(value))

export const getRankLabel = (rank) => RANK_LABELS[Number(rank)] || '未入流'

const addRumor = (state, text, options = {}) => {
  if (!Array.isArray(state.rumors)) state.rumors = []
  const { year, month } = {
    year: Number(state?.calendar?.year) || 1,
    month: Number(state?.calendar?.month) || 1,
  }
  state.rumors.unshift({
    id: `rumor_local_${year}_${month}_${state.rumors.length + 1}`,
    year,
    month,
    text: String(text || '').trim(),
    characterId: options.characterId || '',
    revealed: Boolean(options.revealed),
    plot: 0,
  })
  state.rumors = state.rumors.slice(0, 60)
}

const createGovernor = (state, region, rng) => {
  const governor = generateOfficialCharacter(rng, {
    role: 'minister',
    office: `${region.name}刺史`,
    rank: randInt(rng, 4, 5),
    postType: 'local',
    region: region.id,
    regionName: region.name,
    faction: 'hanmen',
    factionName: '寒门',
    id: `dyn_local_${region.id}_${Math.floor(rng() * 99999)}`,
  })
  governor.source = 'appointment'
  return governor
}

/**
 * 初始化/补齐官制字段。generate=true 时给空缺地区补一名刺史（仅开局迁移用）
 */
export const ensureBureaucracyFields = (state, options = {}) => {
  if (!state) return state
  if (!Array.isArray(state.regions) || state.regions.length === 0) {
    state.regions = REGION_DEFS.map((def) => ({
      id: def.id,
      name: def.name,
      taxBase: def.taxBase,
      population: def.population,
      desc: def.desc,
      unrest: randInt(createRng(Number(state.seed) + def.id.length), 15, 35),
      governorId: '',
      lastReportMonth: 0,
    }))
    state.regionsInitialized = false
  }

  // 老存档补人口
  for (const region of state.regions) {
    if (typeof region.population !== 'number') {
      region.population = REGION_DEFS.find((def) => def.id === region.id)?.population || 300000
    }
  }
  if (!Array.isArray(state.examPool)) state.examPool = []
  if (typeof state.lastExamMonth !== 'number') state.lastExamMonth = 0
  if (typeof state.lastLocalReportMonth !== 'number') state.lastLocalReportMonth = 0
  if (typeof state.lastReviewMonth !== 'number') state.lastReviewMonth = 0
  if (typeof state.regionsInitialized !== 'boolean') state.regionsInitialized = false
  if (!state.stats) state.stats = {}
  if (typeof state.stats.exams !== 'number') state.stats.exams = 0
  if (typeof state.stats.promotions !== 'number') state.stats.promotions = 0
  if (typeof state.stats.localReports !== 'number') state.stats.localReports = 0
  if (typeof state.stats.reviews !== 'number') state.stats.reviews = 0
  if (typeof state.stats.recommendations !== 'number') state.stats.recommendations = 0
  if (typeof state.stats.transfers !== 'number') state.stats.transfers = 0

  for (const character of state.characters || []) {
    if (typeof character.rank !== 'number') {
      character.rank = character.role === 'minister' ? 4
        : character.role === 'clan' ? 3
          : character.role === 'servant' ? 6 : 0
    }
    if (typeof character.postType !== 'string') character.postType = 'central'
    if (typeof character.region !== 'string') character.region = ''
    if (typeof character.regionName !== 'string') character.regionName = ''
    if (typeof character.tenureMonths !== 'number') character.tenureMonths = 0
    if (typeof character.performance !== 'number') character.performance = randInt(createRng(character.id.length + 7), 45, 80)
    if (typeof character.examCohort !== 'number') character.examCohort = 0
    if (typeof character.examMasterId !== 'string') character.examMasterId = ''
    if (typeof character.examMasterName !== 'string') character.examMasterName = ''
    if (typeof character.recommendedById !== 'string') character.recommendedById = ''
    if (typeof character.recommendedByName !== 'string') character.recommendedByName = ''
    if (typeof character.lastRecommendMonth !== 'number') character.lastRecommendMonth = 0
  }

  if (!state.regionsInitialized && options.generate !== false) {
    const rng = createRng(Number(state.seed) + 913)
    for (const region of state.regions) {
      if (region.governorId) continue
      const governor = createGovernor(state, region, rng)
      state.characters.push(governor)
      region.governorId = governor.id
    }
    state.regionsInitialized = true
  }

  return state
}

export const getRegionGovernor = (state, region) => (
  (state?.characters || []).find((item) => item.id === region?.governorId && item.alive !== false) || null
)

export const getTotalPopulation = (state) => (
  (state?.regions || []).reduce((sum, region) => sum + (Number(region.population) || 0), 0)
)

export const computeRegionalTax = (state) => {
  const regions = Array.isArray(state?.regions) ? state.regions : []
  let total = 0
  for (const region of regions) {
    const governor = getRegionGovernor(state, region)
    if (!governor) continue
    const population = Number(region.population) || 0
    if (population <= 0) continue
    const corruption = clamp((Number(governor.plot) || 0) / 400, 0, 0.3)
    const civil = getCharacterStat(governor, 'civil')
    const finance = getCharacterStat(governor, 'finance')
    const efficiency = clamp(
      0.55
        + (civil * 0.6 + finance * 0.4) / 200
        + (Number(governor.performance) || 50) / 500
        - (Number(region.unrest) || 0) / 250,
      0.3,
      1.35,
    )
    total += Math.round(population * POPULATION_TAX_RATE * (1 - corruption) * efficiency)
  }
  return total
}

export const computeAdministrativeCost = (state) => (
  (state?.regions || []).length * REGION_ADMIN_COST
  + Math.round(getTotalPopulation(state) * 0.00001)
)

export const computeArmyUpkeep = (state) => (
  Math.round((Number(state?.resources?.military) || 0) * 8)
)

/**
 * 每月官制结算：考成、治安、任期
 */
export const tickBureaucracy = (state, rng) => {
  ensureBureaucracyFields(state, { generate: false })
  for (const character of state.characters || []) {
    if (character.alive === false || !character.rank) continue
    character.tenureMonths = (Number(character.tenureMonths) || 0) + 1
    const civil = getCharacterStat(character, 'civil')
    const finance = getCharacterStat(character, 'finance')
    const drift = (civil + finance) / 80
      - (Number(character.ambition) || 50) / 80
      + (Number(character.loyalty) || 50) / 100
      - 1.5
    character.performance = clamp(Math.round((Number(character.performance) || 50) + drift), 0, 100)
  }

  for (const region of state.regions || []) {
    const governor = getRegionGovernor(state, region)
    if (!governor) {
      region.governorId = ''
      region.unrest = clamp((Number(region.unrest) || 0) + 3, 0, 100)
      continue
    }
    const adminSkill = (getCharacterStat(governor, 'civil') + getCharacterStat(governor, 'finance')) / 2
    const loyalty = Number(governor.loyalty) || 50
    const performance = Number(governor.performance) || 50
    const drift = (100 - adminSkill) / 60
      + ((Number(governor.ambition) || 50) > 70 ? 0.6 : 0)
      - loyalty / 60
      - performance / 100
    region.unrest = clamp((Number(region.unrest) || 0) + drift, 0, 100)

    // 人口随民心、治安缓慢变动
    const popularity = Number(state.resources?.popularity) || 50
    const growth = 0.0004 + (popularity - 50) / 200000 - region.unrest / 120000
    const population = Number(region.population) || 0
    region.population = Math.max(50000, Math.round(population * (1 + growth)))

    if (region.unrest >= 70 && rng() < 0.2) {
      addRumor(state, `${region.name}流民聚集，地方请赈。`, { characterId: governor.id })
    }
  }

  return state
}

/**
 * 地方奏报：每 5 个月最多一次
 */
export const rollLocalReportEvent = (state, rng) => {
  ensureBureaucracyFields(state, { generate: false })
  const monthIndex = getMonthIndex(state)
  if (monthIndex - (state.lastLocalReportMonth || 0) < 5) return null
  if (rng() > 0.5) return null

  const regions = (state.regions || []).map((region) => ({
    region,
    governor: getRegionGovernor(state, region),
  })).filter((item) => item.governor)
  if (regions.length === 0) return null

  const target = regions.sort((a, b) => (b.region.unrest || 0) - (a.region.unrest || 0))[0]
  const { region, governor } = target
  state.lastLocalReportMonth = monthIndex
  state.stats.localReports += 1

  const corruption = clamp((Number(governor.plot) || 0) / 400, 0, 0.3)
  const civil = getCharacterStat(governor, 'civil')
  const finance = getCharacterStat(governor, 'finance')
  const efficiency = clamp(
    0.55
      + (civil * 0.6 + finance * 0.4) / 200
      + (Number(governor.performance) || 50) / 500
      - (Number(region.unrest) || 0) / 250,
    0.3,
    1.35,
  )
  const tax = Math.round(
    (Number(region.population) || 0) * POPULATION_TAX_RATE * (1 - corruption) * efficiency,
  )
  const unrest = Math.round(Number(region.unrest) || 0)

  return {
    instanceId: `local_report_${monthIndex}_${region.id}`,
    eventId: 'local_report',
    kind: 'local',
    title: `${region.name}奏报`,
    source: '地方',
    text: `${region.name}刺史${governor.name}上奏：本月税赋约${tax}贯，境内治安${unrest >= 60 ? '不靖，盗匪渐多' : (unrest >= 35 ? '尚可，偶有流民' : '平稳')}。${unrest >= 60 ? '请陛下示下。' : '臣请循例入觐。'}`,
    year: state.calendar?.year || 1,
    month: state.calendar?.month || 1,
    resolved: false,
    missed: false,
    choices: [
      {
        id: 'praise',
        text: `嘉奖${governor.name}`,
        hint: `${governor.name}好感 +8 · 威望 +1`,
        effects: [
          { target: 'character', id: governor.id, key: 'loyalty', value: 8 },
          { target: 'character', id: governor.id, key: 'performance', value: 5 },
          { target: 'resource', key: 'prestige', value: 1 },
        ],
        resultText: `嘉奖的旨意送到${region.name}。${governor.name}回了一道谢恩折子。`,
      },
      {
        id: 'blame',
        text: '问责，限期整顿',
        hint: `好感 -6 · 治安 +8 · 威望 +2`,
        effects: [
          { target: 'character', id: governor.id, key: 'loyalty', value: -6 },
          { target: 'character', id: governor.id, key: 'ambition', value: -5 },
          { target: 'character', id: governor.id, key: 'performance', value: 8 },
          { target: 'regionUnrest', regionId: region.id, value: -8 },
          { target: 'resource', key: 'prestige', value: 2 },
        ],
        resultText: `${governor.name}挨了一顿申斥，回去就清了几个县的积案。`,
      },
      {
        id: 'fund',
        text: '拨银赈济',
        hint: '国库 -400 · 治安 +12 · 民心 +2',
        effects: [
          { target: 'resource', key: 'treasury', value: -400 },
          { target: 'regionUnrest', regionId: region.id, value: -12 },
          { target: 'character', id: governor.id, key: 'loyalty', value: 5 },
          { target: 'resource', key: 'popularity', value: 2 },
        ],
        resultText: `银子拨下去了。${region.name}的流民散了一些。`,
      },
    ],
  }
}

/**
 * 开科取士：考生进入候补池
 */
export const startExam = (state, options = {}) => {
  if (!state || state.status !== 'playing') {
    return { success: false, state, message: '当前无法开科' }
  }
  ensureBureaucracyFields(state, { generate: false })
  const monthIndex = getMonthIndex(state)
  if (state.lastExamMonth && monthIndex - state.lastExamMonth < 12) {
    return { success: false, state, message: '距上科不足一年' }
  }
  if ((Number(state.resources?.treasury) || 0) < EXAM_COST) {
    return { success: false, state, message: `国库不足 ${EXAM_COST} 贯` }
  }

  const next = clone(state)
  const rng = createRng(Number(options.seed) || (Date.now() + monthIndex * 53))
  const usedNames = new Set((next.characters || []).map((item) => item.name))

  // 主考官 = 朝中能力最高的官员，成为新科进士的座师
  const master = (next.characters || [])
    .filter((item) => item.alive !== false && Number(item.rank) > 0 && (item.role === 'minister' || item.role === 'clan'))
    .sort((a, b) => (Number(b.ability) || 0) - (Number(a.ability) || 0))[0] || null

  const candidates = Array.from({ length: 3 }, (_, index) => {
    const candidate = generateOfficialCharacter(rng, {
      role: 'minister',
      office: '新科进士',
      rank: 8,
      postType: 'none',
      faction: 'hanmen',
      factionName: '寒门',
      id: `dyn_exam_${monthIndex}_${index + 1}_${Math.floor(rng() * 99999)}`,
      usedNames,
      abilityFloor: 68,
      examCohort: next.calendar?.year || 1,
      examMasterId: master?.id || '',
      examMasterName: master?.name || '',
      recommendedById: master?.id || '',
      recommendedByName: master?.name || '',
    })
    candidate.source = 'exam'
    candidate.examRank = EXAM_RANKS[index] || '进士'
    candidate.age = randInt(rng, 18, 30)
    candidate.loyalty = randInt(rng, 62, 92)
    candidate.ambition = randInt(rng, 18, 70)
    candidate.tags = ['新科', candidate.examRank]
    if (master) candidate.tags.push(`${master.name}门生`)
    return candidate
  })

  next.examPool = [...(next.examPool || []), ...candidates].slice(-9)
  next.resources.treasury = Math.round((Number(next.resources.treasury) || 0) - EXAM_COST)
  next.lastExamMonth = monthIndex
  next.stats.exams += 1
  recordActivity(next, `开科取士（-${EXAM_COST}贯），取中${candidates.map((item) => item.examRank).join('、')}`, 'exam')
  next.updatedAt = Date.now()

  return { success: true, state: next, message: `取中${candidates.map((item) => item.examRank).join('、')}，已入候补` }
}

/**
 * 升迁 / 贬黜
 */
export const changeRank = (state, characterId, direction) => {
  if (!state || state.status !== 'playing') {
    return { success: false, state, message: '当前无法调动' }
  }
  if ((state.actionPoints || 0) <= 0) {
    return { success: false, state, message: '本旬行动点已用完' }
  }
  const character = (state.characters || []).find((item) => item.id === characterId && item.alive !== false)
  if (!character || !character.rank) {
    return { success: false, state, message: '此人没有官身' }
  }

  const next = clone(state)
  const target = next.characters.find((item) => item.id === characterId)
  const isUp = direction === 'up'
  if (isUp && target.rank <= 1) return { success: false, state, message: '已是正一品' }
  if (!isUp && target.rank >= 9) return { success: false, state, message: '已是最低品级' }

  const oldOffice = target.office
  target.rank = isUp ? target.rank - 1 : target.rank + 1
  target.loyalty = clamp((Number(target.loyalty) || 0) + (isUp ? 6 : -8), 0, 100)
  target.ambition = clamp((Number(target.ambition) || 0) + (isUp ? 3 : 5), 0, 100)
  target.performance = clamp((Number(target.performance) || 0) + (isUp ? 4 : -4), 0, 100)
  target.office = getOfficeForRank(next, target, target.rank)
  next.actionPoints = Math.max(0, (next.actionPoints || 0) - 1)
  next.stats.promotions += 1
  next.log.push({
    id: `log_${next.calendar.year}_${next.calendar.month}_rank_${next.log.length + 1}`,
    year: next.calendar.year,
    month: next.calendar.month,
    type: 'rank',
    title: `${target.name}${isUp ? '升迁' : '贬黜'}`,
    desc: `由${oldOffice}改授${target.office}（${getRankLabel(target.rank)}）。`,
  })
  if (next.log.length > 500) next.log = next.log.slice(-500)
  recordActivity(next, `${isUp ? '升迁' : '贬黜'}${target.name}为${target.office}`, 'rank')
  next.updatedAt = Date.now()

  return {
    success: true,
    state: next,
    message: `${target.name}${isUp ? '升' : '贬'}为${target.office}（${getRankLabel(target.rank)}）`,
  }
}

/**
 * 召见 / 嘉奖 / 申斥地方官
 */
export const interactGovernor = (state, regionId, action) => {
  if (!state || state.status !== 'playing') {
    return { success: false, state, message: '当前无法召见' }
  }
  const region = (state.regions || []).find((item) => item.id === regionId)
  const governor = getRegionGovernor(state, region)
  if (!region || !governor) {
    return { success: false, state, message: '此地暂无主官' }
  }
  if (action === 'audience' && (state.actionPoints || 0) <= 0) {
    return { success: false, state, message: '本旬行动点已用完' }
  }

  const next = clone(state)
  const targetRegion = next.regions.find((item) => item.id === regionId)
  const target = next.characters.find((item) => item.id === governor.id)
  if (action === 'audience') {
    next.actionPoints -= 1
    target.loyalty = clamp((target.loyalty || 0) + 5, 0, 100)
    next.resources.intelligence = clamp((next.resources.intelligence || 0) + 1, 0, 100)
  } else if (action === 'reward') {
    next.resources.treasury = Math.round((next.resources.treasury || 0) - 150)
    target.loyalty = clamp((target.loyalty || 0) + 8, 0, 100)
  } else if (action === 'reprimand') {
    target.loyalty = clamp((target.loyalty || 0) - 6, 0, 100)
    target.ambition = clamp((target.ambition || 0) - 5, 0, 100)
    target.performance = clamp((target.performance || 0) + 4, 0, 100)
    targetRegion.unrest = clamp((targetRegion.unrest || 0) - 3, 0, 100)
  } else {
    return { success: false, state, message: '未知操作' }
  }

  const actionLabel = action === 'audience' ? '召见' : (action === 'reward' ? '嘉奖' : '申斥')
  const costLabel = action === 'reward' ? '（-150贯）' : ''
  recordActivity(next, `${actionLabel}${target.name}${costLabel}`, 'governor')
  next.updatedAt = Date.now()
  return {
    success: true,
    state: next,
    message: `${actionLabel}${target.name}`,
  }
}

/**
 * 令官员举荐一人：进入候补池，并带上举荐人
 */
export const recommendCandidate = (state, patronId) => {
  if (!state || state.status !== 'playing') {
    return { success: false, state, message: '当前无法举荐' }
  }
  if ((state.actionPoints || 0) <= 0) {
    return { success: false, state, message: '本旬行动点已用完' }
  }
  const patron = (state.characters || []).find((item) => item.id === patronId && item.alive !== false)
  if (!patron || !patron.rank) {
    return { success: false, state, message: '此人没有举荐资格' }
  }

  const monthIndex = getMonthIndex(state)
  if ((patron.lastRecommendMonth || 0) > 0 && monthIndex - patron.lastRecommendMonth < 12) {
    return { success: false, state, message: '此人今年已经举荐过了' }
  }

  const next = clone(state)
  const target = next.characters.find((item) => item.id === patronId)
  const rng = createRng(Number(next.seed) + monthIndex * 37 + patronId.length)
  const usedNames = new Set((next.characters || []).map((item) => item.name))
  const candidate = generateOfficialCharacter(rng, {
    role: 'minister',
    office: '待铨',
    rank: 8,
    postType: 'none',
    faction: patron.faction,
    factionName: patron.factionName,
    id: `dyn_recommend_${monthIndex}_${Math.floor(rng() * 99999)}`,
    usedNames,
    abilityFloor: 55,
    recommendedById: patron.id,
    recommendedByName: patron.name,
  })
  candidate.source = 'recommend'
  candidate.age = randInt(rng, 20, 40)
  candidate.tags = ['举荐', `${patron.name}门生`]

  next.examPool = [...(next.examPool || []), candidate].slice(-9)
  target.lastRecommendMonth = monthIndex
  target.loyalty = clamp((Number(target.loyalty) || 0) + 3, 0, 100)
  target.ambition = clamp((Number(target.ambition) || 0) + 2, 0, 100)
  next.actionPoints = Math.max(0, (next.actionPoints || 0) - 1)
  next.stats.recommendations += 1
  next.log.push({
    id: `log_${next.calendar.year}_${next.calendar.month}_recommend_${next.log.length + 1}`,
    year: next.calendar.year,
    month: next.calendar.month,
    type: 'recommend',
    title: `${target.name}举荐${candidate.name}`,
    desc: `${candidate.name}已入候补。若此人日后获罪，举荐人难辞其咎。`,
  })
  if (next.log.length > 500) next.log = next.log.slice(-500)
  recordActivity(next, `${target.name}举荐${candidate.name}`, 'recommend')
  next.updatedAt = Date.now()

  return {
    success: true,
    state: next,
    message: `${target.name}举荐${candidate.name}，已入候补`,
  }
}

/**
 * 地方官对调
 */
export const transferGovernor = (state, fromRegionId, toRegionId) => {
  if (!state || state.status !== 'playing') {
    return { success: false, state, message: '当前无法调任' }
  }
  if (fromRegionId === toRegionId) {
    return { success: false, state, message: '不能调往原地' }
  }
  if ((state.actionPoints || 0) <= 0) {
    return { success: false, state, message: '本旬行动点已用完' }
  }

  const fromRegion = (state.regions || []).find((item) => item.id === fromRegionId)
  const toRegion = (state.regions || []).find((item) => item.id === toRegionId)
  const fromGovernor = getRegionGovernor(state, fromRegion)
  const toGovernor = getRegionGovernor(state, toRegion)
  if (!fromRegion || !toRegion || !fromGovernor || !toGovernor) {
    return { success: false, state, message: '两地都需要有主官才能对调' }
  }

  const next = clone(state)
  const nextFrom = next.regions.find((item) => item.id === fromRegionId)
  const nextTo = next.regions.find((item) => item.id === toRegionId)
  const charA = next.characters.find((item) => item.id === fromGovernor.id)
  const charB = next.characters.find((item) => item.id === toGovernor.id)

  nextFrom.governorId = charB.id
  nextTo.governorId = charA.id
  charA.region = nextTo.id
  charA.regionName = nextTo.name
  charB.region = nextFrom.id
  charB.regionName = nextFrom.name
  const officeA = charA.office
  charA.office = charB.office
  charB.office = officeA
  charA.loyalty = clamp((Number(charA.loyalty) || 0) - 2, 0, 100)
  charB.loyalty = clamp((Number(charB.loyalty) || 0) - 2, 0, 100)
  charA.performance = clamp((Number(charA.performance) || 0) + 2, 0, 100)
  charB.performance = clamp((Number(charB.performance) || 0) + 2, 0, 100)

  next.actionPoints = Math.max(0, (next.actionPoints || 0) - 1)
  next.stats.transfers += 1
  next.log.push({
    id: `log_${next.calendar.year}_${next.calendar.month}_transfer_${next.log.length + 1}`,
    year: next.calendar.year,
    month: next.calendar.month,
    type: 'transfer',
    title: `${charA.name}与${charB.name}对调`,
    desc: `${charA.name}调${nextTo.name}，${charB.name}调${nextFrom.name}。`,
  })
  if (next.log.length > 500) next.log = next.log.slice(-500)
  recordActivity(next, `${charA.name}与${charB.name}对调`, 'transfer')
  next.updatedAt = Date.now()

  return { success: true, state: next, message: `${charA.name}与${charB.name}已对调` }
}

/**
 * 三年京察：每 36 个月一次
 */
export const rollTriennialReviewEvent = (state, rng) => {
  ensureBureaucracyFields(state, { generate: false })
  const monthIndex = getMonthIndex(state)
  if (monthIndex - (state.lastReviewMonth || 0) < 36) return null

  const officials = (state.characters || []).filter((item) => (
    item.alive !== false && Number(item.rank) > 0
  ))
  if (officials.length === 0) return null

  state.lastReviewMonth = monthIndex
  state.stats.reviews += 1

  const low = [...officials]
    .sort((a, b) => (Number(a.performance) || 0) - (Number(b.performance) || 0))
    .slice(0, 3)
  const high = officials.filter((item) => (Number(item.performance) || 0) >= 70)
  const lowIds = new Set(low.map((item) => item.id))
  const rest = officials.filter((item) => !lowIds.has(item.id) && !high.some((h) => h.id === item.id))

  const lowNames = low.map((item) => `${item.name}（考成${item.performance}）`).join('、')

  return {
    instanceId: `review_${monthIndex}`,
    eventId: 'triennial_review',
    kind: 'review',
    title: '京察',
    source: '吏部',
    text: `三年京察，吏部列名：${lowNames || '无'}考成殿后。按例，考成不合格者当降调或致仕。`,
    year: state.calendar?.year || 1,
    month: state.calendar?.month || 1,
    resolved: false,
    missed: false,
    choices: [
      {
        id: 'reward_punish',
        text: '奖优罚劣',
        hint: '优者好感 +5 · 劣者好感 -4 · 威望 +2',
        effects: [
          ...high.map((item) => ({ target: 'character', id: item.id, key: 'loyalty', value: 5 })),
          ...low.map((item) => ({ target: 'character', id: item.id, key: 'loyalty', value: -4 })),
          ...low.map((item) => ({ target: 'character', id: item.id, key: 'performance', value: -3 })),
          { target: 'resource', key: 'prestige', value: 2 },
        ],
        resultText: '京察结果张榜。有人升了半级，有人被勒令回乡。',
      },
      {
        id: 'lenient',
        text: '宽宥，只罚俸',
        hint: '全体好感 +2 · 威望 -1',
        effects: [
          ...officials.map((item) => ({ target: 'character', id: item.id, key: 'loyalty', value: 2 })),
          { target: 'resource', key: 'prestige', value: -1 },
        ],
        resultText: '京察雷声大雨点小。百官松了一口气。',
      },
      {
        id: 'strict',
        text: '严查，不合格者致仕',
        hint: '劣者去职 · 其余好感 -4 · 威望 +4',
        effects: [
          ...low.map((item) => ({ target: 'dismiss', characterId: item.id })),
          ...high.map((item) => ({ target: 'character', id: item.id, key: 'loyalty', value: 3 })),
          ...rest.map((item) => ({ target: 'character', id: item.id, key: 'loyalty', value: -4 })),
          { target: 'resource', key: 'prestige', value: 4 },
        ],
        resultText: '三名官员被勒令致仕。吏部连夜拟补缺名单。',
      },
    ],
  }
}
