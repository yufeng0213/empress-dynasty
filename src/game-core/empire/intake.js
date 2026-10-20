/**
 * 后宫来源：选秀、臣属进献、耳边风
 *
 * 进献来的人带「恩主」：她对女帝的忠诚可以很低，对恩主的忠诚却很高。
 * 恩主会借她探听消息、替自己说情，甚至掩护自己的图谋。
 */

import { createRng, clamp } from './random.js'
import { generateConsortCharacter, getCharacterStat } from './characters.js'
import { recordActivity } from './activity.js'

export const SELECTION_COST = 300
const MAX_CONSORTS = 12

const getMonthIndex = (state) => (
  ((Number(state?.calendar?.year) || 1) - 1) * 12 + (Number(state?.calendar?.month) || 1)
)

const clone = (value) => JSON.parse(JSON.stringify(value))

export const ensureIntakeFields = (state) => {
  if (!state) return state
  if (!('selection' in state)) state.selection = null
  if (typeof state.lastSelectionMonth !== 'number') state.lastSelectionMonth = 0
  if (typeof state.lastGiftMonth !== 'number') state.lastGiftMonth = 0

  for (const character of state.characters || []) {
    if (!character.source) character.source = character.role === 'child' ? 'birth' : 'start'
    if (typeof character.patronId !== 'string') character.patronId = ''
    if (typeof character.patronName !== 'string') character.patronName = ''
    if (typeof character.patronFaction !== 'string') character.patronFaction = ''
    if (typeof character.patronLoyalty !== 'number') character.patronLoyalty = 0
    if (typeof character.lastWhisperMonth !== 'number') character.lastWhisperMonth = 0
  }
  return state
}

/**
 * 开选秀：生成 3 名候选人，不立刻入宫
 */
export const startSelection = (state, options = {}) => {
  if (!state || state.status !== 'playing') {
    return { success: false, state, message: '当前无法选秀' }
  }
  const monthIndex = getMonthIndex(state)
  if (state.selection?.candidates?.length > 0) {
    return { success: true, state, message: '选秀名册还在' }
  }
  if ((state.lastSelectionMonth || 0) > 0 && monthIndex - state.lastSelectionMonth < 6) {
    return { success: false, state, message: '距上次选秀不足半年' }
  }

  const next = clone(state)
  const rng = createRng(Number(options.seed) || (Date.now() + monthIndex * 97))
  const usedNames = new Set((next.characters || []).map((item) => item.name))
  const candidates = Array.from({ length: 3 }, (_, index) => generateConsortCharacter(rng, {
    gender: rng() < 0.5 ? '男' : '女',
    id: `dyn_sel_${monthIndex}_${index + 1}_${Math.floor(rng() * 99999)}`,
    usedNames,
    source: 'selection',
  }))

  next.selection = {
    createdAtMonth: monthIndex,
    candidates,
  }
  next.lastSelectionMonth = monthIndex
  recordActivity(next, '开选秀', 'selection')
  return { success: true, state: next, message: '选秀名册已送到' }
}

export const cancelSelection = (state) => {
  const next = clone(state)
  next.selection = null
  return { success: true, state: next }
}

/**
 * 纳入后宫
 */
export const recruitConsort = (state, candidateId) => {
  if (!state || state.status !== 'playing') {
    return { success: false, state, message: '当前无法纳妃' }
  }
  const candidate = (state.selection?.candidates || []).find((item) => item.id === candidateId)
  if (!candidate) {
    return { success: false, state, message: '名册里没有这个人' }
  }
  const aliveConsorts = (state.characters || []).filter((item) => item.alive !== false && item.role === 'consort')
  if (aliveConsorts.length >= MAX_CONSORTS) {
    return { success: false, state, message: '后宫已满' }
  }
  if ((Number(state.resources?.treasury) || 0) < SELECTION_COST) {
    return { success: false, state, message: `国库不足 ${SELECTION_COST} 贯` }
  }

  const next = clone(state)
  const target = next.selection.candidates.find((item) => item.id === candidateId)
  next.characters.push({
    ...target,
    source: 'selection',
    bioPending: true,
  })
  next.resources.treasury = Math.round((Number(next.resources.treasury) || 0) - SELECTION_COST)
  next.selection = null
  recordActivity(next, `纳${target.name}入宫（-${SELECTION_COST}贯）`, 'harem')
  next.updatedAt = Date.now()

  return { success: true, state: next, message: `${target.name}已入宫` }
}

/**
 * 臣属进献：每月掷一次，间隔至少 10 个月
 */
