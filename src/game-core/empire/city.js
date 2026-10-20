/**
 * 京城出宫：坊市事件 + 灯市夜行 + 延请入宫。
 *
 * 所有数值先在本地结算；文本只负责把后果说清楚。
 */

import { averageAbility, pickAvatarId } from './characters.js'
import { createRng, clamp } from './random.js'
import { recordActivity } from './activity.js'
import { applyBurdenEffects, addStress } from './burdens.js'

const clone = (value) => JSON.parse(JSON.stringify(value))

const monthIndex = (state) => (
  ((Number(state?.calendar?.year) || 1) - 1) * 12 + (Number(state?.calendar?.month) || 1)
)

const log = (state, title, desc) => {
  if (!state.city) return
  if (!Array.isArray(state.city.log)) state.city.log = []
  state.city.log.unshift({
    id: `city_${monthIndex(state)}_${state.city.log.length + 1}`,
    year: state.calendar?.year || 1,
    month: state.calendar?.month || 1,
    title,
    desc,
  })
  state.city.log = state.city.log.slice(0, 30)
}

const addResource = (state, key, value) => {
  if (!value) return
  if (key === 'treasury') {
    state.resources.treasury = Math.max(0, Math.round((Number(state.resources.treasury) || 0) + value))
    return
  }
  if (['popularity', 'prestige', 'intelligence', 'military'].includes(key)) {
    state.resources[key] = clamp((Number(state.resources[key]) || 0) + value, 0, 100)
  }
}

const applyEffects = (state, effects = {}) => {
  for (const [key, value] of Object.entries(effects)) {
    if (['popularity', 'prestige', 'treasury', 'intelligence', 'military'].includes(key)) {
      addResource(state, key, Number(value) || 0)
    } else if (key === 'health') {
      state.ruler.health = clamp((Number(state.ruler.health) || 0) + (Number(value) || 0), 0, 100)
    } else if (key === 'order') {
      state.city.order = clamp((Number(state.city.order) || 0) + (Number(value) || 0), 0, 100)
    } else if (key === 'scandal') {
      state.city.scandal = clamp((Number(state.city.scandal) || 0) + (Number(value) || 0), 0, 100)
    } else if (key === 'tension') {
      state.haremTensionBoost = clamp((Number(state.haremTensionBoost) || 0) + (Number(value) || 0), -30, 100)
    } else if (['stress', 'trait', 'debuff', 'tyranny', 'dread'].includes(key)) {
      applyBurdenEffects(state, { [key]: value })
    }
  }
}

export const CITY_DISTRICTS = [
  {
    id: 'street',
    name: '朱雀大街',
    subtitle: '告状、流民、老卒',
    desc: '京城最宽的一条街。鸣冤鼓在街头，刚进城的人蹲在墙根。',
    risk: 1,
    actions: [
      { id: 'walk', label: '沿街走走', desc: '看看今天谁在说话。', eventId: 'street_petition' },
    ],
  },
  {
    id: 'east',
    name: '东市',
    subtitle: '米行、药铺、物价',
    desc: '米价、药价都写在牌子上，但牌子上的数字不一定是真的。',
    risk: 2,
    actions: [
      { id: 'grain', label: '逛米行', desc: '问一句今年的米价。', eventId: 'east_rice' },
    ],
  },
  {
    id: 'west',
    name: '西市',
    subtitle: '胡商、匠人、税单',
    desc: '香料、铁器、来路不明的铜钱，都在这片市里换手。',
    risk: 2,
    actions: [
      { id: 'foreign', label: '找胡商', desc: '问一问关税率和路上的事。', eventId: 'west_merchant' },
    ],
  },
  {
    id: 'poor',
    name: '贫民巷',
    subtitle: '乞儿、寡妇、里正',
    desc: '巷子很窄，污水沿墙流。这里的人不写状纸，因为不识字。',
    risk: 3,
    actions: [
      { id: 'child', label: '进巷看看', desc: '有人偷了粮，被按在墙边。', eventId: 'poor_beggar' },
      { id: 'shadow', label: '巷口的身影', desc: '那个背影，像是宫里的人。', eventId: 'poor_child' },
    ],
  },
  {
    id: 'court',
    name: '大理寺',
    subtitle: '囚犯、狱吏、案卷',
    desc: '案卷堆到房梁。画押的人，不一定有罪。',
    risk: 2,
    actions: [
      { id: 'case', label: '听一场审', desc: '坐在屏风后，听他们怎么说。', eventId: 'court_case' },
    ],
  },
  {
    id: 'academy',
    name: '国子监',
    subtitle: '士子、寒门、主考',
    desc: '读书人聚在廊下。有人谈文章，有人谈门路。',
    risk: 1,
    actions: [
      { id: 'strike', label: '听士子说话', desc: '榜下有人不肯走。', eventId: 'academy_strike' },
    ],
  },
  {
    id: 'dock',
    name: '漕运码头',
    subtitle: '船工、漕官、私盐',
    desc: '粮船靠岸，船舱底下压着粮，也压着别的东西。',
    risk: 2,
    actions: [
      { id: 'salt', label: '看卸货', desc: '有一艘船吃水太深。', eventId: 'dock_salt' },
    ],
  },
  {
    id: 'gate',
    name: '城门',
    subtitle: '流民、守军、过路钱',
    desc: '城门是一道线。线外的人想进来，线里的人想收钱。',
    risk: 3,
    actions: [
      { id: 'refugee', label: '看出入', desc: '城外排了很长的队。', eventId: 'gate_refugee' },
    ],
  },
  {
    id: 'temple',
    name: '寺观',
    subtitle: '僧道、灾民、香灰',
    desc: '寺里在施粥，香火很旺。有人在粥棚前跪下。',
    risk: 1,
    actions: [
      { id: 'porridge', label: '看施粥', desc: '队伍从山门排到巷口。', eventId: 'temple_grain' },
    ],
  },
]

