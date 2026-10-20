/**
 * 皇宫行走：宫室、行动、身份遭遇与即时结算。
 *
 * 和月度奏折分开：这里是玩家主动消耗行动点触发的事件，
 * 共用资源、人物、密报与后宫张力，不另造一套数值。
 */

import { clamp, pick, randInt } from './random.js'
import { recordActivity } from './activity.js'

const clone = (value) => JSON.parse(JSON.stringify(value))

const res = (key, value) => ({ key, value })

export const PALACE_ROOMS = [
  {
    id: 'gate', name: '午门', subtitle: '宫门 · 金水桥', zone: 'front', x: 50, y: 93,
    desc: '宫城正门。外臣、使节、禁军、递牌子的人都在这里。',
    tags: ['前朝', '宫门', '外使'],
    actions: [
      { id: 'inspect_gate', label: '巡查宫门', cost: 1, focus: '宫禁', roles: ['guard', 'eunuch', 'minister'], nightRoles: ['assassin'], desc: '看换防、看令牌、看谁在门外等。' },
      { id: 'receive_envoy', label: '接见外使', cost: 1, focus: '外事', roles: ['envoy', 'minister'], desc: '使节在门外候着，礼数背后是试探。' },
    ],
  },
  {
    id: 'hall', name: '太和殿', subtitle: '大朝 · 丹墀', zone: 'front', x: 50, y: 78,
    desc: '大朝会的地方。所有人都在看你，所有人也都在演。',
    tags: ['前朝', '朝会', '正式'],
    actions: [
      { id: 'court', label: '临朝听政', cost: 1, focus: '朝政', roles: ['minister', 'clan'], desc: '听奏、看人、看谁站错了位置。' },
      { id: 'summon', label: '单独召见', cost: 1, focus: '密谈', roles: ['minister', 'clan'], nightRoles: ['eunuch'], desc: '散朝后留下一个人，问他不方便在殿上说的话。' },
    ],
  },
  {
    id: 'study', name: '御书房', subtitle: '批折 · 密档', zone: 'front', x: 60, y: 66,
    desc: '你真正处理朝政的地方。折子、旧档、匿名信，都堆在这里。',
    tags: ['前朝', '奏折', '密档'],
    actions: [
      { id: 'read', label: '批阅奏折', cost: 1, focus: '政务', roles: ['minister', 'eunuch'], desc: '翻折子，看谁的话前后对不上。' },
      { id: 'archive', label: '翻旧档', cost: 1, focus: '查案', roles: ['eunuch', 'scholar'], nightRoles: ['assassin'], desc: '旧档不会说话，但会留下缺页。' },
    ],
  },
  {
    id: 'cabinet', name: '内阁值房', subtitle: '票拟 · 密议', zone: 'front', x: 40, y: 66,
    desc: '票拟从这里出，很多事也在这里定。你看到的折子，已经被他们先看过了。',
    tags: ['前朝', '内阁', '票拟'],
    actions: [
      { id: 'draft', label: '看票拟', cost: 1, focus: '政务', roles: ['minister'], desc: '看谁改了哪一句，谁把自己的意思写成了你的意思。' },
      { id: 'private', label: '撞破私议', cost: 1, focus: '党争', roles: ['minister', 'clan'], nightRoles: ['eunuch'], desc: '不通报就过去，看看他们在说什么。' },
    ],
  },
  {
    id: 'library', name: '文渊阁', subtitle: '翰林 · 藏书', zone: 'front', x: 74, y: 66,
    desc: '翰林院和藏书楼。前朝旧档、实录、禁书都在这里。',
    tags: ['前朝', '翰林', '旧档'],
    actions: [
      { id: 'lecture', label: '听讲', cost: 1, focus: '文治', roles: ['scholar', 'minister'], desc: '讲的是经史，问的是当下。' },
      { id: 'forbidden', label: '查禁书', cost: 1, focus: '旧案', roles: ['scholar', 'eunuch'], nightRoles: ['assassin'], desc: '有些书被放在最里面，不是因为旧。' },
    ],
  },
  {
    id: 'guardroom', name: '禁军值房', subtitle: '点兵 · 换防', zone: 'front', x: 80, y: 84,
    desc: '宫城武备的中枢。谁拿钥匙、谁换防、谁夜里不当值，都在这里。',
    tags: ['前朝', '禁军', '兵变'],
    actions: [
      { id: 'muster', label: '点兵', cost: 1, focus: '军务', roles: ['guard', 'general'], desc: '看人数、看甲胄、看谁没来。' },
      { id: 'shift', label: '查换防', cost: 1, focus: '宫禁', roles: ['guard', 'eunuch'], nightRoles: ['assassin'], desc: '换防的名单，比兵符更能说明问题。' },
    ],
  },
  {
    id: 'qianqing', name: '乾清门', subtitle: '内外之分', zone: 'inner', x: 50, y: 55,
    desc: '前朝与内廷的分界。进了这道门，规矩就换了一套。',
    tags: ['内廷', '门禁', '递牌子'],
    actions: [
      { id: 'get_token', label: '领宫门令', cost: 0, focus: '宫禁', special: 'token', roles: ['guard', 'eunuch'], desc: '夜入内廷需宫门令；领取后本旬有效。' },
      { id: 'token', label: '查令牌', cost: 1, focus: '宫禁', roles: ['guard', 'eunuch'], nightRoles: ['assassin'], desc: '谁有资格在夜里进内廷？' },
      { id: 'wait', label: '在门内等一等', cost: 1, focus: '偶遇', roles: ['consort', 'eunuch', 'minister'], desc: '不急着走，看看谁会从这里经过。' },
    ],
  },
  {
    id: 'kunning', name: '坤宁宫', subtitle: '中宫 · 侍寝', zone: 'inner', x: 50, y: 42,
    desc: '你的寝宫。离你最近的人，也最容易替别人说话。',
    tags: ['内廷', '后宫', '侍寝'],
    actions: [
      { id: 'consort', label: '召幸', cost: 1, focus: '后宫', roles: ['consort', 'maid'], desc: '听枕边话，也听她没说的话。' },
      { id: 'stay', label: '留宿', cost: 1, focus: '后宫', roles: ['consort'], desc: '留宿算一次行动；后宫张力 +2，体力 -1。' },
      { id: 'night_talk', label: '留人说话', cost: 1, focus: '私情', roles: ['consort', 'maid'], nightRoles: ['eunuch'], desc: '不急着睡，问一些白天不能问的事。' },
    ],
  },
  {
    id: 'changchun', name: '长春宫', subtitle: '东六宫 · 侍宠', zone: 'inner', x: 36, y: 34,
    desc: '侍宠居所。表面上安静，暗地里每扇门都有人听。',
    tags: ['内廷', '后宫', '争宠'],
    actions: [
      { id: 'visit', label: '探视', cost: 1, focus: '后宫', roles: ['consort', 'maid'], desc: '看她的脸色，也看她屋里多了什么。' },
      { id: 'stay', label: '留宿', cost: 1, focus: '后宫', roles: ['consort'], desc: '在她的宫里留宿；后宫张力 +2，体力 -1。' },
      { id: 'eavesdrop', label: '听墙角', cost: 1, focus: '密事', roles: ['maid', 'eunuch', 'consort'], nightRoles: ['assassin'], desc: '不进去，只站在窗外。' },
    ],
  },
  {
    id: 'chuxiu', name: '储秀宫', subtitle: '西六宫 · 侍宠', zone: 'inner', x: 64, y: 34,
    desc: '另一位侍宠的居所。和长春宫隔着一座御花园，消息却比花园还近。',
    tags: ['内廷', '后宫', '争宠'],
    actions: [
      { id: 'visit2', label: '探视', cost: 1, focus: '后宫', roles: ['consort', 'maid'], desc: '看她是真的病，还是不想见人。' },
      { id: 'stay', label: '留宿', cost: 1, focus: '后宫', roles: ['consort'], desc: '在她的宫里留宿；后宫张力 +2，体力 -1。' },
      { id: 'garden_walk', label: '约去御花园', cost: 1, focus: '私会', roles: ['consort', 'maid'], nightRoles: ['assassin'], desc: '在花园里说话，比在屋里安全，也更危险。' },
    ],
  },
  {
    id: 'garden', name: '御花园', subtitle: '假山 · 亭台', zone: 'inner', x: 50, y: 24,
    desc: '宫里唯一像“外面”的地方。偶遇、私会、争执、偷听，都发生在这里。',
    tags: ['内廷', '偶遇', '夜巡'],
    actions: [
      { id: 'walk', label: '散步', cost: 1, focus: '偶遇', roles: ['consort', 'prince', 'minister', 'eunuch'], nightRoles: ['assassin', 'maid'], desc: '不带人，走到哪里算哪里。' },
      { id: 'night_walk', label: '夜游', cost: 1, focus: '密事', roles: ['maid', 'eunuch', 'consort'], nightRoles: ['assassin'], desc: '灯少，人多。' },
    ],
  },
  {
    id: 'eastpalace', name: '东宫', subtitle: '书房 · 子嗣', zone: 'east', x: 78, y: 43,
    desc: '子嗣读书、起居的地方。太傅、宫女、皇子、皇女都在这里。',
    tags: ['东宫', '子嗣', '课业'],
    actions: [
      { id: 'lesson', label: '查课业', cost: 1, focus: '子嗣', roles: ['prince', 'tutor'], desc: '看字，也看太傅敢不敢管。' },
      { id: 'sick', label: '探病', cost: 1, focus: '子嗣', roles: ['prince', 'physician'], nightRoles: ['assassin'], desc: '太医说只是风寒，孩子却一直看着门外。' },
    ],
  },
  {
    id: 'hospital', name: '太医院', subtitle: '诊脉 · 药房', zone: 'west', x: 24, y: 53,
    desc: '宫里所有“病”的第一站。药渣、脉案、假孕，都从这里开始。',
    tags: ['西苑', '医药', '后宫'],
    actions: [
      { id: 'pulse', label: '问诊', cost: 1, focus: '身体', roles: ['physician', 'consort'], desc: '让太医说真话，或者至少说一半。' },
      { id: 'medicine', label: '查药渣', cost: 1, focus: '查案', roles: ['physician', 'maid'], nightRoles: ['assassin'], desc: '药渣不会撒谎，但会少一味。' },
    ],
  },
  {
    id: 'household', name: '内务府', subtitle: '采买 · 内库', zone: 'west', x: 16, y: 64,
    desc: '宫里的钱和物都从这里过。账做得越平，越可能有问题。',
    tags: ['西苑', '内库', '采买'],
    actions: [
      { id: 'accounts', label: '查账', cost: 1, focus: '内库', roles: ['steward', 'eunuch'], desc: '看今年的采买，比去年贵在哪里。' },
      { id: 'supply', label: '见采买', cost: 1, focus: '商人', roles: ['merchant', 'steward'], desc: '商人进宫，不会只带账本。' },
    ],
  },
  {
    id: 'kitchen', name: '尚食局', subtitle: '御膳 · 试毒', zone: 'west', x: 28, y: 72,
    desc: '你每天入口的东西都从这里出。厨子、宫女、试毒内侍，谁都能动手。',
    tags: ['西苑', '膳食', '下毒'],
    actions: [
      { id: 'taste', label: '试膳', cost: 1, focus: '膳食', roles: ['cook', 'maid'], desc: '看菜色，也看谁不敢动筷。' },
      { id: 'ingredient', label: '查食材', cost: 1, focus: '查案', roles: ['cook', 'eunuch'], nightRoles: ['assassin'], desc: '少了一味料，或者多了一味。' },
    ],
  },
  {
    id: 'cold', name: '冷宫', subtitle: '废妃 · 旧事', zone: 'west', x: 12, y: 40,
    desc: '被废的人住在这里。宫门一关，外面的说法就由别人来写。',
    tags: ['西苑', '废妃', '旧案'],
    actions: [
      { id: 'visit_cold', label: '探视废妃', cost: 1, focus: '旧事', roles: ['deposed', 'guard'], nightRoles: ['assassin'], desc: '她还记得多少，取决于她还敢说多少。' },
      { id: 'old_case', label: '查旧案', cost: 1, focus: '查案', roles: ['eunuch', 'guard', 'deposed'], desc: '冷宫里最不缺的，就是没有结案的旧事。' },
    ],
  },
  {
    id: 'eunuch', name: '内侍省', subtitle: '宦官 · 密报', zone: 'east', x: 88, y: 56,
    desc: '宫里消息最快的地方。谁见过谁、谁收了什么、谁夜里没回房，这里都有记录。',
    tags: ['东宫', '内侍', '密报'],
    actions: [
      { id: 'report', label: '收密报', cost: 1, focus: '密报', roles: ['eunuch', 'maid'], desc: '听他们说，也看他们不敢说什么。' },
      { id: 'investigate_eunuch', label: '查内侍', cost: 1, focus: '宫禁', roles: ['eunuch', 'guard'], nightRoles: ['assassin'], desc: '内侍省的人，最知道谁在替谁办事。' },
    ],
  },
  {
    id: 'shrine', name: '奉先殿', subtitle: '太庙 · 祭祀', zone: 'rite', x: 50, y: 11,
    desc: '祖先牌位所在。祭祀、谶语、合法性，都在这里被说出来。',
    tags: ['祭祀', '宗室', '合法性'],
    actions: [
      { id: 'ritual', label: '祭祀', cost: 1, focus: '礼法', roles: ['clan', 'minister'], desc: '看谁站在前面，谁的名字被念错。' },
      { id: 'omen', label: '查谶语', cost: 1, focus: '谶语', roles: ['monk', 'eunuch'], nightRoles: ['assassin'], desc: '香灰里的字，往往比折子上的字更真。' },
    ],
  },
]

