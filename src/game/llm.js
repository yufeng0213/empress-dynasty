/**
 * 王朝模式：AI 人设生成
 *
 * 本地已经掷好属性，这里只让模型写「人话」：
 * 背景、外貌、说话风格。数值永远不交给模型。
 *
 * 所有请求统一走服务端 /api/chat，密钥只存在服务器 .env 里。
 */

const BATCH_SIZE = 6
const MAX_BIO_LENGTH = 220

/**
 * 调用后端代理
 * @returns {Promise<{success:boolean, data:string, error:string}>}
 */
const callApi = async ({
  systemPrompt,
  userPrompt,
  temperature = 0.8,
  maxTokens = 2000,
  label = 'LLM',
  timeout = 120000,
}) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        systemPrompt,
        userPrompt,
        temperature,
        maxTokens,
        label,
        timeout,
      }),
    })

    const payload = await response.json().catch(() => null)

    if (!response.ok || !payload?.success) {
      return {
        success: false,
        data: '',
        error: payload?.error || `请求失败（${response.status}）`,
      }
    }

    return { success: true, data: String(payload.data || ''), error: '' }
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? '生成超时，已中断'
      : error?.message || '网络异常'
    return { success: false, data: '', error: message }
  } finally {
    clearTimeout(timer)
  }
}

const parseJsonArray = (raw) => {
  const text = String(raw || '').trim()
  if (!text) return null

  const tryParse = (candidate) => {
    try {
      const parsed = JSON.parse(candidate)
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    const parsed = tryParse(fenced[1].trim())
    if (parsed) return parsed
  }

  const direct = tryParse(text)
  if (direct) return direct

  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start >= 0 && end > start) {
    return tryParse(text.slice(start, end + 1))
  }

  return null
}

const fallbackProfile = (character) => {
  const tags = Array.isArray(character.tags) && character.tags.length > 0
    ? character.tags.join('、')
    : '谨慎'
  const faction = character.factionName ? `${character.factionName}` : '无党无派'
  return {
    id: character.id,
    bio: `${character.office || character.roleLabel || '朝臣'}，${faction}。${tags}。在朝中经营多年，行事有自己的分寸。`,
    appearance: '',
    speechStyle: '',
  }
}

const buildBatchPrompt = (batch, state) => {
  const payload = batch.map((item) => ({
    id: item.id,
    name: item.name,
    gender: item.gender,
    age: item.age,
    role: item.roleLabel || item.role,
    office: item.office,
    faction: item.factionName || '',
    loyalty: item.loyalty,
    ambition: item.ambition,
    ability: item.ability,
    civil: item.civil,
    military: item.military,
    strategy: item.strategy,
    charm: item.charm,
    finance: item.finance,
    health: item.health,
    tags: item.tags,
  }))

  return [
    `【世界】${state.dynastyName}，年号${state.eraName}，第${state.generation}代女帝${state.ruler?.name || ''}在位。`,
    '【任务】为下列人物写人设。只写文字，不要改动任何数值。',
    '【要求】',
    '- 每人 80-150 字中文，第三人称，写清楚出身、现任官职、靠什么立足、性格上的具体行为。',
    '- 必须体现 given 的官职、派系、忠诚、野心、五维能力（文治/武略/智谋/魅力/理财）与性格标签，不要与之矛盾。',
    '- 写事实和行为，不写空泛抒情、不堆砌外貌、不写心理独白。',
    '- 不要写现代词汇，不要用“系统”“数值”“好感度”等词。',
    '- 严格输出 JSON 数组，不要解释。',
    '【输出格式】',
    '[{"id":"...","bio":"...","appearance":"...","speechStyle":"..."}]',
    '【人物】',
    JSON.stringify(payload),
  ].join('\n')
}

/**
 * 为缺少人设的人物补写
 * @param {Object} state
 * @param {Function} onProgress (done, total)
 * @returns {Promise<{success:boolean, profiles:Object, error?:string}>}
 */
