/**
 * 生死：疾病、意外、暗杀
 *
 * 自然死亡只留讣告；可疑死亡会生成「查案」奏折。
 * 查案结果由圣听、情报、凶手的性格与一点运气共同决定，可能查到，也可能查不到。
 */

import { clamp, randInt } from './random.js'
import { computeHaremTension, getHaremProfile } from './harem.js'

const getMonthIndex = (state) => (
  ((Number(state?.calendar?.year) || 1) - 1) * 12 + (Number(state?.calendar?.month) || 1)
)

const getStateMonth = (state) => ({
  year: Number(state?.calendar?.year) || 1,
  month: Number(state?.calendar?.month) || 1,
})

export const ensureMortalityFields = (state) => {
  if (!state) return state
  if (!Array.isArray(state.vacancies)) state.vacancies = []
  if (!Array.isArray(state.rumors)) state.rumors = []
  if (!state.stats) state.stats = {}
  if (typeof state.stats.deaths !== 'number') state.stats.deaths = 0
  if (typeof state.stats.investigations !== 'number') state.stats.investigations = 0
  if (typeof state.stats.funerals !== 'number') state.stats.funerals = 0

  for (const character of state.characters || []) {
    if (typeof character.alive !== 'boolean') character.alive = true
    if (typeof character.deathCause !== 'string') character.deathCause = ''
    if (typeof character.deathMonth !== 'number') character.deathMonth = 0
    if (typeof character.legitimacyBonus !== 'number') character.legitimacyBonus = 0
    if (typeof character.funeralLevel !== 'string') character.funeralLevel = ''
    if (typeof character.posthumousTitle !== 'string') character.posthumousTitle = ''
    if (typeof character.funeralMonth !== 'number') character.funeralMonth = 0
  }
  return state
}

export const DEATH_CAUSE_LABELS = {
  illness: '病逝',
  accident: '意外',
  murder: '暴毙',
  childbirth: '难产',
  purge: '下狱',
  age: '寿终',
  unknown: '死因不明',
}

export const getDeathCauseLabel = (cause) => DEATH_CAUSE_LABELS[cause] || DEATH_CAUSE_LABELS.unknown

const addRumor = (state, text, options = {}) => {
  const { year, month } = getStateMonth(state)
  state.rumors.unshift({
    id: `rumor_death_${year}_${month}_${state.rumors.length + 1}`,
    year,
    month,
    text: String(text || '').trim(),
    characterId: options.characterId || '',
    revealed: Boolean(options.revealed),
    plot: 0,
  })
  state.rumors = state.rumors.slice(0, 60)
}

/**
 * 统一的死亡登记：人物、vacancy、继承资格、讣告
 */
export const recordDeath = (state, character, cause, options = {}) => {
  if (!state || !character || character.alive === false) return
  if (!Array.isArray(state.vacancies)) state.vacancies = []
  if (!Array.isArray(state.log)) state.log = []
  if (!Array.isArray(state.heirs)) state.heirs = []
  if (!Array.isArray(state.pregnancies)) state.pregnancies = []
  const monthIndex = getMonthIndex(state)
  character.alive = false
  character.deathCause = cause
  character.deathMonth = monthIndex

  if (character.role === 'child') {
    state.heirs = (state.heirs || []).filter((id) => id !== character.id)
    if (state.designatedHeirId === character.id) state.designatedHeirId = ''
  }

  if (['minister', 'clan', 'servant'].includes(character.role)) {
    if (!state.vacancies.some((item) => item.office === character.office)) {
      state.vacancies.push({
        office: character.office,
        role: character.role,
        faction: character.faction || '',
        factionName: character.factionName || '',
        region: character.region || '',
        regionName: character.regionName || '',
        postType: character.postType || 'central',
        month: monthIndex,
        reason: options.reason || cause,
      })
    }
  }

  // 党魁死了，党羽暂时散掉
  if (character.cliqueId && character.cliqueId === character.id) {
    for (const item of state.characters || []) {
      if (item.cliqueId === character.id) item.cliqueId = ''
    }
  }

  state.pregnancies = (state.pregnancies || []).filter((item) => item.carrierId !== character.id)

  const causeText = {
    illness: '病逝',
    accident: '意外',
    murder: '暴毙',
    childbirth: '难产',
    purge: '下狱',
    age: '寿终',
  }[cause] || '身亡'

  state.log.push({
    id: `log_${state.calendar.year}_${state.calendar.month}_death_${state.log.length + 1}`,
    year: state.calendar.year,
    month: state.calendar.month,
    type: 'death',
    title: `${character.name}${causeText}`,
    desc: options.desc || `${character.office || character.roleLabel || ''}${character.name}${causeText}，年${character.age}。`,
  })
  if (state.log.length > 500) state.log = state.log.slice(-500)
}

