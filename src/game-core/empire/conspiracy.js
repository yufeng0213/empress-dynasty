/**
 * 暗流：由隐藏的野心与忠诚驱动的私下活动
 *
 * 数值可以隐藏，但行为不能凭空出现：
 * - 野心高、忠诚低的人每月积累「图谋」
 * - 图谋到阈值后依次结党、贪墨、兵变
 * - 圣听越高，越容易提前发现（密报）
 */

import { clamp, randInt } from './random.js'
import { recordDeath } from './mortality.js'
import { recordActivity } from './activity.js'
import { getCharacterStat } from './characters.js'

const getMonthIndex = (state) => (
  ((Number(state?.calendar?.year) || 1) - 1) * 12 + (Number(state?.calendar?.month) || 1)
)

const getStateMonth = (state) => ({
  year: Number(state?.calendar?.year) || 1,
  month: Number(state?.calendar?.month) || 1,
})

export const ensureConspiracyFields = (state) => {
  if (!state) return state
  if (!state.settings || typeof state.settings !== 'object') {
    state.settings = { blindStats: false }
  }
  if (typeof state.settings.blindStats !== 'boolean') {
    state.settings.blindStats = false
  }
  if (!Array.isArray(state.rumors)) state.rumors = []
  if (!state.stats) state.stats = {}
  if (typeof state.stats.conspiracies !== 'number') state.stats.conspiracies = 0
  if (typeof state.stats.embezzled !== 'number') state.stats.embezzled = 0
  if (typeof state.stats.rebellions !== 'number') state.stats.rebellions = 0

  for (const character of state.characters || []) {
    if (typeof character.plot !== 'number') character.plot = 0
    if (typeof character.cliqueId !== 'string') character.cliqueId = character.cliqueId || ''
    if (typeof character.exposed !== 'boolean') character.exposed = false
    if (typeof character.rebelTriggered !== 'boolean') character.rebelTriggered = false
  }
  return state
}

const addRumor = (state, text, options = {}) => {
  const { year, month } = getStateMonth(state)
  state.rumors.unshift({
    id: `rumor_${year}_${month}_${state.rumors.length + 1}`,
    year,
    month,
    text: String(text || '').trim(),
    characterId: options.characterId || '',
    revealed: Boolean(options.revealed),
    plot: Number(options.plot) || 0,
  })
  state.rumors = state.rumors.slice(0, 60)
}

/**
 * 玩家能看到的风评（不暴露具体数值）
 */
export const getReputation = (character) => {
  if (!character) return { label: '未知', tone: '' }
  const loyalty = Number(character.loyalty) || 0
  const ambition = Number(character.ambition) || 0
  const plot = Number(character.plot) || 0

  if (character.exposed) return { label: '已查实', tone: 'red' }
  if (plot >= 70) return { label: '行迹可疑', tone: 'red' }
  if (plot >= 40) return { label: '交游渐广', tone: 'gold' }
  if (ambition >= 80 && loyalty < 55) return { label: '志大难测', tone: 'red' }
  if (ambition >= 65) return { label: '素有抱负', tone: 'gold' }
  if (loyalty >= 78) return { label: '忠谨', tone: 'jade' }
  if (loyalty <= 32) return { label: '离心', tone: 'red' }
  return { label: '安分', tone: '' }
}

export const getHaremDisposition = (profile) => {
  const danger = Number(profile?.danger) || 0
  if (danger >= 70) return { label: '不可不防', tone: 'red' }
  if (danger >= 45) return { label: '有心思', tone: 'gold' }
  return { label: '安分', tone: 'jade' }
}

const getCliqueMembers = (state, leaderId) => (
  (state.characters || []).filter((item) => (
    item.alive !== false && item.cliqueId && item.cliqueId === leaderId
  ))
)

const getPlotPower = (state, character) => {
  const members = character.cliqueId === character.id ? getCliqueMembers(state, character.id) : []
  const followerPower = members
    .filter((item) => item.id !== character.id)
    .reduce((sum, item) => sum + getCharacterStat(item, 'strategy') * 0.25, 0)
  return Math.round(
    (Number(character.plot) || 0)
    + (Number(character.ambition) || 0) * 0.35
    + getCharacterStat(character, 'strategy') * 0.3
    + followerPower,
  )
}