const ACTOR_LABELS = {
  minister: '朝臣',
  eunuch: '内侍',
  consort: '侍宠',
  guard: '禁军',
  physician: '太医',
  steward: '内务府',
  prince: '子嗣',
  tutor: '太傅',
  maid: '宫女',
  assassin: '刺客',
  clan: '宗室',
  envoy: '外使',
  monk: '僧道',
  scholar: '翰林',
  cook: '尚食',
  deposed: '废妃',
  merchant: '商人',
  general: '将领',
}

const CORE_ROLE_MAP = {
  minister: 'minister',
  eunuch: 'servant',
  guard: 'servant',
  physician: 'servant',
  steward: 'servant',
  cook: 'servant',
  maid: 'servant',
  tutor: 'minister',
  scholar: 'minister',
  general: 'minister',
  consort: 'consort',
  prince: 'child',
  clan: 'clan',
}

const TEMP_NAMES = {
  assassin: ['黑衣客', '无名者'],
  envoy: ['阿史那', '拓跋信'],
  monk: ['无尘', '玄真'],
  merchant: ['钱四海', '胡掌柜'],
  deposed: ['废后柳氏', '旧贵人'],
}

const pickOne = (rng, list) => {
  if (!Array.isArray(list) || list.length === 0) return null
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))]
}