const chooseConsortKiller = (state, victim) => {
  const rivals = (state.characters || []).filter((item) => (
    item.alive !== false
    && item.role === 'consort'
    && item.id !== victim.id
  ))
  if (rivals.length === 0) return null

  return rivals
    .map((item) => {
      const profile = getHaremProfile(item)
      return {
        item,
        score: profile.jealousy * 0.6 + profile.aggression * 0.4,
      }
    })
    .filter((entry) => entry.score >= 40)
    .sort((a, b) => b.score - a.score)[0]?.item || null
}

const chooseOfficialKiller = (state, victim) => {
  const rivals = (state.characters || []).filter((item) => (
    item.alive !== false
    && item.id !== victim.id
    && (item.role === 'minister' || item.role === 'clan')
    && ((Number(item.plot) || 0) >= 35 || (Number(item.ambition) || 0) >= 65)
  ))
  if (rivals.length === 0) return null
  return rivals.sort((a, b) => (b.plot || 0) - (a.plot || 0))[0]
}

const createInvestigationEvent = (state, victim, killer, rng) => {
  const { year, month } = getStateMonth(state)
  const intelligence = Number(state.resources.intelligence) || 0
  const saint = Number(state.resources.prestige) || 0
  const clue = killer
    ? clamp((Number(killer.aggression) || 30) - (Number(killer.scheming) || 30) + 100, 0, 200) / 200
    : 0.4
  const solvedChance = clamp(0.16 + intelligence / 250 + saint / 400 + clue * 0.25, 0.1, 0.85)
  const solved = rng() < solvedChance

  const isConsort = victim.role === 'consort'
  const source = isConsort ? '内廷' : '大理寺'
  const detail = killer
    ? `${victim.name}昨夜还好好的，今晨被发现死在榻上。太医说是急症，可指甲发青，枕边有一只摔碎的瓷碗。`
    : `${victim.name}病了半月，太医换了几张方子，终究没救回来。`

  return {
    instanceId: `death_investigate_${getMonthIndex(state)}_${victim.id}`,
    eventId: 'death_investigation',
    kind: 'investigation',
    title: '命案',
    source,
    text: `${detail}${killer ? '宫人们都说，昨夜只有几个人去过那间屋子。' : ''}`,
    year,
    month,
    resolved: false,
    missed: false,
    choices: [
      {
        id: 'investigate',
        text: '彻查，验尸、问话',
        hint: solved ? '线索对得上，可能查到真凶' : '线索太少，未必查得出',
        effects: solved
          ? [
            ...(killer ? [{ target: 'expose', characterId: killer.id }] : []),
            {
              target: 'rumor',
              text: killer
                ? `查得${victim.name}之死与${killer.name}有关：药里被加了东西，经手人已经招了。`
                : `验尸确认${victim.name}死于急症，并无他人下手。`,
              revealed: true,
              characterId: killer?.id || '',
            },
            { target: 'resource', key: 'prestige', value: 3 },
            ...(killer ? [{ target: 'character', id: killer.id, key: 'loyalty', value: -20 }] : []),
          ]
          : [
            { target: 'resource', key: 'intelligence', value: -2 },
            {
              target: 'rumor',
              text: `${victim.name}的案子查了半个月，最后只报上来一句“暴病而亡”。`,
              revealed: true,
            },
          ],
        resultText: solved
          ? (killer ? `真相查到了${killer.name}身上。内廷一夜没睡。` : '验尸结果无可疑，案子结了。')
          : '查了半个月，线索越查越少。最后只能以“暴病”结案。',
      },
      {
        id: 'quiet',
        text: '压下，不许再查',
        hint: '威望 +1 · 真凶会更安心',
        effects: [
          { target: 'resource', key: 'prestige', value: 1 },
          ...(killer ? [{ target: 'character', id: killer.id, key: 'plot', value: 8 }] : []),
        ],
        resultText: '丧事办得很安静。没人再提那间屋子。',
      },
    ],
  }
}