const createRebellionEvent = (state, character) => {
  const { year, month } = getStateMonth(state)
  const power = getPlotPower(state, character)
  const courtMilitary = Math.max(
    getCharacterStat(state.ruler, 'military'),
    ...(state.characters || [])
      .filter((item) => item.alive !== false)
      .map((item) => getCharacterStat(item, 'military')),
  )
  const suppressPower = Math.round(
    (Number(state.resources.military) || 0)
    + (Number(state.resources.prestige) || 0) * 0.4
    + (Number(state.resources.intelligence) || 0) * 0.2
    + courtMilitary * 0.25,
  )
  const willSucceed = suppressPower >= power
  const clique = getCliqueMembers(state, character.id)

  return {
    instanceId: `rebel_${getMonthIndex(state)}_${character.id}`,
    eventId: 'rebellion',
    kind: 'rebellion',
    title: '兵变',
    source: '禁军',
    text: `${character.name}以“清君侧”为名，率部曲围了宫门。${clique.length > 1 ? `其党羽${clique.length - 1}人已在城中响应。` : '城中暂无响应者。'}禁军尚在观望，取决于陛下这一道旨意。`,
    year,
    month,
    resolved: false,
    missed: false,
    choices: [
      {
        id: 'suppress',
        text: '调禁军镇压',
        hint: willSucceed ? '胜算在握 · 威望 +6' : '胜负未卜 · 失败将动摇国本',
        effects: willSucceed
          ? [
            { target: 'character', id: character.id, key: 'health', value: -100 },
            { target: 'resource', key: 'prestige', value: 6 },
            { target: 'resource', key: 'military', value: -5 },
            ...clique
              .filter((item) => item.id !== character.id)
              .map((item) => ({ target: 'character', id: item.id, key: 'loyalty', value: -20 })),
          ]
          : [
            { target: 'ruler', key: 'health', value: -20 },
            { target: 'resource', key: 'treasury', value: -1500 },
            { target: 'resource', key: 'prestige', value: -8 },
            { target: 'character', id: character.id, key: 'plot', value: -20 },
          ],
        resultText: willSucceed
          ? `禁军没有犹豫。${character.name}伏诛，党羽作鸟兽散。`
          : `禁军败退。你退守内城，签下了一道不愿被史官记住的旨意。`,
        suppressSuccess: willSucceed,
      },
      {
        id: 'appease',
        text: '遣使安抚，许以高位',
        hint: '国库 -1200 · 威望 -4 · 对方暂时罢手',
        effects: [
          { target: 'resource', key: 'treasury', value: -1200 },
          { target: 'resource', key: 'prestige', value: -4 },
          { target: 'character', id: character.id, key: 'loyalty', value: 25 },
          { target: 'character', id: character.id, key: 'plot', value: -45 },
        ],
        resultText: `${character.name}收了兵符，也收下了你给的台阶。宫门重新开了。`,
      },
    ],
  }
}

/**
 * 每月结算暗流
 * @returns {Array} 需要追加到 pending 的事件
 */