export const generateCharacterBios = async (state, onProgress) => {
  const characters = Array.isArray(state?.characters) ? state.characters : []
  const pending = characters.filter((item) => item.bioPending || !item.bio)
  if (pending.length === 0) {
    return { success: true, profiles: {}, error: '' }
  }

  const profiles = {}
  // 按身份分组：后宫单独成批，让模型的笔触更统一
  const grouped = new Map()
  for (const character of pending) {
    const key = character.role || 'other'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(character)
  }

  const batches = []
  for (const list of grouped.values()) {
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      batches.push(list.slice(i, i + BATCH_SIZE))
    }
  }

  let done = 0
  for (const batch of batches) {
    try {
      const result = await callApi({
        systemPrompt: '你是一位写人物小传的设定作者。只写具体事实和行为，不抒情。',
        userPrompt: buildBatchPrompt(batch, state),
        temperature: 0.85,
        maxTokens: 1400,
        label: 'Dynasty Bio',
        timeout: 90000,
      })

      const parsed = result.success ? parseJsonArray(result.data) : null
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const id = String(item?.id || '').trim()
          if (!id) continue
          profiles[id] = {
            bio: String(item.bio || '').trim().slice(0, MAX_BIO_LENGTH),
            appearance: String(item.appearance || '').trim().slice(0, 120),
            speechStyle: String(item.speechStyle || '').trim().slice(0, 80),
          }
        }
      }

      // 模型漏掉的人用本地模板补齐
      for (const character of batch) {
        if (!profiles[character.id]?.bio) {
          profiles[character.id] = fallbackProfile(character)
        }
      }
    } catch (error) {
      console.warn('[dynasty-llm] batch failed:', error?.message || error)
      for (const character of batch) {
        profiles[character.id] = fallbackProfile(character)
      }
    }

    done += batch.length
    if (typeof onProgress === 'function') {
      try {
        onProgress(done, pending.length)
      } catch {
        // 忽略 UI 回调异常
      }
    }
  }

  return { success: true, profiles, error: '' }
}

/**
 * 把本月的朝政事件扩写成长剧情
 */