export const CITY_EVENTS = {
  street_petition: {
    title: '状纸上的手印',
    actor: '流民妇人',
    role: '流民',
    text: '一个妇人跪在鸣冤鼓旁，说丈夫死在河工上，衙门反说她丈夫逃役，要她补交三年税。',
    choices: [
      {
        id: 'accept',
        text: '接状，命大理寺重审',
        hint: '民心 +5 · 治安 -2 · 威望 +1',
        effects: { popularity: 5, order: -2, prestige: 1 },
        result: '你接了状纸。身后的衙役，脸色变了。',
      },
      {
        id: 'money',
        text: '给钱打发',
        hint: '内帑 -200 · 民心 +1',
        effects: { treasury: -200, popularity: 1, order: 1 },
        result: '她收了钱，却没有走。她说她不要钱，她要一个说法。',
      },
      {
        id: 'disperse',
        text: '让衙役驱散',
        hint: '治安 +5 · 民心 -6',
        effects: { order: 5, popularity: -6 },
        result: '街面干净了。状纸被踩进泥里，手印还在。',
      },
    ],
  },
  east_rice: {
    title: '米价一天三涨',
    actor: '粮商',
    role: '商人',
    text: '米行门口挂出新牌价，比上个月贵了四成。掌柜说北边没下雨，粮船来不了。',
    choices: [
      {
        id: 'open',
        text: '开仓平粜',
        hint: '内帑 -600 · 民心 +6 · 治安 +1',
        effects: { treasury: -600, popularity: 6, order: 1 },
        result: '官仓开了。米价当日跌回去，掌柜的脸比米还白。',
      },
      {
        id: 'limit',
        text: '限价，不许涨',
        hint: '民心 +3 · 治安 -2 · 内帑 -100',
        effects: { popularity: 3, order: -2, treasury: -100 },
        result: '牌子换了。第二天，米行说没货了，百姓在门口等到天黑。',
      },
      {
        id: 'free',
        text: '放任，让市面自己平',
        hint: '内帑 +300 · 民心 -5 · 治安 -1',
        effects: { treasury: 300, popularity: -5, order: -1 },
        result: '米价继续涨。城里开始有人往城外走。',
      },
    ],
  },
  west_merchant: {
    title: '胡商的税单',
    actor: '胡商',
    role: '外邦商人',
    text: '胡商递上税单，说西市的市吏收了两遍税。他的香料已经压了三个月。',
    choices: [
      {
        id: 'reduce',
        text: '减税招徕',
        hint: '内帑 -200 · 民心 +2 · 治安 +1',
        effects: { treasury: -200, popularity: 2, order: 1 },
        result: '胡商谢恩。市吏站在旁边，手一直按着税册。',
      },
      {
        id: 'increase',
        text: '加税充库',
        hint: '内帑 +600 · 民心 -2 · 治安 -1',
        effects: { treasury: 600, popularity: -2, order: -1 },
        result: '税加了三成。胡商没走，只是把最好的香料收进了箱子。',
      },
      {
        id: 'expel',
        text: '驱逐出境',
        hint: '治安 +2 · 威望 +1 · 内帑 -100 · 民心 -3',
        effects: { order: 2, prestige: 1, treasury: -100, popularity: -3 },
        result: '胡商被送出城门。西市的香料价，第二天翻了一倍。',
      },
    ],
  },
  poor_beggar: {
    title: '偷粮的孩子',
    actor: '乞儿',
    role: '乞儿',
    text: '一个孩子被按在墙边，怀里抱着一袋粟米。里正说他偷了三次。',
    choices: [
      {
        id: 'release',
        text: '放了，给粮',
        hint: '内帑 -50 · 民心 +2 · 治安 -1',
        effects: { treasury: -50, popularity: 2, order: -1 },
        result: '孩子抱着米跑了。里正说，明天他还会来。',
      },
      {
        id: 'punish',
        text: '按律杖责',
        hint: '治安 +3 · 民心 -2',
        effects: { order: 3, popularity: -2 },
        result: '孩子挨了打。米被收回去，祖母还在等。',
      },
      {
        id: 'shelter',
        text: '收进养济院',
        hint: '内帑 -200 · 民心 +3 · 治安 +1',
        effects: { treasury: -200, popularity: 3, order: 1 },
        result: '养济院收了他。里正说，院里已经住不下了。',
      },
    ],
  },
  court_case: {
    title: '已经画押的供词',
    actor: '囚犯',
    role: '人犯',
    text: '囚犯说供词是狱吏写的，他不识字，只按了手印。案卷上写他杀了人，但凶器一直没找到。',
    choices: [
      {
        id: 'retry',
        text: '重审',
        hint: '治安 +2 · 民心 +3 · 内帑 -200',
        effects: { order: 2, popularity: 3, treasury: -200, prestige: 1 },
        result: '案子重审。真凶没找到，但囚犯被放了出来。',
      },
      {
        id: 'keep',
        text: '维持原判',
        hint: '治安 +3 · 民心 -3',
        effects: { order: 3, popularity: -3 },
        result: '判决维持。囚犯被押走时，一直看着你的鞋。',
      },
      {
        id: 'release',
        text: '私下放人',
        hint: '民心 +2 · 治安 -4 · 威望 -2',
        effects: { popularity: 2, order: -4, prestige: -2 },
        result: '你放了他。第二天，御史问起一名囚犯为何不见了。',
      },
    ],
  },
  academy_strike: {
    title: '罢考的士子',
    actor: '士子',
    role: '士子',
    text: '榜下聚了上百名士子，说今科有十二个官员子弟。他们不肯散。',
    choices: [
      {
        id: 'talk',
        text: '对话，允其陈情',
        hint: '民心 +2 · 治安 +1 · 威望 +1',
        effects: { popularity: 2, order: 1, prestige: 1 },
        result: '士子推了三个代表。他们说的话，比奏折难听，也比奏折真。',
      },
      {
        id: 'arrest',
        text: '抓几个为首的',
        hint: '治安 +4 · 民心 -4 · 威望 -1',
        effects: { order: 4, popularity: -4, prestige: -1 },
        result: '榜下安静了。第二天的邸报上，写的是“士林称颂”。',
      },
      {
        id: 'exam',
        text: '加恩科，另取寒门',
        hint: '内帑 -300 · 民心 +3 · 治安 -1',
        effects: { treasury: -300, popularity: 3, order: -1 },
        result: '恩科开了。有人欢喜，也有人说这不过是另一场门路。',
      },
    ],
  },
  dock_salt: {
    title: '船舱底下的盐',
    actor: '船工',
    role: '船工',
    text: '一艘粮船吃水太深。船工说底下是盐，漕官知道，盐商也知道。',
    choices: [
      {
        id: 'seize',
        text: '查办，连船带人',
        hint: '治安 +3 · 内帑 +500 · 民心 -1',
        effects: { order: 3, treasury: 500, popularity: -1 },
        result: '盐被起出。码头安静了三天，第四天换了一批船工。',
      },
      {
        id: 'buy',
        text: '收编，充作官盐',
        hint: '内帑 +300 · 治安 +1 · 民心 -2',
        effects: { treasury: 300, order: 1, popularity: -2 },
        result: '盐进了官仓。盐商没有闹，只是把账本换了。',
      },
      {
        id: 'ignore',
        text: '放任，先稳住漕运',
        hint: '内帑 +100 · 治安 -4 · 民心 -1',
        effects: { treasury: 100, order: -4, popularity: -1 },
        result: '粮船按时走了。京城的私盐，便宜了两文。',
      },
    ],
  },
  gate_refugee: {
    title: '城门外的人',
    actor: '流民',
    role: '流民',
    text: '城门外排着几百人，说是北边逃来的。守军说没有路引不能进。',
    choices: [
      {
        id: 'open',
        text: '放行，设棚安置',
        hint: '民心 +4 · 治安 -4 · 内帑 -300',
        effects: { popularity: 4, order: -4, treasury: -300 },
        result: '城门开了。粥棚搭起来，城里的米价当天又涨了一成。',
      },
      {
        id: 'close',
        text: '闭门，不许入城',
        hint: '治安 +5 · 民心 -6',
        effects: { order: 5, popularity: -6 },
        result: '城门关了。外面敲了很久，后来不敲了。',
      },
      {
        id: 'filter',
        text: '筛选入城',
        hint: '治安 +1 · 民心 +1 · 内帑 -200',
        effects: { order: 1, popularity: 1, treasury: -200 },
        result: '有路引的进了城。剩下的被安置在城外，守军说只能管三天。',
      },
    ],
  },
  poor_child: {
    title: '巷口的身影',
    actor: '宫外少年',
    role: '子嗣',
    text: '你在巷口看见一个熟悉的身影，穿着便服，身后跟着一个不敢抬头的小内侍。他/她看见你，停住了。',
    choices: [
      {
        id: 'bring_back',
        text: '带回宫，不声张',
        hint: '子嗣亲密 +5 · 野心 -2 · 威望 -1',
        effects: { prestige: -1 },
        childEffect: { intimacy: 5, ambition: -2 },
        result: '你把人带回宫。一路上，谁都没有先开口。',
      },
      {
        id: 'pretend',
        text: '装作没看见',
        hint: '子嗣亲密 +2 · 野心 +3 · 风闻 +1',
        effects: { scandal: 1 },
        childEffect: { intimacy: 2, ambition: 3 },
        result: '你转身走了。身后的脚步停了很久，才继续。',
      },
      {
        id: 'scold',
        text: '当街训斥',
        hint: '子嗣亲密 -6 · 野心 -3 · 威望 +1',
        effects: { prestige: 1 },
        childEffect: { intimacy: -6, ambition: -3 },
        result: '你在巷口训斥了他/她。内侍跪了一地，巷子里的人不敢看。',
      },
    ],
  },
  temple_grain: {
    title: '寺里的粥棚',
    actor: '僧人',
    role: '僧人',
    text: '寺里在施粥，队伍从山门排到巷口。僧人说米是信众捐的，但账本不肯给你看。',
    choices: [
      {
        id: 'fund',
        text: '拨款支持',
        hint: '内帑 -300 · 民心 +4 · 治安 +1',
        effects: { treasury: -300, popularity: 4, order: 1 },
        result: '粥棚多了一口锅。僧人说佛祖会记得，你说朕也会记得。',
      },
      {
        id: 'audit',
        text: '查账',
        hint: '治安 +3 · 民心 +1 · 威望 +1',
        effects: { order: 3, popularity: 1, prestige: 1 },
        result: '账本查了。米少了两成，僧人说那两成给了城外的人。',
      },
      {
        id: 'ban',
        text: '禁止聚众',
        hint: '治安 +4 · 民心 -5',
        effects: { order: 4, popularity: -5 },
        result: '粥棚撤了。山门关了三天，香客少了一半。',
      },
    ],
  },
}

