/**
 * 周期剧情：固定每 3 个月触发一段“有人在场”的场景。
 *
 * 规则层决定参与者、选项与后果；文本先给本地版，
 * 配置了 LLM 时再由 scene prompt 重写对白与现场。
 */

const res = (key, value) => ({ target: 'resource', key, value })
const char = (id, key, value) => ({ target: 'character', id, key, value })
const faction = (key, value) => ({ target: 'faction', faction: key, loyalty: value })
const rumor = (text, characterId = '', revealed = false) => ({
  target: 'rumor', text, characterId, revealed,
})

const pickOne = (rng, list) => {
  if (!Array.isArray(list) || list.length === 0) return null
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))]
}

const alive = (state, filter) => (state.characters || []).filter((item) => (
  item.alive !== false && (!filter || filter(item))
))

const actorOf = (character) => (character ? {
  id: character.id,
  name: character.name,
  office: character.office || character.roleLabel || '',
  role: character.role,
} : null)

const SCENE_DEFS = [
  {
    id: 'corridor_quarrel',
    title: '廊下争吵',
    source: '剧情',
    weight: 10,
    build(state, rng) {
      const ministers = alive(state, (item) => item.role === 'minister')
      if (ministers.length < 2) return null
      const first = pickOne(rng, ministers)
      const second = pickOne(rng, ministers.filter((item) => item.id !== first.id))
      if (!first || !second) return null
      return {
        text: `散朝后，${first.name}在廊下拦住${second.name}，说他在御前抢了自己的话。${second.name}没有退，身后的内侍都低了头。`,
        actors: [actorOf(first), actorOf(second)],
        choices: [
          {
            id: 'punish_both',
            text: '各打五十大板',
            hint: '威望 -1 · 双方好感 -2',
            effects: [res('prestige', -1), char(first.id, 'loyalty', -2), char(second.id, 'loyalty', -2)],
            resultText: '两个人都被罚了俸。廊下的内侍，换了一批。',
          },
          {
            id: 'side_first',
            text: `偏袒${first.name}`,
            hint: `${first.name}好感 +8 · ${second.name}好感 -10`,
            effects: [char(first.id, 'loyalty', 8), char(second.id, 'loyalty', -10), faction(first.faction, 4), faction(second.faction, -4)],
            resultText: `${first.name}谢了恩。${second.name}此后在朝会上站得更靠后。`,
          },
          {
            id: 'ignore',
            text: '装没听见',
            hint: '威望 -1 · 双方野心 +3',
            effects: [res('prestige', -1), char(first.id, 'ambition', 3), char(second.id, 'ambition', 3)],
            resultText: '你从廊下走了过去。第二天，两个人各自请了病。',
          },
        ],
      }
    },
  },
  {
    id: 'frontier_letter',
    title: '边关来信',
    source: '剧情',
    weight: 9,
    build(state, rng) {
      const actor = alive(state, (item) => item.role === 'minister')
        .sort((a, b) => (Number(b.military) || 0) - (Number(a.military) || 0))[0]
      if (!actor) return null
      return {
        text: `北境来信只有两行：营中还有四十日粮。若朝廷再不发饷，臣只能先遣散老弱。信的末尾没有求情，只写“臣不敢瞒”。`,
        actors: [actorOf(actor)],
        choices: [
          {
            id: 'pay',
            text: '即刻发饷',
            hint: '国库 -900 · 军力 +5 · 该官好感 +8',
            effects: [res('treasury', -900), res('military', 5), char(actor.id, 'loyalty', 8)],
            resultText: '饷银出京。边军的回信只有两个字：收到。',
          },
          {
            id: 'audit',
            text: '先查粮道',
            hint: '圣听 +3 · 该官好感 -5',
            effects: [res('intelligence', 3), char(actor.id, 'loyalty', -5)],
            resultText: '查粮的御史还没出京，北境又来了第二封信。',
          },
          {
            id: 'self_fund',
            text: '令其自筹',
            hint: '威望 +2 · 军力 -2 · 该官好感 -10',
            effects: [res('prestige', 2), res('military', -2), char(actor.id, 'loyalty', -10)],
            resultText: `${actor.name}没有再写信。边军开始自己想办法。`,
          },
        ],
      }
    },
  },
  {
    id: 'night_audience',
    title: '深夜召见',
    source: '剧情',
    weight: 9,
    build(state, rng) {
      const actor = pickOne(rng, alive(state, (item) => item.role === 'minister'))
      if (!actor) return null
      return {
        text: `夜里，${actor.name}把一封没有署名的信放在案上，说户部有人提前兑了今年的盐引。他没有跪，只问：“陛下要臣查，还是臣替陛下压下去？”`,
        actors: [actorOf(actor)],
        choices: [
          {
            id: 'investigate',
            text: '让他查',
            hint: '圣听 +4 · 朝臣好感 -3',
            effects: [res('intelligence', 4), char(actor.id, 'loyalty', -3), rumor('盐引被提前兑付，涉及户部。', actor.id, false)],
            resultText: '他收了信，退到门口才行礼。第二天，户部有两个人告病。',
          },
          {
            id: 'suppress',
            text: '让他压下去',
            hint: '威望 +2 · 圣听 -2 · 该官好感 +5',
            effects: [res('prestige', 2), res('intelligence', -2), char(actor.id, 'loyalty', 5)],
            resultText: `信被放进烛火里。${actor.name}看着它烧完，才退出去。`,
          },
          {
            id: 'read',
            text: '先把信留下',
            hint: '圣听 +2 · 获得一条线索',
            effects: [res('intelligence', 2), rumor('匿名信提到盐引与户部，细节尚不清楚。', '', false)],
            resultText: `信留在了御书房。${actor.name}空着手走了。`,
          },
        ],
      }
    },
  },
  {
    id: 'consort_plea',
    title: '枕边求官',
    source: '剧情',
    weight: 8,
    build(state, rng) {
      const actor = pickOne(rng, alive(state, (item) => item.role === 'consort'))
      if (!actor) return null
      return {
        text: `${actor.name}替兄长求一个知州。她说得很轻，像只是随口提起；说完又替你添了茶，没有再看他。`,
        actors: [actorOf(actor)],
        choices: [
          {
            id: 'grant',
            text: '准了',
            hint: '国库 -300 · 该侍宠好感 +6 · 圣听 -2',
            effects: [res('treasury', -300), char(actor.id, 'loyalty', 6), res('intelligence', -2)],
            resultText: `${actor.name}的兄长补了知州。她谢恩时，没有抬头。`,
          },
          {
            id: 'refuse',
            text: '不准',
            hint: '该侍宠好感 -8 · 威望 +2',
            effects: [char(actor.id, 'loyalty', -8), res('prestige', 2)],
            resultText: `${actor.name}收了茶盏，退了出去。那晚的灯，灭得很早。`,
          },
          {
            id: 'comfort',
            text: '不置可否，留她说话',
            hint: '该侍宠好感 +3 · 野心 -2',
            effects: [char(actor.id, 'loyalty', 3), char(actor.id, 'ambition', -2)],
            resultText: '她没有再提兄长。临走时，问了一句“陛下今晚还来吗”。',
          },
        ],
      }
    },
  },
  {
    id: 'heir_lesson',
    title: '皇子逃学',
    source: '剧情',
    weight: 7,
    build(state, rng) {
      const child = pickOne(rng, alive(state, (item) => item.role === 'child' && Number(item.age) >= 5))
      const tutor = pickOne(rng, alive(state, (item) => item.role === 'minister'))
      if (!child || !tutor) return null
      return {
        text: `太傅${tutor.name}说，${child.name}近日不肯读书，只爱在御花园射鸟。今日又射落了一只御赐的白鹤。`,
        actors: [actorOf(child), actorOf(tutor)],
        choices: [
          {
            id: 'strict',
            text: '严加管教',
            hint: `${child.name}好感 -5 · 文治 +3 · 太傅好感 +3`,
            effects: [char(child.id, 'loyalty', -5), char(child.id, 'civil', 3), char(tutor.id, 'loyalty', 3)],
            resultText: `${child.name}被关在书房抄了三天书。白鹤的事，没人再提。`,
          },
          {
            id: 'indulge',
            text: '随他去吧',
            hint: `${child.name}好感 +4 · 文治 -2`,
            effects: [char(child.id, 'loyalty', 4), char(child.id, 'civil', -2)],
            resultText: `${child.name}得了新弓。太傅称病，三天没进书房。`,
          },
          {
            id: 'replace',
            text: '换一位师傅',
            hint: '国库 -200 · 文治 +2 · 太傅好感 -4',
            effects: [res('treasury', -200), char(child.id, 'civil', 2), char(tutor.id, 'loyalty', -4)],
            resultText: `新师傅从翰林院调来。${tutor.name}把书箱搬走时，一句话没说。`,
          },
        ],
      }
    },
  },
  {
    id: 'eunuch_warning',
    title: '御书房外的灰',
    source: '剧情',
    weight: 7,
    build(state, rng) {
      const actor = pickOne(rng, alive(state, (item) => item.role === 'servant'))
      if (!actor) return null
      return {
        text: `${actor.name}说，昨夜有人在御书房外烧纸。灰里捡到半张名单，上面的字被火燎去了一半。`,
        actors: [actorOf(actor)],
        choices: [
          {
            id: 'investigate',
            text: '彻查',
            hint: '圣听 +4 · 威望 -1',
            effects: [res('intelligence', 4), res('prestige', -1), rumor('御书房外有人烧纸，灰里留下半张名单。', '', false)],
            resultText: '名单上剩下三个字，其中一个能对上户部的人。',
          },
          {
            id: 'suppress',
            text: '压下，不许再查',
            hint: '威望 +2 · 圣听 -2',
            effects: [res('prestige', 2), res('intelligence', -2)],
            resultText: `灰被扫了。${actor.name}再没提过这件事。`,
          },
          {
            id: 'reward',
            text: '赏他，继续盯着',
            hint: '国库 -100 · 圣听 +2 · 该侍从好感 +5',
            effects: [res('treasury', -100), res('intelligence', 2), char(actor.id, 'loyalty', 5)],
            resultText: `${actor.name}收了赏。御书房外的夜，从此多了一个人。`,
          },
        ],
      }
    },
  },
]

