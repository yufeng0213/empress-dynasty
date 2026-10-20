/**
 * 后宫：性格画像与事件
 *
 * 不额外造数值，全部从已有的性格标签、野心、能力、忠诚推导。
 * 事件里的效果直接指向具体人物 id，保证“谁争宠、谁下手”是可追溯的。
 */

import { clamp } from './random.js'
import { getCharacterStat } from './characters.js'

const TAG_EFFECTS = {
  善妒: { jealousy: 26, aggression: 10 },
  骄纵: { jealousy: 18, aggression: 15, scheming: -4 },
  敏感: { jealousy: 12, scheming: 4 },
  温顺: { jealousy: -12, aggression: -10 },
  寡言: { jealousy: -6, aggression: -8 },
  清冷: { jealousy: -8, aggression: -4 },
  天真: { scheming: -14, aggression: -10 },
  通透: { scheming: 15, aggression: 4 },
  善舞: { influence: 12 },
  博学: { scheming: 8, influence: 4 },
}

const getMonthIndex = (state) => (
  ((Number(state?.calendar?.year) || 1) - 1) * 12 + (Number(state?.calendar?.month) || 1)
)

/**
 * 性格画像：嫉妒、心机、攻击性、影响力
 */
export const getHaremProfile = (character) => {
  const tags = Array.isArray(character?.tags) ? character.tags : []
  const ambition = Number(character?.ambition) || 0
  const strategy = getCharacterStat(character, 'strategy')
  const charm = getCharacterStat(character, 'charm')
  const loyalty = Number(character?.loyalty) || 0

  let jealousy = 26
  let scheming = 18
  let aggression = 8
  let influence = 10

  for (const tag of tags) {
    const effect = TAG_EFFECTS[tag]
    if (!effect) continue
    jealousy += effect.jealousy || 0
    scheming += effect.scheming || 0
    aggression += effect.aggression || 0
    influence += effect.influence || 0
  }

  jealousy = clamp(Math.round(jealousy + ambition * 0.45 + charm * 0.12 - loyalty * 0.2), 0, 100)
  scheming = clamp(Math.round(scheming + strategy * 0.42 + ambition * 0.25 - loyalty * 0.1), 0, 100)
  aggression = clamp(Math.round(aggression + ambition * 0.5 - loyalty * 0.25), 0, 100)
  influence = clamp(Math.round(influence + charm * 0.35 + strategy * 0.08), 0, 100)

  return {
    jealousy,
    scheming,
    aggression,
    influence,
    danger: clamp(Math.round((jealousy + scheming + aggression) / 3), 0, 100),
  }
}

/**
 * 后宫整体张力：人数、危险度、孕事都会推高
 */
export const computeHaremTension = (state) => {
  const consorts = (state?.characters || []).filter((item) => item.alive !== false && item.role === 'consort')
  const profiles = consorts.map((character) => ({
    character,
    profile: getHaremProfile(character),
  }))
  const avgDanger = profiles.length > 0
    ? Math.round(profiles.reduce((sum, item) => sum + item.profile.danger, 0) / profiles.length)
    : 0
  const pregnantCount = (state?.pregnancies || []).length

  return {
    consorts: profiles.sort((a, b) => b.profile.danger - a.profile.danger),
    avgDanger,
    pregnantCount,
    tension: clamp(
      Math.round(avgDanger * 0.6 + consorts.length * 3 + pregnantCount * 10)
        + (Number(state?.haremTensionBoost) || 0),
      0,
      100,
    ),
  }
}

const makeInstance = (state, type, title, text, choices) => ({
  instanceId: `harem_${getMonthIndex(state)}_${type}`,
  eventId: `harem_${type}`,
  kind: 'harem',
  title,
  source: '内廷',
  text,
  year: state.calendar?.year || 1,
  month: state.calendar?.month || 1,
  resolved: false,
  missed: false,
  choices,
})

const tagText = (character) => (
  Array.isArray(character?.tags) && character.tags.length > 0
    ? character.tags.join('、')
    : '性子不明'
)

/**
 * 月度后宫事件：按性格与当前局势掷骰
 */
