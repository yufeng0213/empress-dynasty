/**
 * 朝政事件池
 *
 * 事件只定义条件、选项与数值效果；文案在本地先给一版，
 * 后续由 LLM 根据同一份数据重写成长剧情。
 */

import { getCharacterStat } from './characters.js'

const res = (key, value) => ({ target: 'resource', key, value })
const ruler = (key, value) => ({ target: 'ruler', key, value })
const role = (roleKey, key, value) => ({ target: 'role', role: roleKey, key, value })
const faction = (factionKey, key, value) => ({ target: 'faction', faction: factionKey, key, value })

export const EVENT_DEFS = [
  {
    id: 'famine_north',
    title: '北境雪灾',
    source: '户部',
    weight: 12,
    minYear: 1,
    cooldown: 6,
    requires: (state) => state.resources.treasury > 300,
    text: '北境连降大雪，牲畜冻毙，流民聚于朔州城外。户部请开仓，御史请先查账。',
    choices: [
      {
        id: 'open_granary',
        text: '即刻开仓，先赈后查',
        hint: '国库 -800 · 民心 +6 · 清流好感 -4',
        effects: [res('treasury', -800), res('popularity', 6), faction('qingliu', 'loyalty', -4)],
        resultText: '粮车出城，流民跪于道旁。御史台的弹章三日后递了上来。',
      },
      {
        id: 'investigate_first',
        text: '先查账，赈济延后',
        hint: '民心 -5 · 圣听 +3',
        effects: [res('popularity', -5), res('intelligence', 3)],
        resultText: '查账的折子堆了半人高，朔州那边又冻死了十七人。',
      },
      {
        id: 'let_minister_handle',
        text: '命户部自筹，朕不过问',
        hint: '朝臣好感 -8 · 威望 +4 · 国库 -200',
        effects: [res('prestige', 4), res('treasury', -200), role('minister', 'loyalty', -8)],
        resultText: '户部变卖了两处官田，勉强凑出粮款。此事后来被写进《循吏传》。',
      },
    ],
  },
  {
    id: 'impeachment',
    title: '御史弹劾',
    source: '御史台',
    weight: 11,
    minYear: 2,
    cooldown: 4,
    text: '御史中丞弹劾户部账目不清，请下狱彻查。被弹者跪于殿外，称愿以死自证。',
    choices: [
      {
        id: 'investigate',
        text: '下狱彻查',
        hint: '圣听 +4 · 朝臣忠诚 -3',
        effects: [res('intelligence', 4), role('minister', 'loyalty', -3)],
        resultText: '三司会审，账目确实有亏空，但只查到一个替死的小吏。',
      },
      {
        id: 'protect',
        text: '压下调子，留中不发',
        hint: '该派系好感 +5 · 清流忠诚 -5',
        effects: [faction('xungui', 'loyalty', 5), faction('qingliu', 'loyalty', -5)],
        resultText: '弹章被留中。御史台三人同日告病。',
      },
      {
        id: 'dismiss_both',
        text: '各打五十大板',
        hint: '威望 +3 · 朝臣野心 +4',
        effects: [res('prestige', 3), role('minister', 'ambition', 4)],
        resultText: '弹劾者与被弹者一起贬出京城。朝堂安静了一个月。',
      },
    ],
  },
  {
    id: 'border_raid',
    title: '边关告急',
    source: '兵部',
    weight: 10,
    minYear: 2,
    cooldown: 5,
    requires: (state) => state.resources.military > 25,
    text: '北狄骑兵越境，掠走边民三千。镇北将军请增兵，兵部说国库撑不住第二场仗。',
    choices: [
      {
        id: 'reinforce',
        text: '增兵三万，主动出击',
        hint: '国库 -1200 · 军力 +6 · 民心 +4',
        effects: [res('treasury', -1200), res('military', 6), res('popularity', 4)],
        followUp: { eventId: 'military_payroll', delay: 3 },
        resultText: '大军出雁门，三月后捷报传回，斩首两千。',
      },
      {
        id: 'negotiate',
        text: '遣使议和，互市换平安',
        hint: '国库 -300 · 军力 -2 · 威望 -3',
        effects: [res('treasury', -300), res('military', -2), res('prestige', -3)],
        resultText: '使团带回了牛羊与盟书。边民说，这已经是第五份盟书了。',
      },
      {
        id: 'hold_line',
        text: '固守不出，等冬天',
        hint: '国库 -400 · 军力 ±0 · 边军忠诚 +4',
        effects: [res('treasury', -400), faction('bianjun', 'loyalty', 4)],
        resultText: '边军缩进堡垒。冬天来得早，北狄退了。',
      },
    ],
  },
  {
    id: 'merchant_road',
    title: '西域互市',
    source: '鸿胪寺',
    weight: 8,
    minYear: 3,
    cooldown: 10,
    text: '西域商队请求开互市，岁入可增八百。清流以为与商贾同席有失体统。',
    choices: [
      {
        id: 'open',
        text: '开市，设市舶司',
        hint: '国库 +800/月 · 清流忠诚 -4',
        effects: [res('treasury', 800), res('popularity', 2), faction('qingliu', 'loyalty', -4)],
        resultText: '西市的驼铃响到深夜。御史台的弹章也响到深夜。',
      },
      {
        id: 'close',
        text: '不准，维持旧制',
        hint: '清流忠诚 +4 · 国库 ±0',
        effects: [faction('qingliu', 'loyalty', 4)],
        resultText: '商队原路返回。三年后，他们在别人的城里建了更大的市。',
      },
    ],
  },
  {
    id: 'flood_south',
    title: '南方水患',
    source: '工部',
    weight: 9,
    minYear: 2,
    cooldown: 6,
    text: '江南梅雨不止，三州堤坝决口。工部请拨银修堤，地方官请先免赋。',
    choices: [
      {
        id: 'build_dike',
        text: '拨银修堤，一劳永逸',
        hint: '国库 -1000 · 民心 +5',
        effects: [res('treasury', -1000), res('popularity', 5)],
        resultText: '新堤成于九月。此后十年，江南再无决口。',
      },
      {
        id: 'tax_relief',
        text: '免赋三年，堤坝缓修',
        hint: '国库 -400 · 民心 +3 · 后续风险',
        effects: [res('treasury', -400), res('popularity', 3), { target: 'flag', key: 'flood_risk', value: true }],
        resultText: '百姓焚香谢恩。工部尚书的折子里，只写了四个字：明年再看。',
      },
    ],
  },
  {
    id: 'harem_dispute',
    title: '后宫争宠',
    source: '内廷',
    weight: 9,
    minYear: 2,
    cooldown: 4,
    requires: (state) => state.characters.filter((c) => c.role === 'consort' && c.alive).length >= 2,
    text: '两位贵人因一支簪子在夜里起了争执，惊动了半个内廷。',
    choices: [
      {
        id: 'favor_one',
        text: '偏袒其中一人',
        hint: '一人好感 +8 · 另一人好感 -8',
        effects: [{ target: 'randomRole', role: 'consort', key: 'loyalty', value: 8 }, { target: 'randomRole', role: 'consort', key: 'loyalty', value: -8 }],
        resultText: '得宠者笑了，失宠者病了。宫里的账，从来不是一支簪子。',
      },
      {
        id: 'punish_both',
        text: '各罚三月月例',
        hint: '威望 +2 · 后宫忠诚 -3',
        effects: [res('prestige', 2), role('consort', 'loyalty', -3)],
        resultText: '内廷安静了。只是那支簪子再也没人见过。',
      },
    ],
  },
  {
    id: 'corruption',
    title: '贪腐案',
    source: '大理寺',
    weight: 9,
    minYear: 2,
    cooldown: 5,
    requires: (state) => state.characters.some((c) => c.alive && c.role === 'minister' && c.ambition > 55),
    text: '漕运账目查出亏空十二万贯，牵涉一位三品大员。此人门生故吏遍布六部。',
    choices: [
      {
        id: 'strict',
        text: '抄家问斩，以儆效尤',
        hint: '国库 +1500 · 朝臣忠诚 -6 · 威望 +5',
        effects: [res('treasury', 1500), role('minister', 'loyalty', -6), res('prestige', 5)],
        resultText: '抄出的银子装了三车。行刑那日，六部无人告假。',
      },
      {
        id: 'lenient',
        text: '罚俸留任，稳住朝局',
        hint: '该派系忠诚 +6 · 民心 -4',
        effects: [faction('xungui', 'loyalty', 6), res('popularity', -4)],
        resultText: '大员谢恩，继续管着漕运。民间开始传一句顺口溜。',
      },
    ],
  },
  {
    id: 'immortal_pill',
    title: '方士献丹',
    source: '内廷',
    weight: 6,
    minYear: 5,
    cooldown: 12,
    text: '有方士自南海来，献长生丹，称服之可延寿十年。太医院说，丹里有朱砂。',
    choices: [
      {
        id: 'take',
        text: '服丹',
        hint: '寿元 +? · 健康 -8',
        effects: [ruler('health', -8), ruler('lifespan', 2), res('prestige', -2)],
        resultText: '丹入喉，如吞炭火。那一夜，你梦见了先帝。',
      },
      {
        id: 'refuse',
        text: '斥退方士',
        hint: '威望 +2 · 圣听 +2',
        effects: [res('prestige', 2), res('intelligence', 2)],
        resultText: '方士被逐出宫门。他在城外笑了三声，说陛下还年轻。',
      },
    ],
  },
  {
    id: 'drought',
    title: '旱灾',
    source: '户部',
    weight: 8,
    minYear: 4,
    cooldown: 8,
    text: '关中大旱，赤地千里。钦天监请陛下斋戒祈雨，户部请开常平仓。',
    choices: [
      {
        id: 'pray',
        text: '斋戒祈雨',
        hint: '威望 +4 · 国库 -200',
        effects: [res('prestige', 4), res('treasury', -200)],
        resultText: '第七日下了雨。史官写：帝诚感天。其实那年的雨，别处也下了。',
      },
      {
        id: 'open_warehouse',
        text: '开常平仓',
        hint: '国库 -700 · 民心 +7',
        effects: [res('treasury', -700), res('popularity', 7)],
        resultText: '仓门开了三天。关中活了很多人。',
      },
    ],
  },
  {
    id: 'exam_fraud',
    title: '科举舞弊',
    source: '礼部',
    weight: 7,
    minYear: 3,
    cooldown: 8,
    text: '春闱放榜，落第举子聚于贡院外，称榜上有名者多为权贵子弟。',
    choices: [
      {
        id: 'retest',
        text: '重考，朕亲自主考',
        hint: '威望 +5 · 勋贵忠诚 -6',
        effects: [res('prestige', 5), faction('xungui', 'loyalty', -6)],
        resultText: '重考那日，你坐在帘后。取中的寒门举子，后来做了二十年清官。',
      },
      {
        id: 'suppress',
        text: '驱散举子，维持原榜',
        hint: '民心 -5 · 勋贵忠诚 +4',
        effects: [res('popularity', -5), faction('xungui', 'loyalty', 4)],
        resultText: '榜还是那张榜。京城里多了一句诗，没人敢念出声。',
      },
    ],
  },
  {
    id: 'clan_marriage',
    title: '宗室请婚',
    source: '宗正寺',
    weight: 7,
    minYear: 3,
    cooldown: 9,
    text: '宗正卿请为安乐王择妃，人选是边军裴氏的庶女。',
    choices: [
      {
        id: 'approve',
        text: '准婚，结好边军',
        hint: '宗室 +4 · 边军 +6 · 清流 -3',
        effects: [faction('zongshi', 'loyalty', 4), faction('bianjun', 'loyalty', 6), faction('qingliu', 'loyalty', -3)],
        resultText: '婚礼办得很热闹。裴家的兵，从此离京城近了一步。',
      },
      {
        id: 'deny',
        text: '不准，另择清流之女',
        hint: '清流 +5 · 边军 -4',
        effects: [faction('qingliu', 'loyalty', 5), faction('bianjun', 'loyalty', -4)],
        resultText: '安乐王没说什么。只是那年秋天，他没进宫请安。',
      },
    ],
  },
  {
    id: 'military_parade',
    title: '阅兵之议',
    source: '兵部',
    weight: 6,
    minYear: 2,
    cooldown: 10,
    requires: (state) => state.resources.military < 55,
    text: '兵部请于秋后阅兵，振军心，亦可震慑北狄。耗银不菲。',
    choices: [
      {
        id: 'parade',
        text: '准，朕亲临校场',
        hint: '国库 -600 · 军力 +5 · 威望 +3',
        effects: [res('treasury', -600), res('military', 5), res('prestige', 3)],
        resultText: '你穿着一身轻甲站在点将台上。那天之后，边军的家书里多了几句话。',
      },
      {
        id: 'cancel',
        text: '罢，银钱另有他用',
        hint: '国库 ±0 · 边军忠诚 -3',
        effects: [faction('bianjun', 'loyalty', -3)],
        resultText: '校场空了。兵部尚书的折子里，多了一行很小的字。',
      },
    ],
  },
  {
    id: 'heir_pressure',
    title: '立储之议',
    source: '中书省',
    weight: 8,
    minYear: 2,
    cooldown: 6,
    requires: (state) => state.heirs.length > 0 && !state.designatedHeirId,
    text: '中书省以“国本未定”为由，请早立储君。三位皇子皇女的名字，都被写进了折子。',
    choices: [
      {
        id: 'promise',
        text: '允诺年内立储',
        hint: '朝臣忠诚 +3 · 宗室 +2',
        effects: [role('minister', 'loyalty', 3), faction('zongshi', 'loyalty', 2)],
        resultText: '折子被批了“知道了”。此后每个月，都会有人再提一次。',
      },
      {
        id: 'reject',
        text: '斥其干涉家事',
        hint: '威望 +3 · 朝臣忠诚 -4',
        effects: [res('prestige', 3), role('minister', 'loyalty', -4)],
        resultText: '中书令跪了半个时辰。国本两个字，再没人敢提。',
      },
    ],
  },
  {
    id: 'granary_audit',
    title: '京仓亏空',
    source: '户部',
    weight: 20,
    minYear: 1,
    cooldown: 2,
    text: '京仓盘点点出三万石亏空。仓吏说去年就报过损耗，户部没有批；户部说账目对不上，不敢批。新粮下月入仓，旧账再拖就要压不住了。',
    choices: [
      {
        id: 'audit',
        text: '彻查仓吏，追赃',
        hint: '圣听 +3 · 国库 +600 · 朝臣忠诚 -3',
        effects: [res('intelligence', 3), res('treasury', 600), role('minister', 'loyalty', -3)],
        followUp: { eventId: 'granary_implicate', delay: 2 },
        resultText: '仓吏下狱，追回六百贯。六部人人自危，接下来几天的折子都写得很短。',
      },
      {
        id: 'cover',
        text: '按损耗补账，先过这一关',
        hint: '国库 -400 · 民心 -2',
        effects: [res('treasury', -400), res('popularity', -2)],
        resultText: '账平了。亏空被摊进今年的损耗里，京城米价跟着涨了一成。',
      },
      {
        id: 'reform',
        text: '换仓官，重立盘查章程',
        hint: '国库 -200 · 圣听 +2 · 民心 +1',
        effects: [res('treasury', -200), res('intelligence', 2), res('popularity', 1)],
        resultText: '新仓官上任，旧账封存。盘查章程贴在了仓门口。',
      },
    ],
  },
]