const findRoom = (roomId) => PALACE_ROOMS.find((room) => room.id === roomId) || null
const findAction = (room, actionId) => room?.actions.find((action) => action.id === actionId) || null

const log = (state, title, desc, type = 'palace') => {
  if (!Array.isArray(state.log)) state.log = []
  state.log.unshift({
    id: `log_${state.calendar?.year || 1}_${state.calendar?.month || 1}_palace_${state.log.length + 1}`,
    year: state.calendar?.year || 1,
    month: state.calendar?.month || 1,
    type,
    title,
    desc,
  })
  if (state.log.length > 500) state.log = state.log.slice(-500)
}

const resolveActor = (state, kind) => {
  const coreRole = CORE_ROLE_MAP[kind]
  const pool = coreRole
    ? (state.characters || []).filter((item) => item.alive !== false && item.role === coreRole)
    : []
  let character = null
  if (kind === 'general') {
    character = [...pool].sort((a, b) => (Number(b.military) || 0) - (Number(a.military) || 0))[0] || null
  } else {
    character = pickOne(Math.random, pool)
  }

  if (character) {
    return {
      id: character.id,
      name: character.name,
      office: character.office || ACTOR_LABELS[kind] || '',
      kind,
      label: ACTOR_LABELS[kind] || kind,
      persistent: true,
    }
  }

  const names = TEMP_NAMES[kind] || [ACTOR_LABELS[kind] || '宫人']
  return {
    id: '',
    name: names[Math.floor(Math.random() * names.length)],
    office: ACTOR_LABELS[kind] || '',
    kind,
    label: ACTOR_LABELS[kind] || kind,
    persistent: false,
  }
}