export const tickConspiracies = (state, rng) => {
  ensureConspiracyFields(state)
  const events = []
  const monthIndex = getMonthIndex(state)
  const intelligence = Number(state.resources.intelligence) || 0
  const officials = (state.characters || []).filter((item) => (
    item.alive !== false && (item.role === 'minister' || item.role === 'clan')
  ))

  // 同一时间只有图谋最深的几个人在真正活动，避免满朝皆反
  const activeIds = new Set(
    officials
      .map((item) => ({
        item,
        drive: (Number(item.ambition) || 0) * 0.6 + (100 - (Number(item.loyalty) || 0)) * 0.4,
      }))
      .filter((entry) => entry.drive >= 50)
      .sort((a, b) => b.drive - a.drive)
      .slice(0, 3)
      .map((entry) => entry.item.id),
  )

  for (const character of officials) {
    const ambition = Number(character.ambition) || 0
    const loyalty = Number(character.loyalty) || 0
    const drive = ambition * 0.6 + (100 - loyalty) * 0.4

    if (drive < 50 || !activeIds.has(character.id)) {
      character.plot = Math.max(0, (Number(character.plot) || 0) - 2)
      continue
    }

    // 被查实的人会收敛；圣听越高，图谋积累越慢
    const exposureFactor = character.exposed ? 0.4 : 1
    const gain = Math.max(0, 1.2 + drive / 60 - intelligence / 120) * exposureFactor
    character.plot = clamp((Number(character.plot) || 0) + gain, 0, 100)

    // 结党
    if (character.plot >= 50 && !character.cliqueId) {
      const candidates = officials.filter((item) => (
        item.id !== character.id
        && !item.cliqueId
        && (Number(item.ambition) || 0) * 0.6 + (100 - (Number(item.loyalty) || 0)) * 0.4 >= 45
      ))
      if (candidates.length > 0) {
        const leader = [character, ...candidates].sort((a, b) => (b.plot || 0) - (a.plot || 0))[0]
        leader.cliqueId = leader.id
        for (const member of [character, ...candidates].slice(0, 3)) {
          member.cliqueId = leader.id
        }
        state.stats.conspiracies += 1
        addRumor(state, '近日有数位官员往来过密，府中夜宴不绝。', { plot: leader.plot })
      }
    }

    // 贪墨：不会月月搬空国库，但也不会只偷一次
    if (character.plot >= 72 && monthIndex - (character.lastPlotMonth || 0) >= 10) {
      const amount = Math.round(40 + getCharacterStat(character, 'finance') * 1.1 + character.plot * 0.8)
      state.resources.treasury = Math.round((Number(state.resources.treasury) || 0) - amount)
      character.lastPlotMonth = monthIndex
      character.plot = Math.max(55, character.plot - 4)
      state.stats.embezzled += amount
      state.stats.conspiracies += 1
      addRumor(
        state,
        character.exposed
          ? `${character.name}掌管的账目又少了一笔。`
          : '户部与内库的账目似有出入，数目对不上。',
        { characterId: character.exposed ? character.id : '', revealed: character.exposed, plot: character.plot },
      )
    }

    // 兵变
    if (character.plot >= 96 && !character.rebelTriggered) {
      character.rebelTriggered = true
      state.stats.rebellions += 1
      addRumor(state, `${character.name}近来频繁调动手下亲信，宫门值守也换了人。`, {
        characterId: character.id,
        revealed: true,
        plot: character.plot,
      })
      events.push(createRebellionEvent(state, character))
    }
  }

  // 圣听：每月有机会查实一个图谋最深的人
  const discoveryChance = clamp(0.02 + intelligence / 600, 0.03, 0.25)
  if (rng() < discoveryChance) {
    const target = [...officials]
      .filter((item) => !item.exposed && (Number(item.plot) || 0) >= 35)
      .sort((a, b) => (b.plot || 0) - (a.plot || 0))[0]
    if (target) {
      target.exposed = true
      addRumor(
        state,
        `密探查得，${target.name}私下拉拢人手、挪用银钱，已有不臣之迹。`,
        { characterId: target.id, revealed: true, plot: target.plot },
      )
    }
  }

  return events
}

/**
 * 下狱：只对已查实的人生效
 */
export const purgeCharacter = (state, characterId) => {
  const character = (state?.characters || []).find((item) => item.id === characterId && item.alive !== false)
  if (!character) return { success: false, message: '找不到此人' }
  if (!character.exposed) return { success: false, message: '尚未查实，不能下狱' }
  if ((state.actionPoints || 0) <= 0) return { success: false, message: '本旬行动点已用完' }

  recordDeath(state, character, 'purge', {
    desc: `${character.name}下狱，当日死在狱中。`,
  })
  state.actionPoints = Math.max(0, (state.actionPoints || 0) - 1)
  state.resources.prestige = clamp((state.resources.prestige || 0) + 2, 0, 100)
  for (const item of state.characters || []) {
    if (item.alive !== false && item.role === 'minister') {
      item.loyalty = clamp((item.loyalty || 0) - 2, 0, 100)
    }
  }

  // 连坐：同年、座师、举荐人
  const reprimanded = []
  if (character.examCohort > 0) {
    for (const item of state.characters || []) {
      if (item.alive !== false && item.id !== character.id && item.examCohort === character.examCohort) {
        item.loyalty = clamp((item.loyalty || 0) - 3, 0, 100)
        reprimanded.push(item.name)
      }
    }
  }
  if (character.recommendedById) {
    const patron = (state.characters || []).find((item) => item.id === character.recommendedById && item.alive !== false)
    if (patron) {
      patron.loyalty = clamp((patron.loyalty || 0) - 15, 0, 100)
      patron.ambition = clamp((patron.ambition || 0) + 3, 0, 100)
      reprimanded.push(`座师${patron.name}`)
    }
  }
  for (const item of state.characters || []) {
    if (item.alive !== false && item.recommendedById === character.id) {
      item.loyalty = clamp((item.loyalty || 0) - 10, 0, 100)
      reprimanded.push(item.name)
    }
  }

  recordActivity(state, `下狱${character.name}`, 'purge')

  if (reprimanded.length > 0) {
    state.log.push({
      id: `log_${state.calendar.year}_${state.calendar.month}_implicate_${state.log.length + 1}`,
      year: state.calendar.year,
      month: state.calendar.month,
      type: 'implicate',
      title: `${character.name}案连坐`,
      desc: `${reprimanded.join('、')}受到牵连。`,
    })
    if (state.log.length > 500) state.log = state.log.slice(-500)
  }

  return { success: true, message: `${character.name}已下狱` }
}