export const ensureSceneFields = (state) => {
  if (!state) return state
  if (typeof state.lastSceneMonth !== 'number') state.lastSceneMonth = 0
  return state
}

/**
 * 每 3 个月触发一段；同一个月只触发一次。
 */
export const rollScene = (state, rng, monthIndex) => {
  ensureSceneFields(state)
  if (monthIndex <= 0 || monthIndex % 3 !== 0) return null
  if (state.lastSceneMonth === monthIndex) return null

  const candidates = [...SCENE_DEFS]
  for (let attempt = 0; attempt < candidates.length; attempt += 1) {
    const index = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))
    const def = candidates[index]
    const built = typeof def.build === 'function' ? def.build(state, rng) : null
    if (!built) {
      candidates.splice(index, 1)
      continue
    }
    state.lastSceneMonth = monthIndex
    return {
      instanceId: `scene_${monthIndex}_${def.id}`,
      eventId: `scene_${def.id}`,
      kind: 'scene',
      title: built.title || def.title,
      source: def.source || '剧情',
      text: built.text || '',
      actors: (built.actors || []).filter(Boolean),
      year: state.calendar?.year || 1,
      month: state.calendar?.month || 1,
      resolved: false,
      missed: false,
      choices: (built.choices || []).map((choice) => ({ ...choice })),
    }
  }
  return null
}