const PALACE_EVENTS = [
  {
    id: 'impeach', roles: ['minister'], actions: ['court', 'summon'], title: '殿上弹劾',
    text: '{actor}在丹墀下弹劾另一位朝臣，说他私吞河工银。被弹的人跪着，没有辩解，只看了你一眼。',
    choices: [
      { text: '当场下狱', hint: '圣听 +3 · 朝臣好感 -3', effects: { intelligence: 3, actor: { loyalty: -3 } }, result: '人被拖下去。{actor}的弹章念了一半，后半段没人再听。' },
      { text: '留中再审', hint: '威望 +1', effects: { prestige: 1 }, result: '两个人都退下了。河工的账，送到御书房时已经是半个月后。' },
      { text: '各打五十', hint: '威望 -1 · 朝臣野心 +2', effects: { prestige: -1, actor: { ambition: 2 } }, result: '弹劾和被弹的人一起罚俸。朝堂安静了三天。' },
    ],
  },
  {
    id: 'clan_court', roles: ['clan'], actions: ['court', 'summon'], title: '祖宗之法',
    text: '{actor}在朝会上提起祖制，说近来用人太急，宗室子弟反倒闲置。殿上没有人接话。',
    choices: [
      { text: '当场驳斥', hint: '威望 +1 · 宗室好感 -4', effects: { prestige: 1, actor: { loyalty: -4 } }, result: '{actor}退了半步，仍把“祖制”两个字说完了。' },
      { text: '选一名宗室入朝', hint: '宗室好感 +5 · 朝臣好感 -2', effects: { actor: { loyalty: 5 }, intelligence: -2 }, result: '{actor}谢恩。朝臣那边，有人轻轻合上了笏板。' },
      { text: '留中不答', hint: '威望 -1', effects: { prestige: -1 }, result: '朝会散了。{actor}走得很慢，像在等谁叫住他。' },
    ],
  },
  {
    id: 'pressed_memorial', roles: ['minister'], actions: ['read'], title: '缺页的折子',
    text: '{actor}递上来的折子少了三页。他说是誊录时漏了，可切口很整齐。',
    choices: [
      { text: '追查缺页', hint: '圣听 +3 · 威望 +1', effects: { intelligence: 3, prestige: 1 }, result: '缺页在值房的炭盆里找到了。剩下的字，够让一个人下狱。' },
      { text: '留中不发', hint: '威望 -1 · 圣听 -1', effects: { prestige: -1, intelligence: -1 }, result: '折子压下了。{actor}第二天递了请安折，字写得比往常工整。' },
      { text: '让他重写', hint: '圣听 +1', effects: { intelligence: 1 }, result: '重写的折子多了三页，少了两个名字。' },
    ],
  },
  {
    id: 'cabinet_private', roles: ['minister'], actions: ['draft', 'private'], title: '值房私议',
    text: '你走到内阁窗外，听见{actor}说：“陛下总会知道的。”另一个人说：“等知道时，已经晚了。”',
    choices: [
      { text: '推门进去', hint: '威望 +2 · 朝臣好感 -3', effects: { prestige: 2, actor: { loyalty: -3 } }, result: '屋里安静下来。{actor}先跪了，另一个人还在看桌上的票拟。' },
      { text: '记下名字', hint: '圣听 +2', effects: { intelligence: 2 }, result: '你没有进去。第二天，那份票拟被换成了另一份。' },
      { text: '装没听见', hint: '威望 -1', effects: { prestige: -1 }, result: '你走了。值房里的灯，亮到很晚。' },
    ],
  },
  {
    id: 'archive_secret', roles: ['scholar', 'eunuch'], actions: ['archive', 'forbidden', 'lecture'], title: '前朝旧档',
    text: '{actor}在文渊阁最里面找到一箱旧档，封条是前朝的。里面有一份名单，和本朝三位重臣同名。',
    choices: [
      { text: '封存', hint: '圣听 +3 · 威望 +1', effects: { intelligence: 3, prestige: 1 }, result: '旧档封了。{actor}说，名单上还有一个名字，被墨涂掉了。' },
      { text: '抄一份', hint: '圣听 +4 · 朝臣好感 -2', effects: { intelligence: 4, actor: { loyalty: -2 } }, result: '抄本进了御书房。原本放回原处，封条重新贴好。' },
      { text: '烧掉', hint: '威望 +2 · 圣听 -2', effects: { prestige: 2, intelligence: -2 }, result: '旧档烧了。{actor}看着火，说“陛下心善”。' },
    ],
  },
  {
    id: 'gate_change', roles: ['guard'], actions: ['inspect_gate', 'shift'], title: '换防名册',
    text: '{actor}递上换防名册。你记得今夜不该有这么多人当值，名册上却多了三个名字。',
    choices: [
      { text: '按名册查人', hint: '圣听 +2 · 威望 +1', effects: { intelligence: 2, prestige: 1 }, result: '三个人都找到了。其中一个，是内侍省荐来的。' },
      { text: '临时换防', hint: '威望 +2 · 禁军好感 -3', effects: { prestige: 2, actor: { loyalty: -3 } }, result: '宫门换了自己人。{actor}没有多问，只把旧名册收了起来。' },
      { text: '装作没看见', hint: '威望 -1 · 圣听 -1', effects: { prestige: -1, intelligence: -1 }, result: '名册收下了。夜里，宫门的灯比往常亮。' },
    ],
  },
  {
    id: 'guard_rebel', roles: ['guard'], actions: ['muster'], title: '营中私语',
    text: '{actor}说，营中有人夜里聚饮，提到“清君侧”。他没有说是谁。',
    choices: [
      { text: '密查', hint: '圣听 +4', effects: { intelligence: 4 }, result: '查到一个名字。{actor}说此人是他帐下旧部。' },
      { text: '安抚', hint: '内帑 -500 · 军力 +1', effects: { treasury: -500, military: 1 }, result: '饷发下去了。聚饮的人，散了。' },
      { text: '调离主将', hint: '威望 -1 · 禁军好感 -3', effects: { prestige: -1, actor: { loyalty: -3 } }, result: '主将调回京。宫门的守卫，夜里换得更勤。' },
    ],
  },
  {
    id: 'general_unpaid', roles: ['general'], actions: ['muster', 'inspect_gate'], title: '营中欠饷',
    text: '{actor}没有穿甲，只带了两名亲兵。他说营中已经三个月只发半饷，士兵开始卖马。',
    choices: [
      { text: '补足军饷', hint: '内帑 -600 · 军力 +3 · 威望 +1', effects: { treasury: -600, military: 3, prestige: 1 }, result: '饷银出京。{actor}没有谢恩，只把亲兵留在了宫门外。' },
      { text: '查粮道', hint: '圣听 +3 · 威望 -1', effects: { intelligence: 3, prestige: -1 }, result: '粮道查了。{actor}的副将，在夜里来递了一份名单。' },
      { text: '令其自筹', hint: '威望 -2 · 禁军好感 -2', effects: { prestige: -2, actor: { loyalty: -2 } }, result: '{actor}走了。北境的马市，第二天多了不少官马。' },
    ],
  },
  {
    id: 'envoy_tribute', roles: ['envoy'], actions: ['receive_envoy'], title: '贡品清单',
    text: '{actor}递上贡品清单，最后一行写着“良马三百”。可马厩里只有二百二十匹。',
    choices: [
      { text: '当场点马', hint: '威望 +3 · 军力 +1', effects: { prestige: 3, military: 1 }, result: '少了八十匹。{actor}说，路上死了。马夫说，没有。' },
      { text: '收下清单', hint: '内帑 +200 · 威望 -1', effects: { treasury: 200, prestige: -1 }, result: '清单入库。那八十匹马，再没人提。' },
      { text: '私下问', hint: '圣听 +2', effects: { intelligence: 2 }, result: '{actor}说，少的马在边将手里。他说这话时，没有看你的眼睛。' },
    ],
  },
  {
    id: 'consort_jealous', roles: ['consort'], actions: ['consort', 'visit', 'visit2', 'garden_walk', 'walk', 'night_talk'], title: '御花园争执',
    text: '{actor}说，昨夜有人在御花园里推了另一位侍宠。没有人看见，但有人听见了。',
    choices: [
      { text: '偏袒{actor}', hint: '威望 -1 · 后宫张力 +5', effects: { prestige: -1, tension: 5, actor: { loyalty: 5 } }, result: '{actor}谢了恩。另一位侍宠，第二天没有来请安。' },
      { text: '各罚', hint: '威望 +1 · 后宫张力 -3', effects: { prestige: 1, tension: -3 }, result: '两个人都被禁足。御花园安静了一个月。' },
      { text: '不理会', hint: '后宫张力 +2', effects: { tension: 2 }, result: '事情过去了。但御花园的夜里，多了一些脚步声。' },
    ],
  },
  {
    id: 'garden_consort_meet', roles: ['consort'], actions: ['walk', 'night_walk'], title: '御花园里的伞',
    text: '{actor}站在假山后，手里没有伞。她说只是来躲雨，可裙角是干的。',
    choices: [
      { text: '陪她走一段', hint: '好感 +3 · 后宫张力 +2', effects: { actor: { loyalty: 3 }, tension: 2 }, result: '你们走过石桥。她一直没有说为什么在这里。' },
      { text: '问她在这里等谁', hint: '圣听 +2 · 好感 -2', effects: { intelligence: 2, actor: { loyalty: -2 } }, result: '她说了一个名字，又立刻说是随口说的。' },
      { text: '让她回去', hint: '威望 +1 · 好感 -3', effects: { prestige: 1, actor: { loyalty: -3 } }, result: '她行了礼，走进雨里。伞一直留在假山上。' },
    ],
  },
  {
    id: 'garden_child_meet', roles: ['prince'], actions: ['walk'], title: '假山后的小鞋',
    text: '假山后露出一只小鞋。{actor}蹲在那里，手里握着一只刚捉到的蛐蛐，看见你时没有跑。',
    choices: [
      { text: '陪他玩一会儿', hint: '子嗣好感 +5 · 压力 -2', effects: { actor: { loyalty: 5 } }, result: '蛐蛐跑了。{actor}笑了，像是忘了宫里的规矩。' },
      { text: '问他为什么不去读书', hint: '子嗣好感 -4 · 威望 +1', effects: { prestige: 1, actor: { loyalty: -4 } }, result: '他把蛐蛐放进袖子里，说太傅今日没来。' },
      { text: '当作没看见', hint: '压力 -1', effects: {}, result: '你转身走了。身后传来一声很轻的“谢母皇”。' },
    ],
  },
  {
    id: 'garden_minister_meet', roles: ['minister'], actions: ['walk'], title: '假山后的两个人',
    text: '{actor}和另一个人在假山后说话。你只听见半句：“……陛下若知道，也不会拦。”',
    choices: [
      { text: '出声叫住他', hint: '圣听 +2 · 朝臣忠诚 -2', effects: { intelligence: 2, actor: { loyalty: -2 } }, result: '另一个人从另一侧走了。{actor}说只是偶遇。' },
      { text: '退回去，装作没听见', hint: '压力 +3 · 圣听 +1', effects: { intelligence: 1 }, result: '你退了两步。那半句话，在夜里又响了一遍。' },
      { text: '让人去查另一个人', hint: '压力 +2 · 密报', effects: { intelligence: 1 }, result: '内侍记下了背影。第二天，值房里少了一个人。' },
    ],
  },
  {
    id: 'garden_eunuch_meet', roles: ['eunuch'], actions: ['walk'], title: '扫落叶的人',
    text: '{actor}在扫御花园的落叶，扫得很慢。他看见你，先看了看四周，才跪下。',
    choices: [
      { text: '问他最近谁来过', hint: '圣听 +2 · 压力 +1', effects: { intelligence: 2 }, result: '他说了三个名字，第四个咽了回去。' },
      { text: '让他继续扫', hint: '威望 +1', effects: { prestige: 1 }, result: '他低头继续扫。落叶下面，有一角没有烧完的信纸。' },
      { text: '记下他的名字', hint: '圣听 +1 · 内侍好感 +2', effects: { intelligence: 1, actor: { loyalty: 2 } }, result: '他愣了一下，报名字时声音比刚才稳。' },
    ],
  },
  {
    id: 'consort_brother', roles: ['consort'], actions: ['consort', 'visit', 'visit2', 'night_talk'], title: '替兄求官',
    text: '{actor}替你添茶时，说兄长在吏部候缺，想补一个知州。她没有抬头。',
    choices: [
      { text: '准', hint: '内帑 -200 · 圣听 -1', effects: { treasury: -200, intelligence: -1, actor: { loyalty: 6 } }, result: '{actor}谢了恩。她的兄长补了知州。' },
      { text: '不准', hint: '威望 +1', effects: { prestige: 1, actor: { loyalty: -8 } }, result: '{actor}收了茶盏。那晚的灯，灭得很早。' },
      { text: '留她说话', hint: '圣听 +1 · 后宫张力 -2', effects: { intelligence: 1, tension: -2 }, result: '她没有再提兄长。临走时问了一句“陛下今晚还来吗”。' },
    ],
  },
  {
    id: 'consort_stay', roles: ['consort'], actions: ['stay'], title: '留宿',
    text: '{actor}替你卸了外袍，问今夜还走不走。窗外的更鼓，已经敲过三下。',
    choices: [
      { text: '留宿', hint: '体力 -1 · 后宫张力 +2', effects: { health: -1, tension: 2, actor: { loyalty: 4 } }, result: '你留下了。{actor}吹了灯，没有再说话。' },
      { text: '说会儿话就走', hint: '圣听 +1 · 后宫张力 +1', effects: { intelligence: 1, tension: 1 }, result: '她说了些宫里的事，最后一句是“陛下明日还来吗”。' },
      { text: '去偏殿独宿', hint: '体力 +1 · 后宫张力 -2', effects: { health: 1, tension: -2 }, result: '你去了偏殿。{actor}站在门口，直到更鼓敲完。' },
    ],
  },
  {
    id: 'poison_medicine', roles: ['physician'], actions: ['pulse', 'medicine'], title: '药渣少了一味',
    text: '{actor}把药渣摊在纸上，说这服药少了一味甘草，多了一味不该有的东西。',
    choices: [
      { text: '查药房', hint: '圣听 +3 · 后宫张力 +3', effects: { intelligence: 3, tension: 3 }, result: '药房封了。抓药的宫女，当夜就投了井。' },
      { text: '先保人', hint: '内帑 -200 · 圣听 +1', effects: { treasury: -200, intelligence: 1 }, result: '药换了。人还在，但{actor}说，最多再撑三个月。' },
      { text: '压下', hint: '威望 +1 · 后宫张力 +5', effects: { prestige: 1, tension: 5 }, result: '药渣倒了。第二天，太医院少了一名太医。' },
    ],
  },
  {
    id: 'fake_pregnancy', roles: ['physician'], actions: ['pulse'], title: '喜脉',
    text: '{actor}诊出喜脉，却低声说：“月份对不上。”脉案上的日期，被人改过。',
    choices: [
      { text: '查脉案', hint: '圣听 +4 · 后宫张力 +4', effects: { intelligence: 4, tension: 4 }, result: '改脉案的人找到了。她说是“上面”让改的。' },
      { text: '先保胎', hint: '内帑 -200 · 后宫张力 +2', effects: { treasury: -200, tension: 2 }, result: '药换了。{actor}说，孩子能不能保住，要看天。' },
      { text: '压下', hint: '威望 +1 · 圣听 -2', effects: { prestige: 1, intelligence: -2 }, result: '脉案封了。后宫里的喜讯，还是传了出去。' },
    ],
  },
  {
    id: 'prince_truancy', roles: ['prince', 'tutor'], actions: ['lesson'], title: '逃学',
    text: '{actor}没有去书房。太傅在门外站了半个时辰，说今日又射落了一只御赐的白鹤。',
    choices: [
      { text: '严加管教', hint: '子嗣好感 -5 · 威望 +1', effects: { prestige: 1, actor: { loyalty: -5 } }, result: '{actor}被关在书房抄了三天书。白鹤的事，没人再提。' },
      { text: '随他', hint: '子嗣好感 +4', effects: { actor: { loyalty: 4 } }, result: '{actor}得了新弓。太傅称病，三天没进书房。' },
      { text: '换师傅', hint: '内帑 -200 · 圣听 +1', effects: { treasury: -200, intelligence: 1 }, result: '新师傅从翰林院调来。太傅把书箱搬走时，一句话没说。' },
    ],
  },
  {
    id: 'prince_illness', roles: ['prince'], actions: ['sick'], title: '皇子病',
    text: '{actor}烧了三天。太医说是风寒，可孩子一直看着门外，像在等谁。',
    choices: [
      { text: '守夜', hint: '体力 -2 · 子嗣好感 +5', effects: { health: -2, actor: { loyalty: 5 } }, result: '你守到天亮。{actor}退了烧，第一句话是“别走”。' },
      { text: '查侍疾的人', hint: '圣听 +3 · 后宫张力 +3', effects: { intelligence: 3, tension: 3 }, result: '侍疾的宫女少了一个。她的包袱里，有一包没煎完的药。' },
      { text: '换太医', hint: '内帑 -100 · 圣听 +1', effects: { treasury: -100, intelligence: 1 }, result: '新太医来了。旧太医说，孩子的病不在身上。' },
    ],
  },
  {
    id: 'maid_overhear', roles: ['maid'], actions: ['eavesdrop', 'night_walk', 'walk'], title: '窗下听见',
    text: '{actor}说，昨夜有人在长春宫窗外站了很久。她没看清脸，只看见那人腰间挂着一枚内侍省的牌子。',
    choices: [
      { text: '查内侍省', hint: '圣听 +3 · 威望 +1', effects: { intelligence: 3, prestige: 1 }, result: '牌子对上了。那个人说，他是来送药的。' },
      { text: '赏她', hint: '内帑 -50 · 圣听 +1', effects: { treasury: -50, intelligence: 1 }, result: '{actor}收了赏，又补了一句：“他后来又来过一次。”' },
      { text: '让她忘了', hint: '威望 +1 · 圣听 -1', effects: { prestige: 1, intelligence: -1 }, result: '{actor}点头。第二天，她被调去了浣衣局。' },
    ],
  },
  {
    id: 'night_assassin', roles: ['assassin'], actions: ['night_walk', 'walk', 'inspect_gate', 'sick', 'shift', 'medicine'], title: '夜里的刀',
    text: '假山后有一道影子。他没有立刻动，先看了一眼你身后的侍卫。',
    choices: [
      { text: '喊人', hint: '体力 -5 · 威望 +2', effects: { health: -5, prestige: 2 }, result: '侍卫围了上来。刺客咬碎了牙里的毒，没留下名字。' },
      { text: '自己拔剑', hint: '体力 -10 · 威望 +3 · 圣听 +1', effects: { health: -10, prestige: 3, intelligence: 1 }, result: '你划伤了他的手臂。血滴在石头上，是内廷的人。' },
      { text: '放他走', hint: '圣听 +2 · 威望 -1', effects: { intelligence: 2, prestige: -1 }, result: '影子退进黑暗。第二天，宫门外多了一具无名尸。' },
    ],
  },
  {
    id: 'clan_ritual', roles: ['clan'], actions: ['ritual'], title: '祭祀争位',
    text: '奉先殿祭祀，{actor}站到了不该站的位置。宗正寺的人看见了，没有出声。',
    choices: [
      { text: '当场斥退', hint: '威望 +2 · 宗室好感 -4', effects: { prestige: 2, actor: { loyalty: -4 } }, result: '{actor}退到后面。祭祀继续，但念祝词的人换了。' },
      { text: '装作没看见', hint: '威望 -1 · 宗室野心 +3', effects: { prestige: -1, actor: { ambition: 3 } }, result: '祭祀结束。{actor}走时，比你晚了一步。' },
      { text: '会后问罪', hint: '圣听 +2 · 宗室好感 -2', effects: { intelligence: 2, actor: { loyalty: -2 } }, result: '{actor}说，是宗正寺让他站的。宗正寺说，没有。' },
    ],
  },
  {
    id: 'monk_omen', roles: ['monk'], actions: ['omen'], title: '香灰里的字',
    text: '{actor}在奉先殿偏殿写了一句谶语：“金乌落，白雀升。”香客们传得很广。',
    choices: [
      { text: '大办祥瑞', hint: '内帑 -300 · 威望 +1', effects: { treasury: -300, prestige: 1 }, result: '白雀被供进了太庙。{actor}站在人群后面，没有说话。' },
      { text: '斥为妖言', hint: '威望 +1', effects: { prestige: 1 }, result: '偏殿封了。谶语却传得更快。' },
      { text: '查谶语来源', hint: '圣听 +2', effects: { intelligence: 2 }, result: '字是从前朝旧纸上裁下来的。{actor}的度牒，是假的。' },
    ],
  },
  {
    id: 'cold_letter', roles: ['deposed'], actions: ['visit_cold', 'old_case'], title: '冷宫密信',
    text: '{actor}从袖子里摸出一封信，说这是三年前就该送到御前的。信纸发黄，封口没拆。',
    choices: [
      { text: '当场拆信', hint: '圣听 +3 · 威望 -1', effects: { intelligence: 3, prestige: -1 }, result: '信里是一个名字，和一句“臣妾无罪”。名字对得上已故的户部尚书。' },
      { text: '带回去看', hint: '圣听 +2', effects: { intelligence: 2 }, result: '信收进御书房。{actor}看着你收好，才跪下谢恩。' },
      { text: '不接', hint: '威望 +1 · 圣听 -1', effects: { prestige: 1, intelligence: -1 }, result: '信留在冷宫。第二天，冷宫走水，烧了半间屋子。' },
    ],
  },
  {
    id: 'household_accounts', roles: ['steward'], actions: ['accounts'], title: '内库亏空',
    text: '{actor}把账本摊开：今年采买的绸缎比去年贵了三成，数量却少了两成。',
    choices: [
      { text: '查采买', hint: '圣听 +3 · 内帑 +400', effects: { intelligence: 3, treasury: 400 }, result: '回扣追回一部分。{actor}说，剩下的在“上面”。' },
      { text: '换管事', hint: '威望 +1 · 内帑 -100', effects: { prestige: 1, treasury: -100 }, result: '新管事上任。旧账封存，新账更厚。' },
      { text: '压下', hint: '内帑 +200 · 威望 -1', effects: { treasury: 200, prestige: -1 }, result: '账平了。绸缎入库时，少了两匹。' },
    ],
  },
  {
    id: 'kitchen_poison', roles: ['cook'], actions: ['taste', 'ingredient'], title: '多出的一味',
    text: '{actor}说，今日的汤里多了一味附子。试毒的内侍已经倒了，还没死。',
    choices: [
      { text: '封尚食局', hint: '圣听 +3 · 后宫张力 +3', effects: { intelligence: 3, tension: 3 }, result: '尚食局封了。{actor}指认了一个宫女，宫女指认了内侍省。' },
      { text: '先救试毒的人', hint: '内帑 -150 · 圣听 +2', effects: { treasury: -150, intelligence: 2 }, result: '人救回来了。他说，汤是替“贵人”熬的。' },
      { text: '压下', hint: '威望 +1 · 圣听 -1', effects: { prestige: 1, intelligence: -1 }, result: '汤倒了。第二天的御膳，每道菜都多了一双筷子。' },
    ],
  },
  {
    id: 'merchant_supply', roles: ['merchant'], actions: ['supply'], title: '采买回扣',
    text: '{actor}说，内务府的采买价高了三成，多出来的银子，有一半进了内侍省。',
    choices: [
      { text: '查内务府', hint: '圣听 +3 · 内帑 +300', effects: { intelligence: 3, treasury: 300 }, result: '账本封了。{actor}说，他只是个跑腿的。' },
      { text: '收下证据', hint: '圣听 +2 · 内帑 -100', effects: { intelligence: 2, treasury: -100 }, result: '证据收进御书房。{actor}走时，回头看了一眼宫门。' },
      { text: '让他闭嘴', hint: '威望 +1 · 圣听 -1', effects: { prestige: 1, intelligence: -1 }, result: '{actor}没有再进宫。内务府的采买，还是那么贵。' },
    ],
  },
  {
    id: 'eunuch_sell_office', roles: ['eunuch'], actions: ['report', 'investigate_eunuch', 'token'], title: '内侍卖官',
    text: '{actor}说漏了嘴：吏部最近补的三个知县，都是走了内侍省的门路。他说完就跪下了。',
    choices: [
      { text: '查内侍省', hint: '圣听 +3 · 威望 +2', effects: { intelligence: 3, prestige: 2 }, result: '内侍省交出一本册子。册子上的字，和吏部的笔迹不一样。' },
      { text: '让他闭嘴', hint: '威望 +1 · 圣听 -1', effects: { prestige: 1, intelligence: -1 }, result: '{actor}磕了头。三天后，他被调去守皇陵。' },
      { text: '顺藤摸瓜', hint: '圣听 +2 · 内帑 +300', effects: { intelligence: 2, treasury: 300 }, result: '银子追回一部分。剩下的，变成了内侍省的一间新值房。' },
    ],
  },
  {
    id: 'eunuch_secret', roles: ['eunuch'], actions: ['archive', 'wait', 'report'], title: '没有署名的折子',
    text: '{actor}把一封没有署名的折子放在案角，说是一个小太监在宫门外捡的。折子里写着三个名字和一笔银子。',
    choices: [
      { text: '顺名单查', hint: '圣听 +4 · 威望 -1', effects: { intelligence: 4, prestige: -1 }, result: '三个名字，两个对得上。第三个，查无此人。' },
      { text: '赏他，继续盯', hint: '内帑 -100 · 圣听 +2', effects: { treasury: -100, intelligence: 2 }, result: '{actor}收了赏。此后他递折子，不再走通传。' },
      { text: '烧掉', hint: '威望 +1 · 圣听 -2', effects: { prestige: 1, intelligence: -2 }, result: '折子烧了。灰里剩下一角，能看见一个“盐”字。' },
    ],
  },
  {
    id: 'gate_check', roles: ['guard'], actions: [], hidden: true, title: '宫门盘问',
    text: '禁军横戟拦在乾清门前：“夜入内廷，请陛下出示宫门令。”他身后还有两个人，手按在刀上。',
    choices: [
      { text: '亮明身份，令其退下', hint: '威望 -1 · 圣听 +1', effects: { prestige: -1, intelligence: 1 }, result: '禁军让开了。你记住，他迟疑了一瞬。' },
      { text: '记下他的名字', hint: '圣听 +2 · 威望 -1', effects: { intelligence: 2, prestige: -1 }, result: '他报了名字。第二天，这个名字出现在禁军值房的换防册上。' },
      { text: '硬闯', hint: '体力 -3 · 威望 -2', effects: { health: -3, prestige: -2 }, result: '你推开戟杆。身后有人跪下了，也有人没有。' },
    ],
  },
]