export const rollHaremEvent = (state, rng) => {
  const tensionInfo = computeHaremTension(state)
  const consorts = tensionInfo.consorts.map((item) => item.character)
  if (consorts.length === 0) return null

  const maxDanger = tensionInfo.consorts[0]?.profile.danger || 0
  let chance = 0.06 + tensionInfo.tension / 650
  if (consorts.length >= 3) chance += 0.03
  if (tensionInfo.pregnantCount > 0) chance += 0.05
  if (maxDanger > 65) chance += 0.05
  chance = clamp(chance, 0.04, 0.35)
  if (rng() > chance) return null

  // 按局势决定事件类型
  const pool = []
  if (consorts.length >= 2) pool.push({ type: 'dispute', weight: 4 })
  if (tensionInfo.pregnantCount > 0 || maxDanger > 60) pool.push({ type: 'poison', weight: 3 })
  if (consorts.length >= 3) pool.push({ type: 'clique', weight: 2 })
  if (maxDanger > 55) pool.push({ type: 'bewitch', weight: 1 })

  const total = pool.reduce((sum, item) => sum + item.weight, 0)
  let ticket = rng() * total
  let type = pool[pool.length - 1]?.type || 'dispute'
  for (const item of pool) {
    ticket -= item.weight
    if (ticket <= 0) {
      type = item.type
      break
    }
  }

  const byJealousy = [...consorts].sort((a, b) => (
    getHaremProfile(b).jealousy - getHaremProfile(a).jealousy
  ))
  const byScheming = [...consorts].sort((a, b) => (
    getHaremProfile(b).scheming - getHaremProfile(a).scheming
  ))
  const byAggression = [...consorts].sort((a, b) => (
    getHaremProfile(b).aggression - getHaremProfile(a).aggression
  ))
  const byInfluence = [...consorts].sort((a, b) => (
    getHaremProfile(b).influence - getHaremProfile(a).influence
  ))

  if (type === 'dispute') {
    const a = byJealousy[0]
    const b = byJealousy[1] || consorts.find((item) => item.id !== a.id)
    if (!a || !b) return null

    return makeInstance(
      state,
      'dispute',
      '后宫争宠',
      `${a.name}（${tagText(a)}）与${b.name}（${tagText(b)}）近来在御前几次相遇。话里都带了刺。今夜，${a.name}的宫人在廊下拦住了${b.name}的轿子，惊动了半个内廷。`,
      [
        {
          id: 'favor_a',
          text: `偏袒${a.name}`,
          hint: `${a.name}好感 +8 · ${b.name}好感 -10，野心 +6`,
          effects: [
            { target: 'character', id: a.id, key: 'loyalty', value: 8 },
            { target: 'character', id: b.id, key: 'loyalty', value: -10 },
            { target: 'character', id: b.id, key: 'ambition', value: 6 },
          ],
          resultText: `${a.name}得了赏。${b.name}回宫后砸了一面镜子，第二天照常来请安。`,
        },
        {
          id: 'punish_both',
          text: '各罚一月月例',
          hint: '威望 +2 · 后宫忠诚 -3',
          effects: [
            { target: 'resource', key: 'prestige', value: 2 },
            { target: 'role', role: 'consort', key: 'loyalty', value: -3 },
          ],
          resultText: '两个人都罚了。内廷安静下来，只是安静得有点过头。',
        },
        {
          id: 'ignore',
          text: '不闻不问',
          hint: '圣听 -2 · 两人野心 +4',
          effects: [
            { target: 'resource', key: 'intelligence', value: -2 },
            { target: 'character', id: a.id, key: 'ambition', value: 4 },
            { target: 'character', id: b.id, key: 'ambition', value: 4 },
          ],
          resultText: '你没有问。宫里的账，从来不是一支簪子能算清的。',
        },
      ],
    )
  }

  if (type === 'poison') {
    const pregnantIds = (state.pregnancies || []).map((item) => item.carrierId)
    const pregnantConsorts = consorts.filter((item) => pregnantIds.includes(item.id))
    const target = pregnantConsorts[0] || byInfluence[0] || consorts[0]
    const perpetrator = byAggression.find((item) => item.id !== target?.id) || byScheming.find((item) => item.id !== target?.id)
    if (!target || !perpetrator) return null

    const isPregnant = pregnantIds.includes(target.id)
    const losePregnancy = { target: 'pregnancy', characterId: target.id, action: 'lose' }

    return makeInstance(
      state,
      'poison',
      '药里的东西',
      `${target.name}近日${isPregnant ? '胎象不稳' : '身子不适'}，太医在药里验出了不该有的东西。药是${perpetrator.name}（${tagText(perpetrator)}）宫里送来的。${perpetrator.name}跪在殿外，说自己是被人栽赃。`,
      [
        {
          id: 'investigate',
          text: '彻查，先把人看住',
          hint: '圣听 +4 · 嫌疑者好感 -15 · 保住胎',
          effects: [
            { target: 'resource', key: 'intelligence', value: 4 },
            { target: 'character', id: perpetrator.id, key: 'loyalty', value: -15 },
            { target: 'character', id: perpetrator.id, key: 'health', value: -4 },
          ],
          resultText: '三司连夜问话。药渣里查出一个已被灭口的小太监，线索断了。',
        },
        {
          id: 'suppress',
          text: '压下去，别惊动前朝',
          hint: isPregnant ? '胎儿不保 · 目标健康 -12' : '目标健康 -12 · 嫌疑者野心 +8',
          effects: [
            { target: 'character', id: target.id, key: 'health', value: -12 },
            ...(isPregnant ? [losePregnancy] : []),
            { target: 'character', id: perpetrator.id, key: 'ambition', value: 8 },
          ],
          resultText: '内廷封了口。几天后，太医低着头来报：孩子没了。',
        },
        {
          id: 'execute',
          text: `赐死${perpetrator.name}`,
          hint: '威望 +3 · 后宫忠诚 -8 · 保住胎',
          effects: [
            { target: 'resource', key: 'prestige', value: 3 },
            { target: 'role', role: 'consort', key: 'loyalty', value: -8 },
            { target: 'character', id: perpetrator.id, key: 'health', value: -100 },
          ],
          resultText: `${perpetrator.name}被赐了白绫。内廷安静了很久。`,
        },
      ],
    )
  }

  if (type === 'clique') {
    const leader = byScheming[0]
    const others = consorts.filter((item) => item.id !== leader?.id).slice(0, 2)
    if (!leader || others.length === 0) return null
    const [m1, m2] = others

    return makeInstance(
      state,
      'clique',
      '内廷结党',
      `${leader.name}（${tagText(leader)}）近来常与${m1.name}${m2 ? `、${m2.name}` : ''}在夜里相聚。赏赐、月例、家里的书信，都在几个人之间转。内侍们开始看她们的脸色做事。`,
      [
        {
          id: 'break',
          text: '打散，各自迁宫',
          hint: '威望 +3 · 首领好感 -10 · 从者 -5',
          effects: [
            { target: 'resource', key: 'prestige', value: 3 },
            { target: 'character', id: leader.id, key: 'loyalty', value: -10 },
            ...others.map((item) => ({ target: 'character', id: item.id, key: 'loyalty', value: -5 })),
          ],
          resultText: '三道迁宫的旨意下去，内廷的夜路一下子清净了。',
        },
        {
          id: 'coopt',
          text: `拉拢${leader.name}`,
          hint: `首领好感 +10 · 从者 -6`,
          effects: [
            { target: 'character', id: leader.id, key: 'loyalty', value: 10 },
            ...others.map((item) => ({ target: 'character', id: item.id, key: 'loyalty', value: -6 })),
          ],
          resultText: `${leader.name}成了你的人。另外两个人看她的眼神变了。`,
        },
        {
          id: 'ignore',
          text: '静观其变',
          hint: '首领野心 +10 · 从者野心 +4',
          effects: [
            { target: 'character', id: leader.id, key: 'ambition', value: 10 },
            ...others.map((item) => ({ target: 'character', id: item.id, key: 'ambition', value: 4 })),
          ],
          resultText: '你什么都没做。她们的地盘，又大了一圈。',
        },
      ],
    )
  }

  // bewitch
  const perpetrator = byScheming[0]
  if (!perpetrator) return null

  return makeInstance(
    state,
    'bewitch',
    '巫蛊',
    `有人在${perpetrator.name}（${tagText(perpetrator)}）的箱底翻出一个小木人，上面写着陛下的生辰。${perpetrator.name}说不知道，内廷已经没人敢说话了。`,
    [
      {
        id: 'investigate',
        text: '彻查，宁可错杀',
        hint: '威望 +2 · 圣听 +3 · 健康 -3 · 嫌疑者健康 -10',
        effects: [
          { target: 'resource', key: 'prestige', value: 2 },
          { target: 'resource', key: 'intelligence', value: 3 },
          { target: 'ruler', key: 'health', value: -3 },
          { target: 'character', id: perpetrator.id, key: 'health', value: -10 },
        ],
        resultText: '木人被烧了。供词牵连了十几个人，最后只留下一个名字。',
      },
      {
        id: 'silence',
        text: '压下，不许再提',
        hint: '健康 -6 · 圣听 -4',
        effects: [
          { target: 'ruler', key: 'health', value: -6 },
          { target: 'resource', key: 'intelligence', value: -4 },
        ],
        resultText: '此事再无人提。可你开始夜里睡不安稳。',
      },
    ],
  )
}