export const generateEventNarrative = async ({ state, event }) => {
  const choices = Array.isArray(event?.choices) ? event.choices : []
  const prompt = [
    `【世界】${state.dynastyName}，年号${state.eraName}，${state.calendar.year}年${state.calendar.month}月。`,
    `【君主】女帝${state.ruler?.name || ''}，${state.ruler?.age || 16}岁。`,
    `【国情】威望${state.resources.prestige}，民心${state.resources.popularity}，国库${state.resources.treasury}贯，军力${state.resources.military}，圣听${state.resources.intelligence}。`,
    `【事件】${event.title}（来自${event.source}）`,
    `【事件概要】${event.text}`,
    `【在场人物】${(event.actors || []).map((actor) => `${actor.name}（${actor.office || actor.role || ''}）`).join('、') || '未点名'}`,
    '【可选处置】',
    ...choices.map((choice) => `- ${choice.text}（${choice.hint}）`),
    '【任务】把这件事写成 300-450 字的朝政奏报，不是小说，也不是判词。',
    '【只写现象】只写能看到、听到、被报上来的内容：谁在场、谁说了什么、桌上摆着什么证据或数字、哪里出了什么事。',
    '【开场】第一句直接进入事件，不写天气、宫殿、心情。',
    '【对白】可以有对白，但每句对白都必须推进事件、暴露立场或露出破绽。',
    '【不要原因】不要解释为什么会发生，不要写“因为/所以/显然/目的是/是为了/这说明”，不要给判断和结论。',
    '【不要催促】不要写“必须决断”“请陛下速裁”之类的话，只把现象摆出来。',
    '【不一定是事实】奏报可能不实：允许人物说谎、隐瞒、互相矛盾；不要替读者分辨真假，不要补充看不见的内情。',
    '【留一个矛盾】可以留一个对不上的细节，但不要解释它。',
    '【结构】分两段：第一段写现场与奏报；第二段写目前能看到的局面、不同说法和那个对不上的细节。',
    '【禁止】不要环境描写、心理描写、外貌描写、感情/暧昧、诗意比喻、感慨、回忆。',
    '【禁止】不要替玩家做选择，不要写任何选项的结果。',
    '【禁止】不要写“你感到”“她心里”这类内容；人物只能通过具体言行出现。',
    '【选项】每一项都必须是可执行的处置，后果由系统结算。',
    '【风格】白话为主，少量古意；句子短，信息密度高；不要小标题，不要 JSON。',
  ].join('\n')

  const result = await callApi({
    systemPrompt: '你是记录奏报的史官。写得具体、有场面，但只记事实和说法，不判断真假，不解释原因。',
    userPrompt: prompt,
    temperature: 0.65,
    maxTokens: 900,
    label: 'Dynasty Event',
    timeout: 120000,
  })

  if (!result.success) {
    return { success: false, text: '', error: result.error }
  }

  const text = String(result.data || '')
    .replace(/^```[\s\S]*?```$/g, '')
    .replace(/^#+\s*/gm, '')
    .trim()
    .slice(0, 1600)

  if (!text) {
    return { success: false, text: '', error: '返回为空' }
  }
  return { success: true, text, error: '' }
}

/**
 * 周期剧情：写现场与对白，不解释动机，不结算数值
 */
export const generateSceneNarrative = async ({ state, event }) => {
  const actors = Array.isArray(event?.actors) ? event.actors : []
  const choices = Array.isArray(event?.choices) ? event.choices : []
  const prompt = [
    `【世界】${state.dynastyName}，年号${state.eraName}，${state.calendar.year}年${state.calendar.month}月。`,
    `【君主】女帝${state.ruler?.name || ''}，${state.ruler?.age || 16}岁。`,
    `【场景】${event.title}（来自${event.source}）`,
    `【现场】${event.text}`,
    `【在场】${actors.map((actor) => `${actor.name}（${actor.office || actor.role || ''}）`).join('、') || '未点名'}`,
    '【可选处置】',
    ...choices.map((choice) => `- ${choice.text}（${choice.hint}）`),
    '【任务】写一场 300-500 字的宫廷场景，2-3 轮对白。',
    '【规则】只写现场、动作、对白、停顿、视线；不写心理独白，不解释动机，不写选项结果。',
    '【对白】每句话都要推进冲突、暴露立场或露出破绽；允许答非所问、沉默、撒谎。',
    '【氛围】不要天气、宫殿陈设、衣饰堆砌；用一个具体动作或物件制造压迫感。',
    '【收尾】停在玩家必须开口之前，不要替玩家做决定。',
    '【禁止】不要现代词汇，不要小标题，不要 JSON。',
  ].join('\n')

  const result = await callApi({
    systemPrompt: '你是宫廷场景编剧。只写现场和对白，不写心理，不解释动机，不结算后果。',
    userPrompt: prompt,
    temperature: 0.75,
    maxTokens: 1000,
    label: 'Dynasty Scene',
    timeout: 120000,
  })

  if (!result.success) {
    return { success: false, text: '', error: result.error }
  }

  const text = String(result.data || '')
    .replace(/^```[\s\S]*?```$/g, '')
    .replace(/^#+\s*/gm, '')
    .trim()
    .slice(0, 1800)

  if (!text) return { success: false, text: '', error: '返回为空' }
  return { success: true, text, error: '' }
}

/**
 * 召见聊天：只重写“这个人会怎么回话”。
 * 话题、关系、效果已由 chat.js 本地结算，模型不得改数值。
 */
export const generateChatReply = async ({
  state,
  character,
  topicLabel,
  message,
  history = [],
  localReply = '',
}) => {
  const recent = (Array.isArray(history) ? history : [])
    .slice(-8)
    .map((item) => `${item.from === 'me' ? '陛下' : character.name}：${item.text}`)
    .join('\n')

  const prompt = [
    `【世界】${state.dynastyName}，年号${state.eraName}，${state.calendar?.year || 1}年${state.calendar?.month || 1}月。`,
    `【君主】女帝${state.ruler?.name || ''}，${state.ruler?.age || 16}岁。`,
    `【你扮演】${character.name}，${character.gender || ''}，${character.age || ''}岁。`,
    `【身份】${character.office || character.roleLabel || '朝臣'}；${character.factionName || '无派系'}。`,
    `【性格标签】${(character.tags || []).join('、') || '谨慎'}`,
    `【人设】${character.bio || character.speechStyle || '在朝中经营多年，说话有自己的分寸。'}`,
    `【数值状态】忠诚 ${character.loyalty ?? 50}，野心 ${character.ambition ?? 40}。不要直接说出这些数字。`,
    `【本轮话题】${topicLabel || '自由对话'}`,
    `【陛下刚说】${message || topicLabel || ''}`,
    `【本地事实骨架】${localReply || '臣/妾听着。'}`,
    recent ? `【最近对话】\n${recent}` : '',
    '【任务】只写这个人此刻会说的回话，80-180 字。',
    '【规则】第一人称；可以停顿、反问、回避、撒谎、答非所问；不能替陛下做决定。',
    '【规则】必须与本地事实骨架不矛盾；可以补充语气和细节，但不能改结论。',
    '【禁止】不要写数值、选项、系统提示、心理独白、旁白总结；不要现代词汇。',
    '【禁止】不要写“作为AI”“根据设定”之类的话。',
    '【输出】只输出回话正文，不要引号，不要标题，不要 JSON。',
  ].filter(Boolean).join('\n')

  const result = await callApi({
    systemPrompt: `你扮演${character.name}，${character.office || character.roleLabel || '朝臣'}。只回一句话或一小段话，不跳出角色。`,
    userPrompt: prompt,
    temperature: 0.88,
    maxTokens: 500,
    label: 'Dynasty Chat',
    timeout: 60000,
  })

  if (!result.success) {
    return { success: false, text: '', error: result.error }
  }

  const text = String(result.data || '')
    .replace(/^```[\s\S]*?```$/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/^["“]|["”]$/g, '')
    .replace(/^(回话|答复|回答)[:：]\s*/i, '')
    .trim()
    .slice(0, 420)

  if (!text) return { success: false, text: '', error: '返回为空' }
  return { success: true, text, error: '' }
}

export const applyBiosToState = (state, profiles) => {
  if (!state || !profiles) return state
  const next = JSON.parse(JSON.stringify(state))
  for (const character of next.characters) {
    const profile = profiles[character.id]
    if (!profile) continue
    character.bio = profile.bio || character.bio || ''
    character.appearance = profile.appearance || character.appearance || ''
    character.speechStyle = profile.speechStyle || character.speechStyle || ''
    character.bioPending = false
  }
  next.updatedAt = Date.now()
  return next
}