const GENERIC_EVENT = {
  id: 'generic_palace',
  roles: ['any'],
  title: '宫道上的话',
  text: '{actor}在宫道尽头叫住你，说了一句没头没尾的话：“陛下若想知道，今夜子时，冷宫。”',
  choices: [
    { text: '去', hint: '圣听 +2 · 风险未知', effects: { intelligence: 2 }, result: '冷宫里没有人。供桌上多了一封信。' },
    { text: '不去', hint: '威望 +1', effects: { prestige: 1 }, result: '你没有去。第二天，冷宫的门锁换了。' },
  ],
}

const replaceActor = (text, actor) => String(text || '').replaceAll('{actor}', actor.name)

const applyActorEffect = (state, actor, key, value) => {
  if (!actor?.id) return
  const character = (state.characters || []).find((item) => item.id === actor.id && item.alive !== false)
  if (!character) return
  const keys = [
    'loyalty', 'ambition', 'health', 'fertility', 'performance',
    'civil', 'military', 'strategy', 'charm', 'finance',
  ]
  if (!keys.includes(key)) return
  character[key] = clamp(Math.round((Number(character[key]) || 0) + (Number(value) || 0)), 0, 100)
}

const applyPalaceEffects = (state, effects, actor) => {
  if (!effects) return
  const resources = ['treasury', 'prestige', 'popularity', 'intelligence', 'military']
  for (const key of resources) {
    if (!(key in effects)) continue
    const current = Number(state.resources?.[key]) || 0
    state.resources[key] = clamp(Math.round(current + (Number(effects[key]) || 0)), key === 'treasury' ? -999999 : 0, key === 'treasury' ? 9999999 : 100)
  }
  if ('health' in effects) {
    state.ruler.health = clamp(Math.round((Number(state.ruler.health) || 0) + (Number(effects.health) || 0)), 0, 100)
  }
  if ('tension' in effects) {
    state.haremTensionBoost = clamp(Math.round((Number(state.haremTensionBoost) || 0) + (Number(effects.tension) || 0)), 0, 100)
  }
  if (effects.actor && typeof effects.actor === 'object') {
    for (const [key, value] of Object.entries(effects.actor)) {
      applyActorEffect(state, actor, key, value)
    }
  }
  if (effects.rumor) {
    if (!Array.isArray(state.rumors)) state.rumors = []
    state.rumors.unshift({
      id: `rumor_palace_${state.calendar?.year || 1}_${state.calendar?.month || 1}_${state.rumors.length + 1}`,
      year: state.calendar?.year || 1,
      month: state.calendar?.month || 1,
      text: String(effects.rumor).trim(),
      characterId: actor?.id || '',
      revealed: Boolean(effects.revealed),
      plot: 0,
    })
    state.rumors = state.rumors.slice(0, 60)
  }
}

