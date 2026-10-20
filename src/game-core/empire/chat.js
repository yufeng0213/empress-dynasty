/**
 * 召见聊天：联系人、话题、回话与本地结算。
 *
 * LLM 只负责“怎么说”；这里负责“谁能见、能问什么、扣多少”。
 * 对话按角色走本地话题池，避免模型直接改数值。
 */

import { clamp } from './random.js'
import { getCharacterStat } from './characters.js'
import { recordActivity } from './activity.js'

const clone = (value) => JSON.parse(JSON.stringify(value))

const monthIndex = (state) => (
  ((Number(state?.calendar?.year) || 1) - 1) * 12 + (Number(state?.calendar?.month) || 1)
)

const ROLE_LABELS = {
  minister: '朝臣',
  clan: '宗室',
  consort: '侍宠',
  servant: '内侍',
  child: '子嗣',
  dead: '故人',
}

const attitudeOf = (character) => {
  const loyalty = Number(character.loyalty) || 50
  if (loyalty >= 75) return '恭顺'
  if (loyalty >= 60) return '敬畏'
  if (loyalty >= 45) return '观望'
  return '疏离'
}

const noteOf = (character) => {
  if (Number(character.plot) > 25) return '近日与外臣往来频繁'
  if (Number(character.ambition) > 68) return '野心不低，正在找门路'
  if (character.factionName) return `${character.factionName}出身`
  return '暂时没有可用把柄'
}

const COMMON_TOPICS = [
  { id: 'greet', label: '问近况', hint: '关系 +1', effects: { loyalty: 1 } },
  { id: 'press', label: '敲打', hint: '忠诚 -2 · 威望 +1', effects: { loyalty: -2, prestige: 1 } },
  { id: 'soothe', label: '安抚', hint: '忠诚 +3', effects: { loyalty: 3 } },
]

const TOPICS_BY_ROLE = {
  minister: [
    { id: 'court', label: '问朝局', hint: '圣听 +1 · 可能得密报', effects: { intelligence: 1 } },
    { id: 'faction', label: '问派系', hint: '圣听 +1 · 可能得密报', effects: { intelligence: 1 } },
    { id: 'military', label: '问军饷', hint: '圣听 +1 · 触怒边军风险', effects: { intelligence: 1 } },
  ],
  clan: [
    { id: 'clan', label: '问宗室', hint: '圣听 +1', effects: { intelligence: 1 } },
    { id: 'estate', label: '问封地', hint: '圣听 +1', effects: { intelligence: 1 } },
    { id: 'court', label: '问朝局', hint: '圣听 +1', effects: { intelligence: 1 } },
  ],
  consort: [
    { id: 'harem', label: '问后宫', hint: '圣听 +1', effects: { intelligence: 1 } },
    { id: 'family', label: '问家人', hint: '亲密 +1', effects: { loyalty: 1 } },
    { id: 'heart', label: '问心事', hint: '亲密 +1', effects: { loyalty: 1 } },
  ],
  child: [
    { id: 'study', label: '问课业', hint: '文治 +1 · 亲密 +1', effects: { civil: 1, loyalty: 1 } },
    { id: 'heir', label: '问东宫', hint: '圣听 +1', effects: { intelligence: 1 } },
    { id: 'marriage', label: '问婚事', hint: '亲密 +1', effects: { loyalty: 1 } },
  ],
  servant: [
    { id: 'inner', label: '问内廷', hint: '圣听 +1', effects: { intelligence: 1 } },
    { id: 'heir', label: '问东宫', hint: '圣听 +1', effects: { intelligence: 1 } },
    { id: 'errand', label: '差事', hint: '忠诚 +1', effects: { loyalty: 1 } },
  ],
}

export const ensureChatFields = (state) => {
  if (!state) return state
  if (!state.chatMemory || typeof state.chatMemory !== 'object') state.chatMemory = {}
  for (const memory of Object.values(state.chatMemory)) {
    if (!memory || typeof memory !== 'object') continue
    if (!Array.isArray(memory.messages)) memory.messages = []
    if (!Array.isArray(memory.notes)) memory.notes = []
    if (typeof memory.chats !== 'number') memory.chats = 0
  }
  if (state.chatSession && typeof state.chatSession !== 'object') state.chatSession = null
  return state
}

export const getChatContacts = (state) => (
  (state?.characters || [])
    .filter((item) => item.alive !== false && ['minister', 'clan', 'consort', 'servant', 'child'].includes(item.role))
    .map((item) => ({
      id: item.id,
      name: item.name,
      office: item.office || item.roleLabel || '',
      role: item.role,
      roleLabel: ROLE_LABELS[item.role] || item.role,
      faction: item.faction || '',
      factionName: item.factionName || '',
      attitude: attitudeOf(item),
      note: noteOf(item),
      loyalty: Number(item.loyalty) || 0,
      ambition: Number(item.ambition) || 0,
      age: Number(item.age) || 0,
      tags: Array.isArray(item.tags) ? item.tags : [],
    }))
    .sort((a, b) => {
      const order = { child: 0, consort: 1, minister: 2, clan: 3, servant: 4 }
      return (order[a.role] ?? 9) - (order[b.role] ?? 9)
        || a.name.localeCompare(b.name, 'zh')
    })
)