/* ============================================================
 * 有名字的动态事件
 * 同一个事件模板，不同月份会落到不同的人身上
 * ============================================================ */

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

const charEffect = (id, key, value) => ({ target: 'character', id, key, value })
const dismissEffect = (id) => ({ target: 'dismiss', characterId: id })
const rumorEffect = (text, characterId = '', revealed = false) => ({
  target: 'rumor', text, characterId, revealed,
})

const DYNAMIC_EVENTS = [
  {
    id: 'minister_leave',
    title: '丁忧',
    source: '吏部',
    weight: 9,
    minYear: 1,
    cooldown: 12,
    build(state, rng) {
      const actor = pickOne(rng, alive(state, (item) => item.role === 'minister'))
      if (!actor) return null
      return {
        text: `${actor.name}递了丁忧折子，说母亲病重，请解职归乡。他手里还压着两淮盐引的账。`,
        actors: [actorOf(actor)],
        choices: [
          {
            id: 'approve',
            text: '准其丁忧',
            hint: `${actor.name}去职，官缺待补`,
            effects: [dismissEffect(actor.id), res('prestige', 1)],
            resultText: `${actor.name}交印出京。吏部连夜把缺员名单送了上来。`,
          },
          {
            id: 'retain',
            text: '夺情留任',
            hint: `${actor.name}好感 -8 · 考成 +4 · 威望 +1`,
            effects: [charEffect(actor.id, 'loyalty', -8), charEffect(actor.id, 'performance', 4), res('prestige', 1)],
            resultText: `${actor.name}留了下来。此后三个月，他没再提过母亲。`,
          },
          {
            id: 'doctor',
            text: '派太医，留人',
            hint: '国库 -200 · 好感 +6',
            effects: [res('treasury', -200), charEffect(actor.id, 'loyalty', 6)],
            resultText: `太医去了${actor.name}的老家。折子上的字，比上个月软了些。`,
          },
        ],
      }
    },
  },
  {
    id: 'general_affair',
    title: '武将骂御史',
    source: '御史台',
    weight: 8,
    minYear: 1,
    cooldown: 10,
    build(state, rng) {
      const generals = alive(state, (item) => item.role === 'minister' || item.role === 'clan')
        .sort((a, b) => getCharacterStat(b, 'military') - getCharacterStat(a, 'military'))
      const actor = generals[0]
      const victim = pickOne(rng, alive(state, (item) => item.role === 'minister' && item.id !== actor?.id))
      if (!actor || !victim) return null
      return {
        text: `酒宴上，${actor.name}骂御史${victim.name}只会写文章。第二天，弹章递到御前，连酒席上摔碎的碗都写进去了。`,
        actors: [actorOf(actor), actorOf(victim)],
        choices: [
          {
            id: 'fine',
            text: '罚俸一年',
            hint: `${actor.name}好感 -6 · 威望 +1`,
            effects: [charEffect(actor.id, 'loyalty', -6), res('prestige', 1)],
            resultText: `${actor.name}交了罚俸。酒宴上的事，再没人提。`,
          },
          {
            id: 'jail',
            text: '下狱，以正纲纪',
            hint: `${actor.name}去职 · 军力 -3 · 威望 +2`,
            effects: [dismissEffect(actor.id), res('military', -3), res('prestige', 2)],
            resultText: `${actor.name}被押入狱。边军递来的折子，语气冷了很多。`,
          },
          {
            id: 'mediate',
            text: '各打五十大板',
            hint: '威望 -2 · 双方好感变化',
            effects: [
              res('prestige', -2),
              charEffect(actor.id, 'loyalty', 3),
              charEffect(victim.id, 'loyalty', -3),
            ],
            resultText: '两个人都挨了训。御史台和兵部，从此在朝会上不站同一侧。',
          },
        ],
      }
    },
  },
  {
    id: 'governor_gift',
    title: '一箱新茶',
    source: '内廷',
    weight: 8,
    minYear: 1,
    cooldown: 12,
    build(state, rng) {
      const actor = pickOne(rng, alive(state, (item) => item.postType === 'local' && item.region))
      if (!actor) return null
      return {
        text: `${actor.name}派人送来一箱新茶，说是今年头采。箱底压着三千贯银票，押箱的人还在宫门外等回话。`,
        actors: [actorOf(actor)],
        choices: [
          {
            id: 'accept',
            text: '收下，不必声张',
            hint: '国库 +3000 · 圣听 -3 · 该官好感 +8',
            effects: [
              res('treasury', 3000),
              res('intelligence', -3),
              charEffect(actor.id, 'loyalty', 8),
              rumorEffect(`${actor.name}进献新茶，箱底似乎还有别的东西。`, actor.id, false),
            ],
            resultText: '茶收进了内库。银票没有入账。',
          },
          {
            id: 'return',
            text: '原箱退回',
            hint: '该官好感 -6 · 威望 +2',
            effects: [charEffect(actor.id, 'loyalty', -6), res('prestige', 2)],
            resultText: `箱子原样抬了回去。第二天，${actor.name}的请安折子没来。`,
          },
          {
            id: 'investigate',
            text: '查办，连箱子一起封',
            hint: '该官去职 · 圣听 +3 · 威望 +3',
            effects: [
              dismissEffect(actor.id),
              res('intelligence', 3),
              res('prestige', 3),
              rumorEffect(`${actor.name}以新茶为名进献银票，已查实。`, actor.id, true),
            ],
            resultText: `${actor.name}被押回京。茶箱封存在大理寺，银票一张没少。`,
          },
        ],
      }
    },
  },
  {
    id: 'heir_tutor',
    title: '皇子逃学',
    source: '东宫',
    weight: 7,
    minYear: 3,
    cooldown: 12,
    requireChild: true,
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
            effects: [
              charEffect(child.id, 'loyalty', -5),
              charEffect(child.id, 'civil', 3),
              charEffect(tutor.id, 'loyalty', 3),
            ],
            resultText: `${child.name}被关在书房抄了三天书。白鹤的事，没人再提。`,
          },
          {
            id: 'indulge',
            text: '随他去吧',
            hint: `${child.name}好感 +4 · 文治 -2`,
            effects: [charEffect(child.id, 'loyalty', 4), charEffect(child.id, 'civil', -2)],
            resultText: `${child.name}得了新弓。太傅称病，三天没进书房。`,
          },
          {
            id: 'replace',
            text: '换一位师傅',
            hint: '国库 -200 · 文治 +2 · 太傅好感 -4',
            effects: [
              res('treasury', -200),
              charEffect(child.id, 'civil', 2),
              charEffect(tutor.id, 'loyalty', -4),
            ],
            resultText: `新师傅从翰林院调来。${tutor.name}把书箱搬走时，一句话没说。`,
          },
        ],
      }
    },
  },
  {
    id: 'consort_brother',
    title: '枕边求官',
    source: '内廷',
    weight: 8,
    minYear: 1,
    cooldown: 10,
    build(state, rng) {
      const consort = pickOne(rng, alive(state, (item) => item.role === 'consort'))
      if (!consort) return null
      return {
        text: `${consort.name}托人递话：她兄长在吏部候缺，想补一个知州。话说得很轻，像只是随口提起。`,
        actors: [actorOf(consort)],
        choices: [
          {
            id: 'grant',
            text: '准了',
            hint: '国库 -300 · 该侍宠好感 +6 · 圣听 -2',
            effects: [
              res('treasury', -300),
              charEffect(consort.id, 'loyalty', 6),
              res('intelligence', -2),
            ],
            resultText: `${consort.name}的兄长补了知州。吏部的缺员名单上，少了一个名字。`,
          },
          {
            id: 'deny',
            text: '不准',
            hint: '该侍宠好感 -8 · 威望 +2',
            effects: [charEffect(consort.id, 'loyalty', -8), res('prestige', 2)],
            resultText: `${consort.name}谢了恩，退了出去。此后半个月，她没再递话。`,
          },
          {
            id: 'outpost',
            text: '外放远州',
            hint: '国库 -100 · 该侍宠好感 +2 · 野心 -4',
            effects: [
              res('treasury', -100),
              charEffect(consort.id, 'loyalty', 2),
              charEffect(consort.id, 'ambition', -4),
            ],
            resultText: `${consort.name}的兄长去了岭南。知州变成了县丞。`,
          },
        ],
      }
    },
  },
  {
    id: 'eunuch_rumor',
    title: '御书房外的灰',
    source: '内廷',
    weight: 7,
    minYear: 1,
    cooldown: 10,
    build(state, rng) {
      const servant = pickOne(rng, alive(state, (item) => item.role === 'servant'))
      if (!servant) return null
      return {
        text: `${servant.name}说，昨夜有人在御书房外烧纸。灰里捡到半张名单，上面的字被火燎去了一半。`,
        actors: [actorOf(servant)],
        choices: [
          {
            id: 'investigate',
            text: '彻查',
            hint: '圣听 +4 · 威望 -1',
            effects: [
              res('intelligence', 4),
              res('prestige', -1),
              rumorEffect('御书房外有人烧纸，灰里留下半张名单。', '', false),
            ],
            resultText: '名单上剩下三个字，其中一个能对上户部的人。',
          },
          {
            id: 'suppress',
            text: '压下，不许再查',
            hint: '威望 +2 · 圣听 -2',
            effects: [res('prestige', 2), res('intelligence', -2)],
            resultText: `灰被扫了。${servant.name}再没提过这件事。`,
          },
          {
            id: 'reward',
            text: '赏他，继续盯着',
            hint: '国库 -100 · 圣听 +2 · 该侍从好感 +5',
            effects: [
              res('treasury', -100),
              res('intelligence', 2),
              charEffect(servant.id, 'loyalty', 5),
            ],
            resultText: `${servant.name}收了赏。御书房外的夜，从此多了一个人。`,
          },
        ],
      }
    },
  },
  {
    id: 'granary_implicate',
    title: '狱中攀咬',
    source: '大理寺',
    weight: 1,
    hidden: true,
    minYear: 2,
    cooldown: 1,
    build(state, rng, context = {}) {
      const actor = state.characters.find((item) => item.id === context.actorId && item.alive !== false)
        || pickOne(rng, alive(state, (item) => item.role === 'minister'))
      if (!actor) return null
      return {
        text: `${actor.name}在狱中攀咬，说京仓亏空有三分之一进了宫中。审案的人把供词送来时，墨迹还没干。`,
        actors: [actorOf(actor)],
        choices: [
          {
            id: 'continue',
            text: '继续查，查到宫里',
            hint: '圣听 +3 · 威望 -2 · 该官好感 -5',
            effects: [res('intelligence', 3), res('prestige', -2), charEffect(actor.id, 'loyalty', -5)],
            resultText: '供词越写越长。内廷开始有人烧东西。',
          },
          {
            id: 'stop',
            text: '到此为止',
            hint: '威望 +2 · 圣听 -2',
            effects: [res('prestige', 2), res('intelligence', -2)],
            resultText: `案子结了。${actor.name}的画押，成了最后一页。`,
          },
          {
            id: 'transfer',
            text: '交三司会审',
            hint: '国库 -300 · 圣听 +4 · 该官去职',
            effects: [res('treasury', -300), res('intelligence', 4), dismissEffect(actor.id)],
            resultText: `三司接了案子。${actor.name}被移出大理寺，再没传过话。`,
          },
        ],
      }
    },
  },
  {
    id: 'military_payroll',
    title: '军饷少了四千贯',
    source: '兵部',
    weight: 1,
    hidden: true,
    minYear: 2,
    cooldown: 1,
    build(state, rng, context = {}) {
      const actor = state.characters.find((item) => item.id === context.actorId && item.alive !== false)
        || alive(state, (item) => item.role === 'minister')
          .sort((a, b) => getCharacterStat(b, 'military') - getCharacterStat(a, 'military'))[0]
      if (!actor) return null
      return {
        text: `大军回营，兵部发现粮饷少了四千贯。管粮的主事说账在${actor.name}手里，${actor.name}说主事经的手。`,
        actors: [actorOf(actor)],
        choices: [
          {
            id: 'audit',
            text: '查账，追赃',
            hint: '圣听 +3 · 国库 +500 · 该官好感 -6',
            effects: [res('intelligence', 3), res('treasury', 500), charEffect(actor.id, 'loyalty', -6)],
            resultText: '追回五百贯。剩下的三千五百贯，账上写的是“途中损耗”。',
          },
          {
            id: 'cover',
            text: '补上，不追究',
            hint: '国库 -800 · 威望 +1',
            effects: [res('treasury', -800), res('prestige', 1)],
            resultText: '军饷补上了。边军按时发了饷，没人再问那四千贯。',
          },
          {
            id: 'suppress',
            text: '压下，先稳住边军',
            hint: '威望 -2 · 该官好感 +5',
            effects: [res('prestige', -2), charEffect(actor.id, 'loyalty', 5)],
            resultText: `账册被封。${actor.name}送来的谢恩折子，比往常厚。`,
          },
        ],
      }
    },
  },
  {
    id: 'exam_scandal',
    title: '科场舞弊',
    source: '礼部',
    weight: 8,
    minYear: 3,
    cooldown: 12,
    build(state, rng) {
      const master = pickOne(rng, alive(state, (item) => (
        item.role === 'minister' && Number(item.rank) > 0
      )))
      if (!master) return null
      return {
        text: `今科放榜后，落第举子聚在贡院外，说前三十名里有十二个是官员子弟。主考${master.name}闭门不出，只递了一张“臣无话可说”的条子。`,
        actors: [actorOf(master)],
        choices: [
          {
            id: 'review',
            text: '重查试卷',
            hint: '圣听 +3 · 威望 +2 · 主考好感 -8',
            effects: [res('intelligence', 3), res('prestige', 2), charEffect(master.id, 'loyalty', -8)],
            resultText: '试卷重查，三名官员子弟被除名。主考没有上折子。',
          },
          {
            id: 'suppress',
            text: '压榜，不许再议',
            hint: '威望 -3 · 民心 -3 · 主考好感 +5',
            effects: [res('prestige', -3), res('popularity', -3), charEffect(master.id, 'loyalty', 5)],
            resultText: '贡院外的举子被驱散。第二天，京城里多了一句顺口溜。',
          },
          {
            id: 'replace',
            text: '换主考，重考',
            hint: '国库 -400 · 圣听 +4 · 主考去职',
            effects: [res('treasury', -400), res('intelligence', 4), dismissEffect(master.id)],
            resultText: `${master.name}交印。新主考从翰林院调来，重考定在三月后。`,
          },
        ],
      }
    },
  },
  {
    id: 'border_pay',
    title: '边军只发半饷',
    source: '兵部',
    weight: 9,
    minYear: 1,
    cooldown: 10,
    build(state, rng) {
      const actor = alive(state, (item) => item.role === 'minister')
        .sort((a, b) => getCharacterStat(b, 'military') - getCharacterStat(a, 'military'))[0]
      if (!actor) return null
      return {
        text: `北境军中已经三个月只发半饷。${actor.name}没有上折子，只让亲兵带了一句：“再拖，臣管不住。”`,
        actors: [actorOf(actor)],
        choices: [
          {
            id: 'pay',
            text: '补足军饷',
            hint: '国库 -1200 · 军力 +4 · 该官好感 +10',
            effects: [res('treasury', -1200), res('military', 4), charEffect(actor.id, 'loyalty', 10)],
            resultText: '饷银出京。边军没有谢恩，只把营门重新打开了。',
          },
          {
            id: 'partial',
            text: '先发一半，剩下的秋后再补',
            hint: '国库 -500 · 该官好感 -5 · 威望 -1',
            effects: [res('treasury', -500), charEffect(actor.id, 'loyalty', -5), res('prestige', -1)],
            resultText: '半饷发了下去。营中有人说，秋后还有秋后。',
          },
          {
            id: 'refuse',
            text: '让边军自筹',
            hint: '军力 -4 · 该官好感 -12 · 该官野心 +5',
            effects: [res('military', -4), charEffect(actor.id, 'loyalty', -12), charEffect(actor.id, 'ambition', 5)],
            resultText: `${actor.name}没有再递话。北境的商队，开始改走另一条路。`,
          },
        ],
      }
    },
  },
  {
    id: 'clan_estate',
    title: '宗室争庄',
    source: '宗正寺',
    weight: 7,
    minYear: 1,
    cooldown: 12,
    build(state, rng) {
      const clans = alive(state, (item) => item.role === 'clan')
      if (clans.length < 2) return null
      const first = pickOne(rng, clans)
      const second = clans.find((item) => item.id !== first.id)
      if (!first || !second) return null
      return {
        text: `${first.name}与${second.name}为城南一座皇庄争到御前。一个说地契是先帝所赐，一个说庄上的佃户已经交了三年租。`,
        actors: [actorOf(first), actorOf(second)],
        choices: [
          {
            id: 'first',
            text: `判给${first.name}`,
            hint: `${first.name}好感 +8 · ${second.name}好感 -8`,
            effects: [charEffect(first.id, 'loyalty', 8), charEffect(second.id, 'loyalty', -8)],
            resultText: `${second.name}没有再争。宗正寺的档案里，多了一页“已决”。`,
          },
          {
            id: 'treasury',
            text: '收归内库',
            hint: '国库 +800 · 双方好感 -5',
            effects: [res('treasury', 800), charEffect(first.id, 'loyalty', -5), charEffect(second.id, 'loyalty', -5)],
            resultText: '皇庄收归内库。两位宗室一起谢恩，一起告病。',
          },
          {
            id: 'split',
            text: '各打五十大板，租子对半',
            hint: '威望 +1 · 双方好感 -2',
            effects: [res('prestige', 1), charEffect(first.id, 'loyalty', -2), charEffect(second.id, 'loyalty', -2)],
            resultText: '地契封存，租子对半。两个人都没赢。',
          },
        ],
      }
    },
  },
  {
    id: 'flood_relief',
    title: '江南堤决',
    source: '工部',
    weight: 8,
    minYear: 1,
    cooldown: 10,
    build(state, rng) {
      const actor = pickOne(rng, alive(state, (item) => item.postType === 'local' && item.region))
      if (!actor) return null
      return {
        text: `江南连雨，堤决三处。${actor.name}请开常平仓，户部说今年已经拨过两次。`,
        actors: [actorOf(actor)],
        choices: [
          {
            id: 'open',
            text: '开仓，先赈后查',
            hint: '国库 -700 · 民心 +5 · 该官好感 +5',
            effects: [res('treasury', -700), res('popularity', 5), charEffect(actor.id, 'loyalty', 5)],
            resultText: '粮船连夜下江南。户部的账，等水退了再算。',
          },
          {
            id: 'tax',
            text: '免赋三年',
            hint: '国库 -400 · 民心 +4 · 该地风险 -6',
            effects: [res('treasury', -400), res('popularity', 4), { target: 'regionUnrest', regionId: actor.region, value: -6 }],
            resultText: '免赋的告示贴到村口。堤还没修，人心先稳了。',
          },
          {
            id: 'blame',
            text: '问责刺史',
            hint: '该官好感 -8 · 圣听 +2 · 该地风险 +5',
            effects: [charEffect(actor.id, 'loyalty', -8), res('intelligence', 2), { target: 'regionUnrest', regionId: actor.region, value: 5 }],
            resultText: `${actor.name}被降一级留任。堤上的民夫，少了一半。`,
          },
        ],
      }
    },
  },
  {
    id: 'salt_reform',
    title: '盐政改法',
    source: '户部',
    weight: 7,
    minYear: 3,
    cooldown: 14,
    build(state, rng) {
      const actor = pickOne(rng, alive(state, (item) => item.role === 'minister'))
      if (!actor) return null
      return {
        text: `户部请改盐引：盐商不再纳捐，改为按引抽税。${actor.name}说这是“一劳永逸”，两淮的盐商已经派人进京。`,
        actors: [actorOf(actor)],
        choices: [
          {
            id: 'reform',
            text: '全面改法',
            hint: '国库 +800 · 民心 -3 · 勋贵好感 -5',
            effects: [res('treasury', 800), res('popularity', -3), faction('xungui', 'loyalty', -5)],
            resultText: '新法行于两淮。盐价先涨了三成，国库的银子后到。',
          },
          {
            id: 'pilot',
            text: '先在一地试行',
            hint: '国库 +300 · 圣听 +2 · 该官好感 +3',
            effects: [res('treasury', 300), res('intelligence', 2), charEffect(actor.id, 'loyalty', 3)],
            resultText: '试行的折子递上来，数字比户部预想的少，但没有出乱子。',
          },
          {
            id: 'keep',
            text: '维持旧法',
            hint: '国库 -100 · 勋贵好感 +4',
            effects: [res('treasury', -100), faction('xungui', 'loyalty', 4)],
            resultText: '旧法照旧。两淮的盐商送来一块匾，挂在户部偏厅。',
          },
        ],
      }
    },
  },
  {
    id: 'eunuch_power',
    title: '内侍递折',
    source: '内廷',
    weight: 7,
    minYear: 1,
    cooldown: 10,
    build(state, rng) {
      const actor = pickOne(rng, alive(state, (item) => item.role === 'servant'))
      if (!actor) return null
      return {
        text: `${actor.name}替人递了一封没有署名的折子。折子里说，吏部最近卖了三名知县，银子进了谁的口袋，写得很清楚。`,
        actors: [actorOf(actor)],
        choices: [
          {
            id: 'investigate',
            text: '顺着折子查',
            hint: '圣听 +3 · 威望 -1',
            effects: [res('intelligence', 3), res('prestige', -1), rumorEffect('匿名折子指向吏部卖官，三名知县名字已列出。', '', false)],
            resultText: '折子上的三个名字，两个对得上。第三个，查无此人。',
          },
          {
            id: 'use',
            text: '把折子留下，人赏了',
            hint: '圣听 +1 · 该侍从好感 +8 · 威望 -2',
            effects: [res('intelligence', 1), charEffect(actor.id, 'loyalty', 8), res('prestige', -2)],
            resultText: `${actor.name}收了赏。此后他递折子，不再走通传。`,
          },
          {
            id: 'warn',
            text: '斥其干政',
            hint: '该侍从好感 -6 · 威望 +2',
            effects: [charEffect(actor.id, 'loyalty', -6), res('prestige', 2)],
            resultText: `${actor.name}跪在阶下，折子被当场烧了。`,
          },
        ],
      }
    },
  },
  {
    id: 'auspicious',
    title: '白鹿祥瑞',
    source: '地方',
    weight: 6,
    minYear: 1,
    cooldown: 12,
    build(state, rng) {
      const actor = pickOne(rng, alive(state, (item) => item.postType === 'local' && item.region))
      if (!actor) return null
      return {
        text: `${actor.name}献上一头白鹿，说是境内百姓在山上看见的祥瑞。鹿角上系着红绸，绸子上写着“圣天子在位”。`,
        actors: [actorOf(actor)],
        choices: [
          {
            id: 'celebrate',
            text: '大办，祭天',
            hint: '国库 -300 · 民心 +4 · 该官好感 +5',
            effects: [res('treasury', -300), res('popularity', 4), charEffect(actor.id, 'loyalty', 5)],
            resultText: '祭天礼办了三日。白鹿被养在御苑，不吃草。',
          },
          {
            id: 'reward',
            text: '赏赐，不必声张',
            hint: '国库 -100 · 该官好感 +3',
            effects: [res('treasury', -100), charEffect(actor.id, 'loyalty', 3)],
            resultText: '赏赐送回了地方。白鹿的事，没有进邸报。',
          },
          {
            id: 'reject',
            text: '斥其逢迎',
            hint: '威望 +1 · 该官好感 -5',
            effects: [res('prestige', 1), charEffect(actor.id, 'loyalty', -5)],
            resultText: `${actor.name}把白鹿带了回去。第二年，他没再献祥瑞。`,
          },
        ],
      }
    },
  },
  {
    id: 'epidemic',
    title: '疫病封坊',
    source: '地方',
    weight: 7,
    minYear: 1,
    cooldown: 12,
    build(state, rng) {
      const actor = pickOne(rng, alive(state, (item) => item.postType === 'local' && item.region))
      if (!actor) return null
      return {
        text: `${actor.name}报疫：城中已封三坊，死者名册送上来时，最后一页是空的。`,
        actors: [actorOf(actor)],
        choices: [
          {
            id: 'doctor',
            text: '派太医，开药局',
            hint: '国库 -500 · 民心 +3 · 该地风险 -8',
            effects: [res('treasury', -500), res('popularity', 3), { target: 'regionUnrest', regionId: actor.region, value: -8 }],
            resultText: '太医南下。药局的门口排了三条街，死者名册终于写满了。',
          },
          {
            id: 'lockdown',
            text: '封城，不许进出',
            hint: '民心 -2 · 该地风险 -4',
            effects: [res('popularity', -2), { target: 'regionUnrest', regionId: actor.region, value: -4 }],
            resultText: '城门关了十七天。疫没有出城，城里的米价翻了一倍。',
          },
          {
            id: 'hide',
            text: '压下去，不许报',
            hint: '圣听 -2 · 该地风险 +5 · 该官好感 -5',
            effects: [res('intelligence', -2), { target: 'regionUnrest', regionId: actor.region, value: 5 }, charEffect(actor.id, 'loyalty', -5)],
            resultText: '邸报上没有疫病。邻县开始有人往京城逃。',
          },
        ],
      }
    },
  },
  {
    id: 'envoy_insult',
    title: '使者不解刀',
    source: '鸿胪寺',
    weight: 6,
    minYear: 1,
    cooldown: 12,
    build(state, rng) {
      const actor = pickOne(rng, alive(state, (item) => item.role === 'minister'))
      if (!actor) return null
      return {
        text: `北狄使者在宴上不肯解刀，说这是草原的规矩。${actor.name}按着剑柄，等陛下开口。`,
        actors: [actorOf(actor)],
        choices: [
          {
            id: 'force',
            text: '令其解刀，否则逐出',
            hint: '威望 +3 · 军力 +2 · 国库 -200',
            effects: [res('prestige', 3), res('military', 2), res('treasury', -200)],
            resultText: '使者解了刀，宴席散了。边关的斥候，当夜多了一倍。',
          },
          {
            id: 'endure',
            text: '依草原规矩，不必解刀',
            hint: '威望 -2 · 圣听 +2',
            effects: [res('prestige', -2), res('intelligence', 2)],
            resultText: `使者带刀入席。${actor.name}的手，一直没有离开剑柄。`,
          },
          {
            id: 'feast',
            text: '赐酒，把话头岔开',
            hint: '国库 -300 · 威望 +1 · 圣听 +1',
            effects: [res('treasury', -300), res('prestige', 1), res('intelligence', 1)],
            resultText: '酒过三巡，刀还在腰上。使者走时，说了一句“南朝有好酒”。',
          },
        ],
      }
    },
  },
  {
    id: 'general_title',
    title: '请封国公',
    source: '兵部',
    weight: 6,
    minYear: 3,
    cooldown: 14,
    build(state, rng) {
      const actor = alive(state, (item) => item.role === 'minister' || item.role === 'clan')
        .sort((a, b) => getCharacterStat(b, 'military') - getCharacterStat(a, 'military'))[0]
      if (!actor) return null
      return {
        text: `${actor.name}请封国公，说边军将士看着，不能只让文臣封妻荫子。折子后面附了一份名单，都是他帐下的将校。`,
        actors: [actorOf(actor)],
        choices: [
          {
            id: 'grant',
            text: '准封国公',
            hint: '国库 -300 · 该官好感 +8 · 该官野心 +5',
            effects: [res('treasury', -300), charEffect(actor.id, 'loyalty', 8), charEffect(actor.id, 'ambition', 5)],
            resultText: `${actor.name}受了国公印。名单上的将校，各升一级。`,
          },
          {
            id: 'deny',
            text: '不准，边功未够',
            hint: '该官好感 -8 · 该官野心 +3 · 威望 +2',
            effects: [charEffect(actor.id, 'loyalty', -8), charEffect(actor.id, 'ambition', 3), res('prestige', 2)],
            resultText: `${actor.name}谢恩退下。折子后面的名单，他没有收回。`,
          },
          {
            id: 'promote',
            text: '升官，不给爵',
            hint: '该官好感 +4 · 考成 +3 · 威望 +1',
            effects: [charEffect(actor.id, 'loyalty', 4), charEffect(actor.id, 'performance', 3), res('prestige', 1)],
            resultText: `${actor.name}改授上将。国公的印，留在了库里。`,
          },
        ],
      }
    },
  },
]