/**
 * 京城事件里的“官身”：尽量让当前存档里的真实朝臣/宗室出场。
 * 没有合适人物时，才退回事件自带的市井 NPC。
 */
const CITY_EVENT_CAST = {
  street_petition: { role: 'minister', label: '京兆尹', stat: 'civil', offices: ['京兆', '御史', '刑部', '户部'] },
  east_rice: { role: 'minister', label: '户部仓司', stat: 'finance', offices: ['户部', '仓', '京兆'] },
  west_merchant: { role: 'minister', label: '市舶司', stat: 'finance', offices: ['市舶', '户部', '鸿胪'] },
  court_case: { role: 'minister', label: '大理寺卿', stat: 'strategy', offices: ['大理寺', '刑部', '御史'] },
  academy_strike: { role: 'minister', label: '今科主考', stat: 'civil', offices: ['国子监', '翰林', '礼部'] },
  dock_salt: { role: 'minister', label: '漕运使', stat: 'finance', offices: ['漕运', '户部', '工部'] },
  gate_refugee: { role: 'minister', label: '城门守将', stat: 'military', offices: ['禁军', '兵部', '城门'] },
  temple_grain: { role: 'clan', label: '宗正寺卿', stat: 'loyalty', offices: ['宗正', '礼部', '鸿胪'] },
  poor_child: { role: 'child', label: '子嗣', stat: 'ambition', minAge: 10 },
}