export const getChatTopics = (state, characterId) => {
  const character = (state?.characters || []).find((item) => item.id === characterId && item.alive !== false)
  if (!character) return []
  const roleTopics = TOPICS_BY_ROLE[character.role] || []
  return [...roleTopics, ...COMMON_TOPICS]
}

export const startChatSession = (state, characterId) => {
  if (!state || state.status !== 'playing') {
    return { success: false, state, message: '当前无法召见' }
  }
  ensureChatFields(state)
  const character = (state.characters || []).find((item) => (
    item.id === characterId && item.alive !== false
  ))
  if (!character) return { success: false, state, message: '找不到此人' }

  if (
    state.chatSession?.characterId === characterId
    && state.chatSession?.month === monthIndex(state)
  ) {
    return { success: true, state, message: '' }
  }
  if ((Number(state.actionPoints) || 0) <= 0) {
    return { success: false, state, message: '本旬行动点已用完' }
  }

  const next = clone(state)
  ensureChatFields(next)
  next.actionPoints = Math.max(0, (next.actionPoints || 0) - 1)
  next.chatSession = {
    characterId,
    month: monthIndex(next),
    asked: [],
  }
  if (!next.chatMemory[characterId]) {
    next.chatMemory[characterId] = { chats: 0, lastTopic: '', notes: [], messages: [] }
  }
  next.chatMemory[characterId].chats += 1
  next.chatMemory[characterId].lastMonth = monthIndex(next)
  recordActivity(next, `召见${character.name}`, 'chat')
  next.updatedAt = Date.now()
  return { success: true, state: next, message: `召见${character.name}` }
}

const replyFor = (topicId, character, state, repeated) => {
  const role = character.role
  if (repeated) return '臣/妾已经回过了。陛下若还要问，臣/妾不敢改口。'

  if (topicId === 'greet') {
    if (role === 'consort') return '臣妾近来还好。只是宫里的话，传得比风快。'
    if (role === 'child') return '儿臣近日在书房。太傅说，儿臣的字有长进。'
    if (role === 'servant') return '奴才还是管内廷的灯。昨夜东宫多点了两盏。'
    return '臣近来多在值房。手上的事，还没有办完。'
  }
  if (topicId === 'court') {
    const pending = state.pending?.[0]?.title
    return pending
      ? `朝中如今最急的是「${pending}」。臣不敢说谁对谁错，只知道再拖下去，会有人先动手。`
      : '朝中如今看似平静。越是平静，越有人在暗处走动。'
  }
  if (topicId === 'faction') {
    return `臣属${character.factionName || '朝中'}。这个身份，陛下用得上，也防得住。`
  }
  if (topicId === 'military') {
    return '北境的饷只发了一半。臣若再问，兵部就要参臣越权；臣若不问，营里就要出事。'
  }
  if (topicId === 'clan') {
    return '宗室近来对封地的事很上心。有人说，这是祖制；也有人说，这是借口。'
  }
  if (topicId === 'estate') {
    return '臣的封地今年收成不好。庄头报上来的数目，比去年少了两成。'
  }
  if (topicId === 'harem') {
    return '长春宫和储秀宫近来走得很近。臣妾没有证据，只是觉得她们在等什么。'
  }
  if (topicId === 'family') {
    return '臣妾的兄长还在吏部候缺。臣妾不敢求，但也不敢说他完全没有本事。'
  }
  if (topicId === 'heart') {
    return '臣妾入宫前，曾学过一点琴。陛下若想听，臣妾可以弹。'
  }
  if (topicId === 'study') {
    return '儿臣不敢偷懒。只是近日，有些静不下心。'
  }
  if (topicId === 'heir') {
    if (role === 'child') return '东宫近来没有大事。只是来的人，比从前多。'
    return '东宫角门那边，昨夜有车来过。奴才没有看清人。'
  }
  if (topicId === 'marriage') {
    return character.age >= 14
      ? '儿臣……还没有想好。母皇若一定要问，儿臣不敢说谎。'
      : '儿臣还小。这些事，等长大再说。'
  }
  if (topicId === 'inner') {
    return '内廷的册子都在。只是有些名字，奴才不敢写。'
  }
  if (topicId === 'errand') {
    return '奴才这就去办。办成之前，不会让别人知道。'
  }
  if (topicId === 'press') {
    return '臣/妾领罪。陛下说的每一句，臣/妾都记下了。'
  }
  if (topicId === 'soothe') {
    return '臣/妾谢恩。陛下这样说，臣/妾反倒不敢松口气。'
  }
  return '臣/妾听着。陛下请说。'
}