EVENT_DEFS.push(...DYNAMIC_EVENTS)

export const ensureEventFields = (state) => {
  if (!state) return state
  if (!Array.isArray(state.scheduledEvents)) state.scheduledEvents = []
  if (!state.eventSeenAt || typeof state.eventSeenAt !== 'object') state.eventSeenAt = {}
  if (!state.eventSettings || typeof state.eventSettings !== 'object') state.eventSettings = {}
  if (!Array.isArray(state.eventSettings.disabled)) state.eventSettings.disabled = []
  return state
}

export const setEventEnabled = (state, eventId, enabled) => {
  if (!state || !eventId) return { success: false, state, message: '事件不存在' }
  const next = JSON.parse(JSON.stringify(state))
  ensureEventFields(next)
  const disabled = new Set(next.eventSettings.disabled)
  if (enabled) disabled.delete(eventId)
  else disabled.add(eventId)
  next.eventSettings.disabled = [...disabled]
  next.updatedAt = Date.now()
  return {
    success: true,
    state: next,
    message: enabled ? '事件已启用' : '事件已停用',
  }
}

const monthIndexOf = (state) => (
  ((Number(state?.calendar?.year) || 1) - 1) * 12 + (Number(state?.calendar?.month) || 1)
)

/**
 * 把事件定义变成一份具体奏折。
 * 动态事件会先调用 build(state, rng, context)，拿到具体人物与文案。
 */