const pickCityActor = (state, eventId) => {
  const cast = CITY_EVENT_CAST[eventId]
  if (!cast) return null
  const pool = (state.characters || [])
    .filter((item) => (
      item.alive !== false
      && item.role === cast.role
      && item.postType !== 'local'
      && !item.regionId
      && (!cast.minAge || Number(item.age) >= cast.minAge)
      && (!cast.offices?.length || cast.offices.some((hint) => String(item.office || '').includes(hint)))
    ))
    .sort((a, b) => (Number(b[cast.stat]) || 0) - (Number(a[cast.stat]) || 0))
  const actor = pool[0]
  if (!actor) return null
  return {
    id: actor.id,
    name: actor.name,
    office: actor.office || actor.roleLabel || cast.label,
    label: cast.label,
  }
}

// 官员对处置的反应：不是所有“正确决定”都得人心
CITY_EVENTS.street_petition.choices[0].actorEffect = { loyalty: -4, ambition: 2 }
CITY_EVENTS.street_petition.choices[2].actorEffect = { loyalty: 3 }
CITY_EVENTS.east_rice.choices[0].actorEffect = { loyalty: -3 }
CITY_EVENTS.east_rice.choices[2].actorEffect = { loyalty: 2 }
CITY_EVENTS.west_merchant.choices[0].actorEffect = { loyalty: -3 }
CITY_EVENTS.west_merchant.choices[1].actorEffect = { loyalty: 2 }
CITY_EVENTS.court_case.choices[0].actorEffect = { loyalty: -4, ambition: 2 }
CITY_EVENTS.court_case.choices[1].actorEffect = { loyalty: 3 }
CITY_EVENTS.academy_strike.choices[0].actorEffect = { loyalty: -3 }
CITY_EVENTS.academy_strike.choices[1].actorEffect = { loyalty: 4 }
CITY_EVENTS.dock_salt.choices[0].actorEffect = { loyalty: -5, ambition: 2 }
CITY_EVENTS.dock_salt.choices[2].actorEffect = { loyalty: 4 }
CITY_EVENTS.gate_refugee.choices[0].actorEffect = { loyalty: -4 }
CITY_EVENTS.gate_refugee.choices[1].actorEffect = { loyalty: 4 }
CITY_EVENTS.temple_grain.choices[0].actorEffect = { loyalty: 3 }
CITY_EVENTS.temple_grain.choices[1].actorEffect = { loyalty: -3 }

// 负面状态的来源：处置不是免费的，压下去也会留下东西
const CITY_BURDEN_EFFECTS = {
  street_petition: {
    accept: { stress: 4 },
    disperse: { stress: 2, tyranny: 2, trait: 'cruel' },
  },
  east_rice: {
    open: { stress: 2 },
    free: { stress: 1, debuff: 'faction' },
  },
  west_merchant: {
    increase: { stress: 1, debuff: 'faction' },
    expel: { stress: 2, tyranny: 2, trait: 'cruel' },
  },
  poor_beggar: {
    punish: { stress: 2, tyranny: 1 },
    shelter: { stress: 1 },
  },
  court_case: {
    keep: { stress: 2 },
    release: { stress: 4, debuff: 'faction' },
  },
  academy_strike: {
    arrest: { stress: 3, tyranny: 2, trait: 'cruel' },
  },
  dock_salt: {
    seize: { stress: 2 },
    ignore: { stress: 3, debuff: 'unpaid_army' },
  },
  gate_refugee: {
    open: { stress: 4 },
    close: { stress: 3, tyranny: 2, trait: 'cruel' },
  },
  temple_grain: {
    ban: { stress: 2, tyranny: 2, trait: 'cruel' },
  },
}

for (const [eventId, choiceMap] of Object.entries(CITY_BURDEN_EFFECTS)) {
  const event = CITY_EVENTS[eventId]
  if (!event) continue
  for (const choice of event.choices) {
    const extra = choiceMap[choice.id]
    if (extra) choice.effects = { ...(choice.effects || {}), ...extra }
  }
}