/**
 * 每月生死结算
 * @returns {Array} 查案事件
 */
export const tickMortality = (state, rng) => {
  ensureMortalityFields(state)
  const events = []
  const candidates = (state.characters || []).filter((item) => item.alive !== false)
  const shuffled = [...candidates].sort(() => rng() - 0.5)
  let deaths = 0

  for (const character of shuffled) {
    if (deaths >= 2) break

    const age = Number(character.age) || 0
    const health = Number(character.health) || 60
    const role = character.role

    let baseRate = 0.0007 + Math.max(0, age - 50) * 0.00035
    if (role === 'child') {
      baseRate = age < 3 ? 0.0035 : (age < 12 ? 0.0012 : 0.0006)
    }
    const healthPenalty = Math.max(0, 60 - health) * 0.0002
    if (rng() > baseRate + healthPenalty) continue

    deaths += 1

    // 是否人为：后宫张力越高，争宠致死的概率越大
    const haremTension = computeHaremTension(state).tension
    const consortMurderChance = clamp(0.08 + haremTension / 300, 0.08, 0.4)

    let killer = null
    let cause = rng() < 0.7 ? 'illness' : 'accident'
    const murderRoll = rng()
    if (role === 'consort' && murderRoll < consortMurderChance) {
      killer = chooseConsortKiller(state, character)
    } else if ((role === 'minister' || role === 'clan') && murderRoll < 0.12) {
      killer = chooseOfficialKiller(state, character)
    } else if (role === 'child' && murderRoll < 0.06 + haremTension / 800) {
      killer = chooseConsortKiller(state, character)
    }

    if (killer) {
      cause = 'murder'
      recordDeath(state, character, cause, {
        desc: `${character.office || ''}${character.name}暴毙，年${age}。${killer ? '宫中流言四起。' : ''}`,
      })
      addRumor(state, `${character.name}死得蹊跷，${killer ? `${killer.name}昨夜曾去过那间屋子。` : '内廷讳莫如深。'}`, {
        characterId: killer?.id || '',
        revealed: false,
      })
      if (events.length === 0) {
        events.push(createInvestigationEvent(state, character, killer, rng))
        state.stats.investigations += 1
      }
    } else {
      recordDeath(state, character, cause, {
        desc: `${character.office || ''}${character.name}${cause === 'illness' ? '病逝' : '意外身亡'}，年${age}。`,
      })
    }
    state.stats.deaths = (state.stats.deaths || 0) + 1
  }

  return events
}

export const getVacancyCandidates = (state, vacancyIndex) => (
  state?.appointment?.vacancyIndex === vacancyIndex
    ? state.appointment.candidates || []
    : []
)

export const getVacancyById = (state, index) => (
  Array.isArray(state?.vacancies) ? state.vacancies[index] || null : null
)

export const formatVacancy = (vacancy) => {
  if (!vacancy) return ''
  return `${vacancy.office}${vacancy.factionName ? ` · ${vacancy.factionName}` : ''}`
}

export const getDeathSummary = (state) => {
  const characters = state?.characters || []
  return {
    dead: characters.filter((item) => item.alive === false).length,
    vacant: (state?.vacancies || []).length,
    byCause: characters
      .filter((item) => item.alive === false)
      .reduce((acc, item) => {
        const key = item.deathCause || 'unknown'
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {}),
  }
}

export const randomDeathBlurb = (rng) => {
  const list = ['病逝', '意外', '暴毙']
  return list[randInt(rng, 0, list.length - 1)]
}