const buildEncounter = (state, actor, event, room, action) => ({
  id: `palace_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
  roomId: room.id,
  roomName: room.name,
  actionId: action.id,
  actionName: action.label,
  actor,
  title: event.title,
  text: replaceActor(event.text, actor),
  choices: event.choices.map((choice) => ({
    id: choice.id || choice.text,
    text: replaceActor(choice.text, actor),
    hint: replaceActor(choice.hint || '', actor),
    result: replaceActor(choice.result || '', actor),
    effects: choice.effects || {},
  })),
  mode: state.palace?.mode || 'day',
})

export const ensurePalaceFields = (state) => {
  if (!state) return state
  if (!state.palace || typeof state.palace !== 'object') state.palace = {}
  if (typeof state.palace.gatePass !== 'boolean') state.palace.gatePass = false
  if (!['day', 'night'].includes(state.palace.mode)) state.palace.mode = 'day'
  if (!state.palace.encounter || typeof state.palace.encounter !== 'object') state.palace.encounter = null
  if (typeof state.haremTensionBoost !== 'number') state.haremTensionBoost = 0
  return state
}

export const getPalaceRoom = (roomId) => findRoom(roomId)
export const getPalaceAction = (roomId, actionId) => findAction(findRoom(roomId), actionId)

export const setPalaceMode = (state, mode) => {
  const next = clone(state)
  ensurePalaceFields(next)
  next.palace.mode = mode === 'night' ? 'night' : 'day'
  next.updatedAt = Date.now()
  return { success: true, state: next, message: next.palace.mode === 'night' ? '已入夜' : '已回白日' }
}

export const startPalaceAction = (state, roomId, actionId) => {
  if (!state || state.status !== 'playing') {
    return { success: false, state, message: '当前无法出宫行走' }
  }
  ensurePalaceFields(state)
  const room = findRoom(roomId)
  const action = findAction(room, actionId)
  if (!room || !action) {
    return { success: false, state, message: '这处宫室没有这个行动' }
  }

  const next = clone(state)
  ensurePalaceFields(next)

  if (action.special === 'token') {
    next.palace.gatePass = true
    next.updatedAt = Date.now()
    return { success: true, state: next, message: '宫门令已领，本旬夜入内廷有效' }
  }

  if (next.palace.mode === 'night' && room.zone === 'inner' && !next.palace.gatePass) {
    const actor = resolveActor(next, 'guard')
    const event = PALACE_EVENTS.find((item) => item.id === 'gate_check')
    next.palace.encounter = buildEncounter(next, actor, event, room, { id: 'gate_check', label: '宫门盘问' })
    next.updatedAt = Date.now()
    return { success: true, state: next, message: '夜入内廷，被禁军拦下' }
  }

  if ((next.actionPoints || 0) < (Number(action.cost) || 0)) {
    return { success: false, state, message: '行动点不够' }
  }

  next.actionPoints = Math.max(0, (next.actionPoints || 0) - (Number(action.cost) || 0))
  if (next.palace.mode === 'night') {
    next.ruler.health = clamp((Number(next.ruler.health) || 0) - 2, 0, 100)
  }

  const roleIds = [...action.roles, ...(next.palace.mode === 'night' ? (action.nightRoles || []) : [])]
  const actor = resolveActor(next, pickOne(Math.random, roleIds))
  const candidates = PALACE_EVENTS.filter((item) => (
    !item.hidden
    && item.roles.includes(actor.kind)
    && (!item.actions || item.actions.length === 0 || item.actions.includes(action.id))
  ))
  const event = candidates.length > 0 ? pickOne(Math.random, candidates) : GENERIC_EVENT

  next.palace.encounter = buildEncounter(next, actor, event, room, action)
  next.updatedAt = Date.now()
  return { success: true, state: next, message: '' }
}

export const resolvePalaceChoice = (state, choiceId) => {
  if (!state) return { success: false, state, message: '存档不存在' }
  ensurePalaceFields(state)
  const encounter = state.palace.encounter
  if (!encounter) return { success: false, state, message: '当前没有宫中遭遇' }
  const choice = (encounter.choices || []).find((item) => item.id === choiceId)
  if (!choice) return { success: false, state, message: '选项不存在' }

  const next = clone(state)
  ensurePalaceFields(next)
  const current = next.palace.encounter
  const targetChoice = (current.choices || []).find((item) => item.id === choiceId)
  applyPalaceEffects(next, targetChoice.effects, current.actor)
  log(next, `${current.roomName} · ${current.title}`, targetChoice.result || targetChoice.hint || '')
  recordActivity(next, `${current.roomName}：${current.actionName} · ${targetChoice.text}`, 'palace')
  next.palace.encounter = null
  next.updatedAt = Date.now()
  return {
    success: true,
    state: next,
    message: targetChoice.result || '已处置',
    resultText: targetChoice.result || '',
    actorName: current.actor?.name || '',
  }
}

export const cancelPalaceEncounter = (state) => {
  const next = clone(state)
  ensurePalaceFields(next)
  next.palace.encounter = null
  next.updatedAt = Date.now()
  return { success: true, state: next }
}

export const resetPalaceForMonth = (state) => {
  ensurePalaceFields(state)
  state.palace.gatePass = false
  state.palace.mode = 'day'
  state.palace.encounter = null
  state.haremTensionBoost = clamp(Math.round((Number(state.haremTensionBoost) || 0) - 1), 0, 100)
  return state
}