export const NIGHT_VENUES = [
  {
    id: 'jiaofang',
    name: '教坊司',
    subtitle: '琴笛、旧谱、罪臣之后',
    extras: [
      { id: 'drink', label: '喝一壶', desc: '内帑 -50 · 健康 -1 · 圣听 +1', cost: 50 },
    ],
  },
  {
    id: 'boat',
    name: '画舫',
    subtitle: '琵琶、胡旋、酒与香料',
    extras: [
      { id: 'spring', label: '留宿画舫 · 春风一夜', desc: '内帑 -500 · 风评 -3 · 健康 -4 · 后宫张力 +2', cost: 500 },
      { id: 'drink', label: '喝一壶', desc: '内帑 -50 · 健康 -1 · 圣听 +1', cost: 50 },
    ],
  },
  {
    id: 'tavern',
    name: '醉仙楼',
    subtitle: '说书、赌局、朝中消息',
    extras: [
      { id: 'gamble_small', label: '小赌一局 · 200 贯', desc: '赢 400 · 输 200 · 风评 -1 · 健康 -1', cost: 200 },
      { id: 'gamble_big', label: '大赌一局 · 1000 贯', desc: '赢 2200 · 输 1000 · 风评 -3 · 健康 -2', cost: 1000 },
      { id: 'drink', label: '喝一壶', desc: '内帑 -50 · 健康 -1 · 圣听 +1', cost: 50 },
    ],
  },
  {
    id: 'alley',
    name: '后巷',
    subtitle: '药香、藏身、没有名字的人',
    extras: [
      { id: 'drink', label: '喝一壶', desc: '内帑 -50 · 健康 -1 · 圣听 +1', cost: 50 },
    ],
  },
]

export const NIGHT_PERFORMERS = [
  {
    id: 'night_shen',
    name: '沈照雪',
    gender: '女',
    age: 22,
    venue: 'jiaofang',
    art: '琴',
    talent: 92,
    favor: 18,
    price: 1200,
    risk: 2,
    tags: ['清冷', '罪臣之后', '琴'],
    background: '父亲曾任御史，因科场案被贬，死在路上。她被没入教坊。',
    secret: '她想借入宫，翻父亲的旧案。',
    willing: ['musician', 'official', 'consort'],
    stats: { civil: 52, military: 12, strategy: 68, charm: 88, finance: 38 },
    loyalty: 60,
    ambition: 45,
  },
  {
    id: 'night_xie',
    name: '谢临风',
    gender: '男',
    age: 24,
    venue: 'jiaofang',
    art: '笛',
    talent: 84,
    favor: 22,
    price: 700,
    risk: 2,
    tags: ['落第', '善笛', '寒门'],
    background: '考了三次都没中。最后一次，他的卷子被人换了名字。',
    secret: '他知道今科主考收了谁的钱。',
    willing: ['musician', 'advisor'],
    stats: { civil: 70, military: 18, strategy: 66, charm: 72, finance: 35 },
    loyalty: 55,
    ambition: 58,
  },
  {
    id: 'night_su',
    name: '苏怜卿',
    gender: '女',
    age: 25,
    venue: 'boat',
    art: '琵琶',
    talent: 86,
    favor: 28,
    price: 1500,
    risk: 3,
    tags: ['盐商养女', '善琵琶', '会算账'],
    background: '盐商把她养在画舫上，教她琵琶，也教她看账。',
    secret: '她手里有一本两淮私账。',
    willing: ['musician', 'advisor', 'consort'],
    stats: { civil: 45, military: 10, strategy: 74, charm: 82, finance: 78 },
    loyalty: 52,
    ambition: 62,
  },
  {
    id: 'night_ashina',
    name: '阿史那月',
    gender: '女',
    age: 21,
    venue: 'boat',
    art: '胡旋',
    talent: 88,
    favor: 14,
    price: 1000,
    risk: 3,
    tags: ['外邦', '胡旋', '找兄弟'],
    background: '随商队入京，商队走了，她留了下来。',
    secret: '她不是商队的人。她在找失散的兄弟。',
    willing: ['musician', 'advisor'],
    stats: { civil: 28, military: 46, strategy: 55, charm: 90, finance: 22 },
    loyalty: 48,
    ambition: 36,
  },
  {
    id: 'night_liu',
    name: '柳三娘',
    gender: '女',
    age: 31,
    venue: 'tavern',
    art: '说书',
    talent: 80,
    favor: 24,
    price: 800,
    risk: 1,
    tags: ['寡妇', '说书', '朝中消息'],
    background: '丈夫死在狱里。她把朝中旧事编成故事，没人知道她讲的是真的。',
    secret: '她记得科场舞弊名单上的每一个名字。',
    willing: ['official', 'advisor'],
    stats: { civil: 58, military: 8, strategy: 78, charm: 70, finance: 44 },
    loyalty: 58,
    ambition: 40,
  },
  {
    id: 'night_gu',
    name: '顾清商',
    gender: '女',
    age: 27,
    venue: 'alley',
    art: '医术',
    talent: 75,
    favor: 20,
    price: 900,
    risk: 2,
    tags: ['女医', '藏身', '旧案'],
    background: '在后巷替人看病，不收穷人的钱。她的药箱底下，压着一张通缉令。',
    secret: '她替一个不该活着的人藏了三年。',
    willing: ['official', 'musician'],
    stats: { civil: 48, military: 12, strategy: 70, charm: 66, finance: 50 },
    loyalty: 60,
    ambition: 30,
  },
]

const NIGHT_ROLES = {
  musician: { label: '乐师', office: '教坊乐师', role: 'servant', favor: 30, effects: { reputation: -2, tension: 2, intel: 1, scandal: 2 } },
  official: { label: '女官/侍读', office: '女官', role: 'servant', favor: 35, effects: { reputation: -1, tension: 1, intel: 3, scandal: 2 } },
  consort: { label: '侍宠', office: '侍宠', role: 'consort', favor: 50, effects: { reputation: -6, tension: 8, intel: 1, scandal: 4 } },
  advisor: { label: '客卿', office: '客卿', role: 'servant', favor: 40, effects: { reputation: -2, tension: 0, intel: 4, scandal: 3 } },
}