const applyChatEffects = (state, character, effects) => {
  if (!effects) return
  for (const [key, value] of Object.entries(effects)) {
    if (['loyalty', 'ambition', 'civil', 'military', 'strategy', 'charm', 'finance', 'health'].includes(key)) {
      character[key] = clamp((Number(character[key]) || 0) + (Number(value) || 0), 0, 100)
      continue
    }
    if (['prestige', 'popularity', 'intelligence', 'military'].includes(key)) {
      state.resources[key] = clamp(
        (Number(state.resources[key]) || 0) + (Number(value) || 0),
        key === 'prestige' || key === 'popularity' || key === 'intelligence' ? 0 : 0,
        100,
      )
    }
  }
}

export const askChatTopic = (state, characterId, topicId = 'greet') => {
  if (!state || state.status !== 'playing') {
    return { success: false, state, message: '当前无法召见' }
  }
  ensureChatFields(state)
  const character = (state.characters || []).find((item) => (
    item.id === characterId && item.alive !== false
  ))
  if (!character) return { success: false, state, message: '找不到此人' }
  if (
    state.chatSession?.characterId !== characterId
    || state.chatSession?.month !== monthIndex(state)
  ) {
    return { success: false, state, message: '先召见，再开口' }
  }

  const topic = getChatTopics(state, characterId).find((item) => item.id === topicId)
  if (!topic) return { success: false, state, message: '这个话题不适合现在问' }

  const next = clone(state)
  ensureChatFields(next)
  const target = next.characters.find((item) => item.id === characterId)
  const repeated = next.chatSession.asked?.includes(topicId)
  next.chatSession.asked = [...(next.chatSession.asked || []), topicId]

  const effects = repeated ? {} : { ...(topic.effects || {}) }
  applyChatEffects(next, target, effects)
  const reply = replyFor(topicId, target, next, repeated)
  const memory = next.chatMemory[characterId] || { chats: 0, notes: [] }
  memory.lastTopic = topicId
  if (!Array.isArray(memory.notes)) memory.notes = []
  if (!repeated && memory.notes.length < 8) {
    memory.notes.push({ month: monthIndex(next), topic: topic.label, text: reply })
  }
  next.chatMemory[characterId] = memory

  let note = ''
  if (!repeated && ['court', 'faction', 'military', 'harem', 'heir', 'inner'].includes(topicId)) {
    if (!Array.isArray(next.rumors)) next.rumors = []
    next.rumors.unshift({
      id: `rumor_chat_${monthIndex(next)}_${characterId}_${topicId}`,
      year: next.calendar?.year || 1,
      month: next.calendar?.month || 1,
      text: `${target.name}在召见中提到：${reply.slice(0, 42)}${reply.length > 42 ? '……' : ''}`,
      characterId: target.id,
      revealed: false,
      plot: 0,
    })
    next.rumors = next.rumors.slice(0, 60)
    note = '圣听 +1 · 密报已记下'
  }

  next.updatedAt = Date.now()
  return { success: true, state: next, reply, effects, note, characterName: target.name }
}

/**
 * 把一轮对话写进持久记忆。
 * 话题效果由 askChatTopic 结算，这里只存“说过什么”，供下次打开和 LLM 使用。
 */
export const appendChatTurn = (state, characterId, userText, replyText) => {
  if (!state) return { success: false, state, message: '存档不存在' }
  const next = clone(state)
  ensureChatFields(next)
  const character = (next.characters || []).find((item) => (
    item.id === characterId && item.alive !== false
  ))
  if (!character) return { success: false, state, message: '找不到此人' }

  const memory = next.chatMemory[characterId] || {
    chats: 0,
    lastTopic: '',
    notes: [],
    messages: [],
  }
  const stamp = `${next.calendar?.year || 1}年${next.calendar?.month || 1}月`
  memory.messages.push({ from: 'me', text: String(userText || ''), time: stamp })
  memory.messages.push({ from: 'them', text: String(replyText || ''), time: stamp })
  memory.messages = memory.messages.slice(-40)
  memory.lastMonth = monthIndex(next)
  next.chatMemory[characterId] = memory
  next.updatedAt = Date.now()
  return { success: true, state: next, message: '对话已记下' }
}

export const askChatFree = (state, characterId, text) => {
  const content = String(text || '')
  let topicId = 'greet'
  if (/军|饷|兵/.test(content)) topicId = 'military'
  else if (/盐|税|账|国库/.test(content)) topicId = 'faction'
  else if (/东宫|太子|储君/.test(content)) topicId = 'heir'
  else if (/后宫|侍宠|贵妃/.test(content)) topicId = 'harem'
  else if (/婚|亲事/.test(content)) topicId = 'marriage'
  else if (/课业|读书/.test(content)) topicId = 'study'
  else if (/内廷|内侍/.test(content)) topicId = 'inner'

  const topics = getChatTopics(state, characterId)
  if (!topics.some((item) => item.id === topicId)) topicId = 'greet'
  return askChatTopic(state, characterId, topicId)
}