const materializeEvent = (def, state, rng, context = {}) => {
  const built = typeof def.build === 'function' ? def.build(state, rng, context) : null
  if (typeof def.build === 'function' && !built) return null

  const data = built || def
  const choices = Array.isArray(data.choices) ? data.choices : []
  if (choices.length === 0) return null

  return {
    instanceId: `evt_${monthIndexOf(state)}_${def.id}_${Math.floor(rng() * 99999)}`,
    eventId: def.id,
    kind: data.kind || def.kind || 'court',
    title: data.title || def.title,
    source: data.source || def.source,
    text: data.text || def.text || '',
    actors: Array.isArray(data.actors) ? data.actors.filter(Boolean) : [],
    year: state.calendar?.year || 1,
    month: state.calendar?.month || 1,
    resolved: false,
    missed: false,
    choices: choices.map((choice) => ({ ...choice })),
  }
}

/**
 * 抽一个本月事件：优先给很久没出现的事件加权，避免总看那几张熟脸。
 */
export const rollMonthlyEvent = (state, rng, monthIndex) => {
  ensureEventFields(state)
  const recent = new Set(Array.isArray(state.recentEventIds) ? state.recentEventIds : [])
  const disabled = new Set(state.eventSettings?.disabled || [])
  let pool = EVENT_DEFS.filter((def) => {
    if (def.hidden) return false
    if (disabled.has(def.id)) return false
    if (def.minYear && (state.calendar?.year || 1) < def.minYear) return false
    if (def.requires && !def.requires(state)) return false
    if (recent.has(def.id) && def.cooldown > 1) return false
    return true
  })

  // 如果所有事件都在冷却里，就放宽冷却，优先挑最久没出现、且不是上一份的
  if (pool.length === 0) {
    const year = state.calendar?.year || 1
    const lastId = state.recentEventIds?.[state.recentEventIds.length - 1] || ''
    const valid = EVENT_DEFS.filter((def) => (
      !def.hidden
      && !disabled.has(def.id)
      && (!def.minYear || year >= def.minYear)
      && (!def.requires || def.requires(state))
    ))
    const fresh = valid.filter((def) => def.id !== lastId)
    pool = (fresh.length > 0 ? fresh : valid)
      .sort((a, b) => (
        (state.eventSeenAt[a.id] ?? -999) - (state.eventSeenAt[b.id] ?? -999)
      ))
      .slice(0, 4)
  }

  for (let attempt = 0; attempt < 6 && pool.length > 0; attempt += 1) {
    const weighted = pool.map((def) => {
      const seenAt = state.eventSeenAt[def.id]
      const unseenBoost = seenAt == null
        ? 2.2
        : 1 + Math.min(1.6, Math.max(0, monthIndex - seenAt) / 24)
      return { def, weight: (Number(def.weight) || 1) * unseenBoost }
    })
    const total = weighted.reduce((sum, item) => sum + item.weight, 0)
    let ticket = rng() * total
    let picked = weighted[weighted.length - 1].def
    for (const item of weighted) {
      ticket -= item.weight
      if (ticket <= 0) {
        picked = item.def
        break
      }
    }

    const event = materializeEvent(picked, state, rng)
    if (event) {
      state.eventSeenAt[picked.id] = monthIndex
      return event
    }
    pool = pool.filter((def) => def.id !== picked.id)
  }

  const fallback = EVENT_DEFS.find((def) => def.id === 'granary_audit') || EVENT_DEFS[0]
  return materializeEvent(fallback, state, rng) || {
    instanceId: `evt_${monthIndex}_fallback`,
    eventId: 'granary_audit',
    title: '京仓亏空',
    source: '户部',
    text: '京仓盘点点出亏空，户部请陛下示下。',
    actors: [],
    year: state.calendar?.year || 1,
    month: state.calendar?.month || 1,
    resolved: false,
    missed: false,
    choices: [],
  }
}

export const createEventById = (state, eventId, rng, context = {}) => {
  ensureEventFields(state)
  const def = EVENT_DEFS.find((item) => item.id === eventId)
  if (!def) return null
  return materializeEvent(def, state, rng, context)
}

export const getEventDef = (eventId) => EVENT_DEFS.find((item) => item.id === eventId) || null