export const ensureCityFields = (state) => {
  if (!state) return state
  if (!state.city || typeof state.city !== 'object') {
    state.city = {
      mode: 'incognito',
      districtId: 'street',
      encounter: null,
      result: '',
      order: 45,
      scandal: 0,
      nightVenueId: 'jiaofang',
      performerId: '',
      roleOpen: false,
      roster: [],
      performerState: {},
      log: [],
      impeachment: false,
    }
  }
  const city = state.city
  if (typeof city.mode !== 'string') city.mode = 'incognito'
  if (typeof city.districtId !== 'string') city.districtId = 'street'
  if (typeof city.order !== 'number') city.order = 45
  if (typeof city.scandal !== 'number') city.scandal = 0
  if (typeof city.nightVenueId !== 'string') city.nightVenueId = 'jiaofang'
  if (typeof city.performerId !== 'string') city.performerId = ''
  if (typeof city.roleOpen !== 'boolean') city.roleOpen = false
  if (!Array.isArray(city.roster)) city.roster = []
  if (!Array.isArray(city.log)) city.log = []
  if (!city.performerState || typeof city.performerState !== 'object') city.performerState = {}
  if (typeof city.impeachment !== 'boolean') city.impeachment = false
  for (const performer of NIGHT_PERFORMERS) {
    if (!city.performerState[performer.id]) {
      city.performerState[performer.id] = {
        favor: performer.favor,
        recruited: false,
        probed: false,
      }
    }
  }
  return state
}

export const getNightPerformers = (state) => {
  ensureCityFields(state)
  return NIGHT_PERFORMERS.map((performer) => ({
    ...performer,
    ...state.city.performerState[performer.id],
  }))
}

export const setCityMode = (state, mode) => {
  if (!state || state.status !== 'playing') return { success: false, state, message: '当前无法出宫' }
  ensureCityFields(state)
  if (!['incognito', 'formal'].includes(mode)) return { success: false, state, message: '未知出宫方式' }
  const next = clone(state)
  next.city.mode = mode
  next.city.encounter = null
  next.city.result = ''
  next.updatedAt = Date.now()
  return { success: true, state: next, message: mode === 'incognito' ? '微服出宫' : '仪仗出宫' }
}

export const selectCityDistrict = (state, districtId) => {
  if (!state || state.status !== 'playing') return { success: false, state, message: '当前无法出宫' }
  ensureCityFields(state)
  if (!CITY_DISTRICTS.some((item) => item.id === districtId)) {
    return { success: false, state, message: '没有这处坊市' }
  }
  const next = clone(state)
  next.city.districtId = districtId
  next.city.encounter = null
  next.city.result = ''
  next.updatedAt = Date.now()
  return { success: true, state: next, message: '' }
}

export const startCityAction = (state, districtId, actionId) => {
  if (!state || state.status !== 'playing') return { success: false, state, message: '当前无法出宫' }
  ensureCityFields(state)
  const district = CITY_DISTRICTS.find((item) => item.id === districtId)
  const action = district?.actions.find((item) => item.id === actionId)
  if (!district || !action) return { success: false, state, message: '没有这处坊市' }
  if ((Number(state.actionPoints) || 0) <= 0) return { success: false, state, message: '本旬行动点已用完' }
  if ((Number(state.ruler.health) || 0) <= 0) return { success: false, state, message: '身体撑不住了，先回宫' }

  const event = CITY_EVENTS[action.eventId]
  if (!event) return { success: false, state, message: '这里暂时无事' }

  const next = clone(state)
  ensureCityFields(next)
  next.actionPoints = Math.max(0, (next.actionPoints || 0) - 1)
  addStress(next, 1)
  if (next.city.mode === 'incognito') {
    next.ruler.health = clamp((Number(next.ruler.health) || 0) - 1, 0, 100)
  } else {
    next.resources.treasury = Math.max(0, (Number(next.resources.treasury) || 0) - 50)
    next.resources.prestige = clamp((Number(next.resources.prestige) || 0) + 1, 0, 100)
  }
  const actor = pickCityActor(next, action.eventId)
  next.city.districtId = districtId
  next.city.encounter = {
    eventId: action.eventId,
    title: event.title,
    actor: actor?.name || event.actor,
    actorId: actor?.id || '',
    actorOffice: actor?.office || '',
    role: actor?.office || actor?.label || event.role,
    text: actor
      ? `${actor.name}（${actor.office || actor.label}）也在场。${event.text}`
      : event.text,
    choices: event.choices,
    formal: next.city.mode === 'formal',
    districtName: district.name,
    actionName: action.label,
  }
  next.city.result = ''
  next.updatedAt = Date.now()
  return { success: true, state: next, message: `${district.name} · ${action.label}` }
}

export const resolveCityChoice = (state, choiceId) => {
  if (!state || state.status !== 'playing') return { success: false, state, message: '当前无法处置' }
  ensureCityFields(state)
  const encounter = state.city.encounter
  if (!encounter) return { success: false, state, message: '这里没有待处置的事' }
  const choice = encounter.choices.find((item) => item.id === choiceId)
  if (!choice) return { success: false, state, message: '没有这个选择' }

  const next = clone(state)
  ensureCityFields(next)
  applyEffects(next, choice.effects)
  let resultText = choice.result
  if (encounter.actorId && (choice.actorEffect || choice.childEffect)) {
    const actor = (next.characters || []).find((item) => item.id === encounter.actorId && item.alive !== false)
    if (actor) {
      if (choice.actorEffect?.loyalty) {
        actor.loyalty = clamp((Number(actor.loyalty) || 0) + choice.actorEffect.loyalty, 0, 100)
      }
      if (choice.actorEffect?.ambition) {
        actor.ambition = clamp((Number(actor.ambition) || 0) + choice.actorEffect.ambition, 0, 100)
      }
      if (choice.childEffect?.intimacy) {
        actor.intimacy = clamp((Number(actor.intimacy) || 0) + choice.childEffect.intimacy, 0, 100)
      }
      if (choice.childEffect?.ambition) {
        actor.ambition = clamp((Number(actor.ambition) || 0) + choice.childEffect.ambition, 0, 100)
      }
      resultText += ` ${actor.name}没有当场说话，但这件事会留在心里。`
    }
  }
  next.city.result = resultText
  next.city.encounter = null
  log(next, `${encounter.districtName} · ${encounter.title}`, `${choice.text}。${resultText}`)
  if (next.city.scandal >= 28) next.city.impeachment = true
  next.updatedAt = Date.now()
  return { success: true, state: next, message: resultText, resultText }
}