export const rollGiftConsortEvent = (state, rng) => {
  ensureIntakeFields(state)
  const monthIndex = getMonthIndex(state)
  if (monthIndex - (state.lastGiftMonth || 0) < 10) return null

  const consorts = (state.characters || []).filter((item) => item.alive !== false && item.role === 'consort')
  if (consorts.length >= MAX_CONSORTS) return null

  const patrons = (state.characters || []).filter((item) => (
    item.alive !== false
    && (item.role === 'minister' || item.role === 'clan')
    && Math.max(
      getCharacterStat(item, 'civil'),
      getCharacterStat(item, 'strategy'),
      getCharacterStat(item, 'charm'),
    ) >= 40
  ))
  if (patrons.length === 0) return null
  if (rng() > 0.16) return null

  const patron = patrons[Math.floor(rng() * patrons.length)]
  const gender = rng() < 0.5 ? '男' : '女'
  const consort = generateConsortCharacter(rng, {
    gender,
    id: `dyn_gift_${monthIndex}_${Math.floor(rng() * 99999)}`,
    source: 'gift',
    patron: {
      id: patron.id,
      name: patron.name,
      faction: patron.faction,
      factionName: patron.factionName,
    },
  })

  state.lastGiftMonth = monthIndex

  return {
    instanceId: `gift_${monthIndex}_${patron.id}`,
    eventId: 'gift_consort',
    kind: 'intake',
    title: '进献',
    source: patron.office || '内廷',
    text: `${patron.office || ''}${patron.name}遣人送来一名${gender === '男' ? '少年' : '女子'}，说是族中远亲，知书识礼，愿侍奉陛下。人已经送到宫门外，随行的还有一箱不算薄的礼单。`,
    year: state.calendar?.year || 1,
    month: state.calendar?.month || 1,
    resolved: false,
    missed: false,
    choices: [
      {
        id: 'accept',
        text: '纳入后宫',
        hint: `${patron.name}好感 +8 · 圣听 -2 · 此人可能替恩主说话`,
        effects: [
          { target: 'giftConsort', consort },
          { target: 'character', id: patron.id, key: 'loyalty', value: 8 },
          { target: 'resource', key: 'intelligence', value: -2 },
        ],
        resultText: `${consort.name}入了宫。${patron.name}的谢恩折子第二天就到了。`,
      },
      {
        id: 'refuse',
        text: '退回，宫中不缺人',
        hint: `${patron.name}好感 -6 · 威望 +2`,
        effects: [
          { target: 'character', id: patron.id, key: 'loyalty', value: -6 },
          { target: 'resource', key: 'prestige', value: 2 },
        ],
        resultText: '人退回去了。礼单也退了。朝臣们很快知道了这件事。',
      },
      {
        id: 'investigate',
        text: '先查底细，再谈纳妃',
        hint: '圣听 +3 · 恩主好感 -10',
        effects: [
          { target: 'resource', key: 'intelligence', value: 3 },
          { target: 'character', id: patron.id, key: 'loyalty', value: -10 },
          {
            target: 'rumor',
            text: `查得${patron.name}进献之人，实为其族中养女，入宫目的不明。`,
            revealed: true,
            characterId: patron.id,
          },
        ],
        resultText: `${patron.name}解释说只是族中远亲。你记下了这个名字。`,
      },
    ],
  }
}

/**
 * 耳边风：有恩主的侍宠替恩主说话
 */
export const tickWhispers = (state, rng) => {
  ensureIntakeFields(state)
  const monthIndex = getMonthIndex(state)
  const patroned = (state.characters || []).filter((item) => (
    item.alive !== false
    && item.role === 'consort'
    && item.patronId
    && monthIndex - (item.lastWhisperMonth || 0) >= 8
  ))
  if (patroned.length === 0) return null
  if (rng() > 0.15) return null

  const consort = patroned[Math.floor(rng() * patroned.length)]
  const patron = (state.characters || []).find((item) => item.id === consort.patronId && item.alive !== false)
  if (!patron) return null

  consort.lastWhisperMonth = monthIndex

  const requests = [
    `族中子弟尚未出仕，求一个恩典`,
    `任上清苦，想请陛下再添些俸禄`,
    `近来有人参他，求陛下压一压`,
    `想为家乡修一座桥，请陛下拨银`,
  ]
  const request = requests[Math.floor(rng() * requests.length)]

  return {
    instanceId: `whisper_${monthIndex}_${consort.id}`,
    eventId: 'whisper',
    kind: 'intake',
    title: '耳边风',
    source: '内廷',
    text: `夜里，${consort.name}替${patron.name}说起好话：${patron.office || '在朝为官'}多年，${request}。话说得很轻，像是不经意。`,
    year: state.calendar?.year || 1,
    month: state.calendar?.month || 1,
    resolved: false,
    missed: false,
    choices: [
      {
        id: 'grant',
        text: '准了',
        hint: `${patron.name}好感 +10 · 国库 -500 · 圣听 -2`,
        effects: [
          { target: 'character', id: patron.id, key: 'loyalty', value: 10 },
          { target: 'resource', key: 'treasury', value: -500 },
          { target: 'resource', key: 'intelligence', value: -2 },
          { target: 'character', id: consort.id, key: 'loyalty', value: 5 },
        ],
        resultText: `旨意下去了。${consort.name}替你掖了掖被角。`,
      },
      {
        id: 'deny',
        text: '不准，让她少提朝政',
        hint: `${patron.name}好感 -8 · ${consort.name}好感 -6 · 威望 +2`,
        effects: [
          { target: 'character', id: patron.id, key: 'loyalty', value: -8 },
          { target: 'character', id: consort.id, key: 'loyalty', value: -6 },
          { target: 'resource', key: 'prestige', value: 2 },
        ],
        resultText: `${consort.name}没有再说话。那晚的灯，灭得比平时早。`,
      },
      {
        id: 'rebuke',
        text: '训斥她干预朝政',
        hint: `${consort.name}好感 -12 · 圣听 +3 · ${patron.name}野心 +6`,
        effects: [
          { target: 'character', id: consort.id, key: 'loyalty', value: -12 },
          { target: 'resource', key: 'intelligence', value: 3 },
          { target: 'character', id: patron.id, key: 'ambition', value: 6 },
        ],
        resultText: `${consort.name}跪了半夜。${patron.name}第二天的折子，字迹比平时重。`,
      },
    ],
  }
}

export const getConsortSourceLabel = (character) => {
  if (!character) return ''
  if (character.role === 'child') return '子嗣'
  if (character.source === 'gift') {
    return character.patronName ? `由 ${character.patronName} 进献` : '臣属进献'
  }
  if (character.source === 'selection') return '选秀入宫'
  if (character.source === 'night_market') return '灯市延请'
  if (character.source === 'birth') return '子嗣'
  return '开局旧人'
}