export const selectNightVenue = (state, venueId) => {
  if (!state || state.status !== 'playing') return { success: false, state, message: '当前无法夜行' }
  ensureCityFields(state)
  if (!NIGHT_VENUES.some((item) => item.id === venueId)) {
    return { success: false, state, message: '没有这处地方' }
  }
  const next = clone(state)
  next.city.nightVenueId = venueId
  next.city.performerId = ''
  next.city.result = ''
  next.updatedAt = Date.now()
  return { success: true, state: next, message: '' }
}

export const startNightAction = (state, venueId, extraId) => {
  if (!state || state.status !== 'playing') return { success: false, state, message: '当前无法夜行' }
  ensureCityFields(state)
  const venue = NIGHT_VENUES.find((item) => item.id === venueId)
  const extra = venue?.extras.find((item) => item.id === extraId)
  if (!venue || !extra) return { success: false, state, message: '没有这处地方' }
  if ((Number(state.actionPoints) || 0) <= 0) return { success: false, state, message: '夜色已尽，回宫吧' }
  if ((Number(state.resources.treasury) || 0) < extra.cost) {
    return { success: false, state, message: `内帑不足 ${extra.cost} 贯` }
  }

  const next = clone(state)
  ensureCityFields(next)
  next.actionPoints = Math.max(0, (next.actionPoints || 0) - 1)
  next.resources.treasury -= extra.cost
  let message = ''

  if (extraId === 'spring') {
    next.resources.prestige = clamp((Number(next.resources.prestige) || 0) - 3, 0, 100)
    next.ruler.health = clamp((Number(next.ruler.health) || 0) - 4, 0, 100)
    addStress(next, 3)
    next.haremTensionBoost = clamp((Number(next.haremTensionBoost) || 0) + 2, -30, 100)
    next.city.scandal = clamp(next.city.scandal + 2, 0, 100)
    message = '你在画舫留宿。次日回宫时，内帑少了一笔，精神也差了些。'
  } else if (extraId === 'drink') {
    next.ruler.health = clamp((Number(next.ruler.health) || 0) - 1, 0, 100)
    addStress(next, -2)
    next.resources.intelligence = clamp((Number(next.resources.intelligence) || 0) + 1, 0, 100)
    message = '酒不算好，但邻桌的话比酒有用。你听见了一个名字，没有立刻记住。'
  } else if (extraId === 'gamble_small' || extraId === 'gamble_big') {
    const big = extraId === 'gamble_big'
    const winAmount = big ? 2200 : 400
    const win = Math.random() < (big ? 0.45 : 0.52)
    if (win) next.resources.treasury += winAmount
    next.resources.prestige = clamp((Number(next.resources.prestige) || 0) - (big ? 3 : 1), 0, 100)
    next.ruler.health = clamp((Number(next.ruler.health) || 0) - (big ? 2 : 1), 0, 100)
    addStress(next, big ? 4 : 2)
    next.city.scandal = clamp(next.city.scandal + (big ? 3 : 1), 0, 100)
    message = win
      ? `你赢了。庄家笑着把铜钱推过来。内帑 +${winAmount - extra.cost} 贯。`
      : `你输了。${extra.cost} 贯被庄家收走。旁边的人没有看你。`
  }

  if (next.ruler.health <= 0) {
    next.actionPoints = 0
    message += ' 你的身体撑不住了。太医被叫来，今夜不能再走。'
  }
  if (next.city.scandal >= 28) next.city.impeachment = true
  next.city.result = message
  log(next, `灯市 · ${venue.name}`, message)
  next.updatedAt = Date.now()
  return { success: true, state: next, message }
}

export const nightPerformerAction = (state, performerId, action) => {
  if (!state || state.status !== 'playing') return { success: false, state, message: '当前无法夜行' }
  ensureCityFields(state)
  const person = getNightPerformers(state).find((item) => item.id === performerId)
  if (!person || person.recruited) return { success: false, state, message: '此人不在灯市' }
  if ((Number(state.actionPoints) || 0) <= 0) return { success: false, state, message: '夜色已尽，回宫吧' }

  const next = clone(state)
  ensureCityFields(next)
  const progress = next.city.performerState[performerId]
  next.actionPoints = Math.max(0, (next.actionPoints || 0) - 1)
  let message = ''

  if (action === 'listen') {
    if ((Number(next.resources.treasury) || 0) < 50) return { success: false, state, message: '内帑不够听这一曲' }
    next.resources.treasury -= 50
    progress.favor = clamp((progress.favor || 0) + 8, 0, 100)
    message = `${person.name}奏了一曲。没有问你从哪里来，也没有问你要去哪里。`
  } else if (action === 'talk') {
    progress.favor = clamp((progress.favor || 0) + 10, 0, 100)
    next.resources.intelligence = clamp((Number(next.resources.intelligence) || 0) + 1, 0, 100)
    message = `${person.name}说了些京城的事。有些像真的，有些像试探。`
  } else if (action === 'gift') {
    if ((Number(next.resources.treasury) || 0) < 300) return { success: false, state, message: '内帑不够这份礼' }
    next.resources.treasury -= 300
    progress.favor = clamp((progress.favor || 0) + 15, 0, 100)
    message = `礼送进去了。${person.name}收了，但没有立刻戴。`
  } else if (action === 'probe') {
    progress.favor = clamp((progress.favor || 0) - 2, 0, 100)
    progress.probed = true
    next.resources.intelligence = clamp((Number(next.resources.intelligence) || 0) + 2, 0, 100)
    message = `${person.name}沉默了一会儿，说：${person.secret}`
  } else {
    return { success: false, state, message: '未知动作' }
  }

  next.city.performerId = performerId
  next.city.result = message
  log(next, `灯市 · ${person.name}`, message)
  next.updatedAt = Date.now()
  return { success: true, state: next, message }
}

export const recruitNightPerformer = (state, performerId, roleKey) => {
  if (!state || state.status !== 'playing') return { success: false, state, message: '当前无法延请' }
  ensureCityFields(state)
  const person = getNightPerformers(state).find((item) => item.id === performerId)
  const role = NIGHT_ROLES[roleKey]
  if (!person || !role) return { success: false, state, message: '名分不对' }
  if (person.recruited) return { success: false, state, message: '此人已经入宫' }
  if (!person.willing.includes(roleKey)) return { success: false, state, message: `${person.name}不愿以这个名分入宫` }
  if ((person.favor || 0) < role.favor) return { success: false, state, message: `${person.name}没有答应，好感还不够` }
  if ((Number(state.actionPoints) || 0) <= 0) return { success: false, state, message: '夜色已尽，回宫吧' }
  if ((Number(state.resources.treasury) || 0) < person.price) {
    return { success: false, state, message: `需要 ${person.price} 贯，内帑不够` }
  }

  const next = clone(state)
  ensureCityFields(next)
  const progress = next.city.performerState[performerId]
  next.actionPoints = Math.max(0, (next.actionPoints || 0) - 1)
  next.resources.treasury -= person.price
  next.resources.prestige = clamp((Number(next.resources.prestige) || 0) + role.effects.reputation, 0, 100)
  next.resources.intelligence = clamp((Number(next.resources.intelligence) || 0) + role.effects.intel, 0, 100)
  next.haremTensionBoost = clamp((Number(next.haremTensionBoost) || 0) + role.effects.tension, -30, 100)
  next.city.scandal = clamp(next.city.scandal + role.effects.scandal * person.risk, 0, 100)
  addStress(next, roleKey === 'consort' ? 5 : 2)
  progress.recruited = true

  const rng = createRng((Number(next.seed) || 1) + performerId.length + monthIndex(next))
  const character = {
    id: `night_${performerId}_${next.generation || 1}`,
    name: person.name,
    gender: person.gender,
    role: role.role,
    roleLabel: role.label,
    office: role.office,
    faction: '',
    factionName: '',
    age: person.age,
    loyalty: person.loyalty,
    ambition: person.ambition,
    ...person.stats,
    ability: averageAbility(person.stats),
    health: 82,
    fertility: 70,
    tags: ['灯市', ...person.tags],
    avatarId: pickAvatarId(rng, person.gender),
    alive: true,
    bio: person.background,
    bioPending: false,
    source: 'night_market',
    childrenIds: [],
  }
  next.characters.push(character)
  next.city.roster.push({
    id: person.id,
    characterId: character.id,
    name: person.name,
    role: roleKey,
    roleLabel: role.label,
    favor: progress.favor,
  })
  next.city.result = `${person.name}以${role.label}的身份入宫。这件事，明天会有人递折子。`
  log(next, `延请${person.name}`, `${person.name}以${role.label}入宫，内帑 -${person.price}。`)
  recordActivity(next, `延请${person.name}入宫（${role.label}）`, 'city')
  if (next.city.scandal >= 28) next.city.impeachment = true
  next.updatedAt = Date.now()
  return { success: true, state: next, message: next.city.result }
}

export const resolveCityImpeachment = (state, action) => {
  if (!state || state.status !== 'playing') return { success: false, state, message: '当前无法处置' }
  ensureCityFields(state)
  if (!state.city.impeachment) return { success: false, state, message: '当前没有弹劾' }
  const next = clone(state)
  ensureCityFields(next)
  let message = ''

  if (action === 'admit') {
    next.resources.treasury = Math.max(0, (Number(next.resources.treasury) || 0) - 500)
    next.resources.prestige = clamp((Number(next.resources.prestige) || 0) + 2, 0, 100)
    next.haremTensionBoost = clamp((Number(next.haremTensionBoost) || 0) + 2, -30, 100)
    next.city.scandal = clamp(next.city.scandal - 15, 0, 100)
    message = '你认下了。御史没有再追，后宫多了一个名字。'
  } else if (action === 'deny') {
    next.resources.prestige = clamp((Number(next.resources.prestige) || 0) - 3, 0, 100)
    next.city.scandal = clamp(next.city.scandal + 5, 0, 100)
    message = '你斥其妄言。折子压下了，风闻没有。'
  } else if (action === 'dismiss') {
    const last = next.city.roster.pop()
    if (last) {
      next.characters = next.characters.filter((item) => item.id !== last.characterId)
      const progress = next.city.performerState[last.id]
      if (progress) progress.recruited = false
    }
    next.resources.prestige = clamp((Number(next.resources.prestige) || 0) + 1, 0, 100)
    next.haremTensionBoost = clamp((Number(next.haremTensionBoost) || 0) - 5, -30, 100)
    next.city.scandal = clamp(next.city.scandal - 10, 0, 100)
    message = last ? `${last.name}被送出宫。` : '没有人可送。'
  } else {
    return { success: false, state, message: '未知处置' }
  }

  next.city.impeachment = false
  next.city.result = message
  addStress(next, 2)
  log(next, '御史弹劾', message)
  next.updatedAt = Date.now()
  return { success: true, state: next, message }
}

export const NIGHT_ROLE_OPTIONS = NIGHT_ROLES
