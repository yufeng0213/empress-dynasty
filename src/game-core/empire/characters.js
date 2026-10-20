/**
 * 人物生成（本地部分）
 *
 * 只负责属性与身份；姓名之后的背景、外貌、说话风格由 LLM 根据这里的数值补写。
 */

import { clamp, pick, randInt, shuffle } from './random.js'
import { AVATAR_COUNTS, FACTIONS, OFFICE_TITLES, ROLE_DEFS } from './constants.js'

/**
 * 按性别随机一个内置头像编号；没有对应图池时返回 0，UI 用姓氏字兜底。
 */
export const pickAvatarId = (rng, gender) => {
  const count = Number(AVATAR_COUNTS[gender === '男' ? 'male' : 'female']) || 0
  if (count <= 0) return 0
  return randInt(rng, 1, count)
}

// 《百家姓》全表（含复姓），按空格切分
const HUNDRED_SURNAMES_TEXT = `
赵钱孙李 周吴郑王 冯陈褚卫 蒋沈韩杨 朱秦尤许 何吕施张
孔曹严华 金魏陶姜 戚谢邹喻 柏水窦章 云苏潘葛 奚范彭郎
鲁韦昌马 苗凤花方 俞任袁柳 酆鲍史唐 费廉岑薛 雷贺倪汤
滕殷罗毕 郝邬安常 乐于时傅 皮卞齐康 伍余元卜 顾孟平黄
和穆萧尹 姚邵湛汪 祁毛禹狄 米贝明臧 计伏成戴 谈宋茅庞
熊纪舒屈 项祝董梁 杜阮蓝闵 席季麻强 贾路娄危 江童颜郭
梅盛林刁 钟徐邱骆 高夏蔡田 樊胡凌霍 虞万支柯 昝管卢莫
经房裘缪 干解应宗 丁宣贲邓 郁单杭洪 包诸左石 崔吉钮龚
程嵇邢滑 裴陆荣翁 荀羊於惠 甄曲家封 芮羿储靳 汲邴糜松
井段富巫 乌焦巴弓 牧隗山谷 车侯宓蓬 全郗班仰 秋仲伊宫
宁仇栾暴 甘钭厉戎 祖武符刘 景詹束龙 叶幸司韶 郜黎蓟薄
印宿白怀 蒲邰从鄂 索咸籍赖 卓蔺屠蒙 池乔阴郁 胥能苍双
闻莘党翟 谭贡劳逄 姬申扶堵 冉宰郦雍 郤璩桑桂 濮牛寿通
边扈燕冀 郏浦尚农 温别庄晏 柴瞿阎充 慕连茹习 宦艾鱼容
向古易慎 戈廖庾终 暨居衡步 都耿满弘 匡国文寇 广禄阙东
欧殳沃利 蔚越夔隆 师巩厍聂 晁勾敖融 冷訾辛阚 那简饶空
曾毋沙乜 养鞠须丰 巢关蒯相 查后荆红 游竺权逯 盖益桓公
万俟司马 上官欧阳 夏侯诸葛 闻人东方 赫连皇甫 尉迟公羊
澹台公冶 宗政濮阳 淳于单于 太叔申屠 公孙仲孙 轩辕令狐
钟离宇文 长孙慕容 鲜于闾丘 司徒司空 丌官司寇 仉督子车
颛孙端木 巫马公西 漆雕乐正 壤驷公良 拓跋夹谷 宰父谷梁
晋楚闫法 汝鄢涂钦 段干百里 东郭南门 呼延归海 羊舌微生
岳帅缑亢 况后有琴 梁丘左丘 东门西门 商牟佘佴 伯赏南宫
墨哈谯笪 年爱阳佟 第五言福
`

// 《百家姓》原文每四个姓一组、没有分隔，先按单字拆，再补回复姓
const COMPOUND_SURNAME_LIST = [
  '万俟', '司马', '上官', '欧阳', '夏侯', '诸葛', '闻人', '东方',
  '赫连', '皇甫', '尉迟', '公羊', '澹台', '公冶', '宗政', '濮阳',
  '淳于', '单于', '太叔', '申屠', '公孙', '仲孙', '轩辕', '令狐',
  '钟离', '宇文', '长孙', '慕容', '鲜于', '闾丘', '司徒', '司空',
  '丌官', '司寇', '仉督', '子车', '颛孙', '端木', '巫马', '公西',
  '漆雕', '乐正', '壤驷', '公良', '拓跋', '夹谷', '宰父', '谷梁',
  '段干', '百里', '东郭', '南门', '呼延', '归海', '羊舌', '微生',
  '梁丘', '左丘', '东门', '西门', '南宫', '第五',
]

const SINGLE_SURNAMES = HUNDRED_SURNAMES_TEXT.replace(/\s+/g, '').split('').filter(Boolean)

export const SURNAMES = [...new Set([...SINGLE_SURNAMES, ...COMPOUND_SURNAME_LIST])]
export const COMPOUND_SURNAMES = new Set(COMPOUND_SURNAME_LIST)

const MALE_HEADS = [
  '子', '文', '承', '景', '知', '怀', '明', '清', '守', '从',
  '伯', '仲', '叔', '季', '元', '道', '彦', '德', '安', '思',
  '若', '长', '永', '嘉', '世', '国', '家', '天', '云', '星',
  '月', '朝', '廷', '宗', '敬', '慎', '惟', '君', '正', '大',
  '光', '绍', '宏', '博', '雅', '修', '齐', '治', '平',
]

const MALE_TAILS = [
  '之', '远', '山', '川', '舟', '石', '玉', '言', '行', '修',
  '俭', '让', '和', '穆', '简', '度', '常', '亮', '实', '允',
  '固', '夜', '卿', '章', '甫', '衡', '谦', '谨', '诚', '敬',
  '安', '宁', '康', '泰', '平', '达', '观', '澜', '松', '柏',
  '竹', '梅', '兰', '亭', '城', '江', '河', '海', '岳', '峰',
]

const FEMALE_HEADS = [
  '昭', '令', '清', '知', '云', '疏', '青', '玉', '含', '照',
  '流', '望', '拾', '晚', '素', '锦', '听', '月', '星', '容',
  '南', '初', '怀', '静', '采', '扶', '砚', '棠', '漪', '泠',
  '婉', '柔', '嘉', '宁', '安', '思', '若', '映', '雪', '露',
  '秋', '春', '晓', '梦', '语', '书', '画', '琴', '笙', '歌',
]

const FEMALE_TAILS = [
  '宁', '仪', '欢', '微', '栖', '影', '梧', '京', '章', '雪',
  '苏', '舒', '晴', '问', '书', '澜', '白', '沉', '与', '枝',
  '霁', '玉', '姝', '薇', '光', '秋', '月', '云', '香', '容',
]

const MALE_SINGLES = [
  '砚', '峙', '衍', '昀', '棠', '湛', '澈', '珩', '琛', '屿',
  '峻', '崇', '岳', '川', '洲', '舟', '航', '远', '达', '观',
  '谦', '谨', '诚', '敬', '慎', '穆', '简', '俭', '让', '和',
]

const FEMALE_SINGLES = [
  '棠', '漪', '泠', '宁', '仪', '欢', '微', '栖', '梧', '京',
  '雪', '苏', '舒', '晴', '澜', '玉', '姝', '薇', '光', '月',
  '云', '香', '容', '音', '韵', '诗', '词', '曲', '赋', '歌',
]

const buildGivenNames = (heads, tails, singles) => {
  const names = new Set(singles)
  for (const head of heads) {
    for (const tail of tails) {
      if (head === tail) continue
      names.add(`${head}${tail}`)
    }
  }
  return [...names]
}

export const MALE_GIVEN_NAMES = buildGivenNames(MALE_HEADS, MALE_TAILS, MALE_SINGLES)
export const FEMALE_GIVEN_NAMES = buildGivenNames(FEMALE_HEADS, FEMALE_TAILS, FEMALE_SINGLES)

export const NAME_POOL_STATS = {
  surnames: SURNAMES.length,
  maleGiven: MALE_GIVEN_NAMES.length,
  femaleGiven: FEMALE_GIVEN_NAMES.length,
}

const TAGS_BY_ROLE = {
  minister: ['务实', '善谋', '刚直', '圆滑', '清廉', '贪权', '知兵', '通账', '结党', '孤臣'],
  clan: ['守礼', '跋扈', '隐忍', '好名', '奢靡', '端方', '多疑', '重情'],
  consort: ['清冷', '温顺', '善舞', '博学', '骄纵', '敏感', '通透', '善妒', '天真', '寡言'],
  servant: ['谨慎', '机敏', '忠仆', '贪财', '耳聪', '口严', '势利', '念旧'],
}

const ROLE_STAT_RANGES = {
  minister: { loyalty: [42, 88], ambition: [18, 82], health: [55, 92], fertility: [45, 90], age: [26, 56] },
  clan: { loyalty: [38, 82], ambition: [30, 86], health: [50, 90], fertility: [50, 92], age: [20, 58] },
  consort: { loyalty: [48, 92], ambition: [8, 62], health: [58, 96], fertility: [55, 98], age: [16, 30] },
  servant: { loyalty: [55, 96], ambition: [4, 40], health: [50, 90], fertility: [45, 88], age: [18, 48] },
}

export const ABILITY_KEYS = ['civil', 'military', 'strategy', 'charm', 'finance']

export const ABILITY_LABELS = {
  civil: '文治',
  military: '武略',
  strategy: '智谋',
  charm: '魅力',
  finance: '理财',
}

const ABILITY_RANGES = {
  minister: { civil: [55, 95], military: [20, 70], strategy: [40, 90], charm: [35, 80], finance: [45, 95] },
  clan: { civil: [35, 80], military: [30, 85], strategy: [30, 80], charm: [40, 85], finance: [30, 75] },
  consort: { civil: [15, 60], military: [5, 40], strategy: [20, 85], charm: [55, 98], finance: [10, 50] },
  servant: { civil: [25, 65], military: [15, 55], strategy: [45, 90], charm: [25, 70], finance: [35, 80] },
  ruler: { civil: [60, 92], military: [40, 82], strategy: [55, 92], charm: [60, 95], finance: [50, 88] },
  child: { civil: [10, 60], military: [10, 60], strategy: [10, 60], charm: [10, 60], finance: [10, 60] },
}

export const averageAbility = (stats = {}) => {
  const values = ABILITY_KEYS.map((key) => Number(stats[key]) || 0)
  return clamp(Math.round(values.reduce((sum, value) => sum + value, 0) / values.length), 0, 100)
}

/**
 * 开局掷天命：总值 300–360，五项 0–95，无最低值。
 * 先抽主天赋和短板，再按权重分点。
 */
export const rollStartStats = (rng) => {
  const total = randInt(rng, 300, 360)
  const stats = Object.fromEntries(ABILITY_KEYS.map((key) => [key, 0]))
  let remaining = total

  const weights = {}
  for (const key of ABILITY_KEYS) weights[key] = 0.5 + rng() * 1.2

  const dominant = ABILITY_KEYS[randInt(rng, 0, ABILITY_KEYS.length - 1)]
  let weak = ABILITY_KEYS[randInt(rng, 0, ABILITY_KEYS.length - 1)]
  if (weak === dominant) {
    weak = ABILITY_KEYS[(ABILITY_KEYS.indexOf(dominant) + 1) % ABILITY_KEYS.length]
  }
  weights[dominant] += 1.2
  weights[weak] = Math.max(0.2, weights[weak] - 0.45)

  const pickWeighted = (keys) => {
    const sum = keys.reduce((acc, key) => acc + weights[key], 0)
    let ticket = rng() * sum
    for (const key of keys) {
      ticket -= weights[key]
      if (ticket <= 0) return key
    }
    return keys[keys.length - 1]
  }

  while (remaining > 0) {
    const available = ABILITY_KEYS.filter((key) => stats[key] < 95)
    if (available.length === 0) break
    const key = pickWeighted(available)
    const add = Math.min(remaining, randInt(rng, 1, 6), 95 - stats[key])
    stats[key] += add
    remaining -= add
  }

  if (remaining > 0) {
    for (const key of ABILITY_KEYS) {
      const add = Math.min(remaining, 95 - stats[key])
      stats[key] += add
      remaining -= add
      if (remaining <= 0) break
    }
  }

  return {
    total: ABILITY_KEYS.reduce((sum, key) => sum + stats[key], 0),
    stats,
  }
}

export const normalizeAbilityStats = (input = {}) => Object.fromEntries(
  ABILITY_KEYS.map((key) => [key, clamp(Math.round(Number(input?.[key]) || 0), 0, 95)]),
)

export const rollAbilityStats = (rng, roleKey, options = {}) => {
  const ranges = ABILITY_RANGES[roleKey] || ABILITY_RANGES.minister
  const stats = {}

  for (const key of ABILITY_KEYS) {
    if (Array.isArray(options.parentStats)) {
      const parentValues = options.parentStats.map((parent) => getCharacterStat(parent, key))
      const parentAvg = parentValues.reduce((sum, value) => sum + value, 0) / parentValues.length
      stats[key] = clamp(Math.round(parentAvg + randInt(rng, -15, 15)), 5, 100)
    } else {
      const range = ranges[key] || [20, 80]
      stats[key] = randInt(rng, range[0], range[1])
    }
  }

  const floor = Number(options.floor) || 0
  const avg = averageAbility(stats)
  if (floor > avg) {
    const delta = floor - avg
    for (const key of ABILITY_KEYS) {
      stats[key] = clamp(stats[key] + delta, 0, 100)
    }
  }

  return stats
}

const hashId = (id) => {
  let hash = 0
  for (const char of String(id || '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash
}

export const getAbilityStats = (character) => {
  if (!character) {
    return { civil: 50, military: 50, strategy: 50, charm: 50, finance: 50 }
  }
  if (ABILITY_KEYS.every((key) => Number.isFinite(Number(character[key])))) {
    return Object.fromEntries(ABILITY_KEYS.map((key) => [key, clamp(Number(character[key]), 0, 100)]))
  }

  const base = Number(character.ability) || 50
  const offsets = [[8, -6, 6, -4, 2], [-6, 8, -4, 4, -2], [4, -2, 8, -6, 0], [-4, 6, -2, 8, -8]]
  const offset = offsets[hashId(character.id) % offsets.length]
  return Object.fromEntries(ABILITY_KEYS.map((key, index) => [
    key,
    clamp(base + offset[index], 0, 100),
  ]))
}

export const getCharacterStat = (character, key) => getAbilityStats(character)[key] || 0

export const ensureAbilityStats = (state) => {
  if (!state) return state
  const targets = [...(state.characters || [])]
  if (state.ruler) targets.push(state.ruler)
  for (const character of targets) {
    if (!character) continue
    const stats = getAbilityStats(character)
    for (const key of ABILITY_KEYS) character[key] = stats[key]
    character.ability = averageAbility(stats)
  }
  return state
}

export const getSurname = (fullName) => {
  const name = String(fullName || '')
  const two = name.slice(0, 2)
  if (COMPOUND_SURNAMES.has(two)) return two
  return name.slice(0, 1)
}

const pickName = (rng, gender, used) => {
  const givenPool = gender === '女' ? FEMALE_GIVEN_NAMES : MALE_GIVEN_NAMES
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const surname = pick(rng, SURNAMES)
    const given = pick(rng, givenPool)
    const name = `${surname}${given}`
    if (!used.has(name)) {
      used.add(name)
      return name
    }
  }
  const fallback = `${pick(rng, SURNAMES)}${pick(rng, givenPool)}`
  const name = `${fallback}${used.size}`
  used.add(name)
  return name
}

const rollStat = (rng, range) => randInt(rng, range[0], range[1])

const pickTags = (rng, roleKey, count = 2) => {
  const pool = TAGS_BY_ROLE[roleKey] || []
  const result = []
  const used = new Set()
  for (let i = 0; i < count && pool.length > 0; i += 1) {
    let tag = pick(rng, pool)
    let guard = 0
    while (used.has(tag) && guard < 20) {
      tag = pick(rng, pool)
      guard += 1
    }
    if (!used.has(tag)) {
      used.add(tag)
      result.push(tag)
    }
  }
  return result
}

/**
 * 生成班底（属性 + 身份），不含 AI 人设
 *
 * 后宫人数由玩家决定：consortMale / consortFemale 为 0 时不设后宫。
 * @param {Function} rng
 * @param {Object} options
 * @returns {Array}
 */
export const generateCast = (rng, options = {}) => {
  const usedNames = new Set()
  const cast = []
  let counter = 0

  const maleConsorts = Math.max(0, Math.min(12, Number(options.consortMale) || 0))
  const femaleConsorts = Math.max(0, Math.min(12, Number(options.consortFemale) || 0))

  const roleSpecs = ROLE_DEFS.map((def) => {
    if (def.key !== 'consort') return { ...def, genders: null }
    const genders = [
      ...Array.from({ length: maleConsorts }, () => '男'),
      ...Array.from({ length: femaleConsorts }, () => '女'),
    ]
    return { ...def, count: genders.length, genders }
  }).filter((def) => def.count > 0)

  for (const def of roleSpecs) {
    const ranges = ROLE_STAT_RANGES[def.key]
    // 同一批人尽量不重复官职，方便死亡后补缺
    const officePool = shuffle(rng, OFFICE_TITLES[def.key] || [])
    for (let i = 0; i < def.count; i += 1) {
      const gender = def.genders
        ? def.genders[i]
        : (rng() < 0.4 ? '女' : '男')
      const name = pickName(rng, gender, usedNames)
      const factionId = pick(rng, def.factions)
      const abilityStats = rollAbilityStats(rng, def.key)

      counter += 1
      cast.push({
        id: `dyn_${def.key}_${counter}`,
        name,
        gender,
        role: def.key,
        roleLabel: def.label,
        office: officePool[i % officePool.length] || def.label,
        faction: factionId,
        factionName: FACTIONS[factionId]?.name || '',
        age: rollStat(rng, ranges.age),
        loyalty: rollStat(rng, ranges.loyalty),
        ambition: rollStat(rng, ranges.ambition),
        ...abilityStats,
        ability: averageAbility(abilityStats),
        health: rollStat(rng, ranges.health),
        fertility: rollStat(rng, ranges.fertility),
        tags: pickTags(rng, def.key),
        avatarId: pickAvatarId(rng, gender),
        alive: true,
        bio: '',
        bioPending: true,
        childrenIds: [],
        // 官制
        rank: def.key === 'minister' ? randInt(rng, 3, 5)
          : def.key === 'clan' ? randInt(rng, 2, 4)
            : (def.key === 'servant' ? randInt(rng, 5, 7) : 0),
        postType: ['minister', 'clan', 'servant'].includes(def.key) ? 'central' : 'none',
        region: '',
        regionName: '',
        tenureMonths: 0,
        performance: randInt(rng, 45, 80),
        // 隐藏的私下活动：只有圣听足够高或事件败露时才会被玩家看见
        plot: 0,
        cliqueId: '',
        exposed: false,
        rebelTriggered: false,
      })
    }
  }

  return cast
}

/**
 * 开局女帝（玩家角色）
 */
export const generateRuler = (rng, options = {}) => {
  const usedNames = new Set()
  const name = String(options.name || '').trim() || pickName(rng, '女', usedNames)
  const abilityStats = options.abilityStats
    ? normalizeAbilityStats(options.abilityStats)
    : rollAbilityStats(rng, 'ruler')
  return {
    id: 'ruler_1',
    name,
    gender: '女',
    age: 16,
    health: 82,
    lifespan: randInt(rng, 52, 62),
    prestige: 55,
    fertility: randInt(rng, 60, 90),
    ...abilityStats,
    ability: averageAbility(abilityStats),
    tags: pickTags(rng, 'consort', 3),
    alive: true,
  }
}

/**
 * 单独生成一名后端人物（选秀 / 进献）
 */
export const generateConsortCharacter = (rng, options = {}) => {
  const gender = options.gender === '男' ? '男' : '女'
  const used = options.usedNames instanceof Set ? options.usedNames : new Set()
  const name = pickName(rng, gender, used)
  const ranges = ROLE_STAT_RANGES.consort
  const source = options.source || 'selection'
  const patron = options.patron || null

  const loyalty = source === 'gift'
    ? randInt(rng, 28, 58)
    : randInt(rng, 48, 88)
  const abilityStats = rollAbilityStats(rng, 'consort')

  return {
    id: options.id || `dyn_consort_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    gender,
    role: 'consort',
    roleLabel: '后宫',
    office: pick(rng, OFFICE_TITLES.consort) || '贵人',
    faction: patron?.faction || 'hougong',
    factionName: patron?.factionName || FACTIONS.hougong?.name || '后宫',
    age: randInt(rng, 16, 26),
    loyalty,
    ambition: source === 'gift' ? randInt(rng, 35, 75) : randInt(rng, 8, 55),
    ...abilityStats,
    ability: averageAbility(abilityStats),
    health: randInt(rng, 60, 96),
    fertility: randInt(rng, 55, 98),
    tags: pickTags(rng, 'consort'),
    avatarId: pickAvatarId(rng, gender),
    alive: true,
    bio: '',
    bioPending: true,
    childrenIds: [],
    rank: 0,
    postType: 'none',
    region: '',
    regionName: '',
    tenureMonths: 0,
    performance: randInt(rng, 40, 75),
    plot: 0,
    cliqueId: '',
    exposed: false,
    rebelTriggered: false,
    source,
    patronId: patron?.id || '',
    patronName: patron?.name || '',
    patronFaction: patron?.factionName || '',
    patronLoyalty: patron ? randInt(rng, 62, 95) : 0,
  }
}

/**
 * 补缺：生成一名可任某官职的人
 */
export const generateOfficialCharacter = (rng, options = {}) => {
  const role = ['minister', 'clan', 'servant'].includes(options.role) ? options.role : 'minister'
  const ranges = ROLE_STAT_RANGES[role]
  const gender = rng() < 0.4 ? '女' : '男'
  const used = options.usedNames instanceof Set ? options.usedNames : new Set()
  const name = pickName(rng, gender, used)
  const abilityStats = rollAbilityStats(rng, role, { floor: options.abilityFloor })

  return {
    id: options.id || `dyn_appoint_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    gender,
    role,
    roleLabel: role === 'minister' ? '朝臣' : (role === 'clan' ? '宗室' : '侍从'),
    office: options.office || '待补',
    faction: options.faction || 'qingliu',
    factionName: options.factionName || FACTIONS[options.faction]?.name || '',
    age: rollStat(rng, ranges.age),
    loyalty: rollStat(rng, ranges.loyalty),
    ambition: rollStat(rng, ranges.ambition),
    ...abilityStats,
    ability: averageAbility(abilityStats),
    health: rollStat(rng, ranges.health),
    fertility: rollStat(rng, ranges.fertility),
    tags: pickTags(rng, role),
    avatarId: pickAvatarId(rng, gender),
    alive: true,
    bio: '',
    bioPending: true,
    childrenIds: [],
    rank: Number(options.rank) || (role === 'servant' ? 6 : 5),
    postType: options.postType || 'central',
    region: options.region || '',
    regionName: options.regionName || '',
    tenureMonths: 0,
    performance: randInt(rng, 50, 85),
    examCohort: Number(options.examCohort) || 0,
    examMasterId: options.examMasterId || '',
    examMasterName: options.examMasterName || '',
    recommendedById: options.recommendedById || '',
    recommendedByName: options.recommendedByName || '',
    lastRecommendMonth: 0,
    plot: 0,
    cliqueId: '',
    exposed: false,
    rebelTriggered: false,
    source: 'appointment',
    patronId: '',
    patronName: '',
    patronFaction: '',
    patronLoyalty: 0,
    lastWhisperMonth: 0,
  }
}

export const generateChildName = (rng, surname, gender) => {
  const give = pick(rng, gender === '女' ? FEMALE_GIVEN_NAMES : MALE_GIVEN_NAMES)
  const family = getSurname(surname) || pick(rng, SURNAMES)
  return `${family}${give}`
}

export const CHILD_TAGS = ['早慧', '体弱', '沉稳', '跳脱', '敏于人事', '寡言', '好武', '嗜书', '多病', '相貌类母']

export const getRoleLabel = (role) => {
  const def = ROLE_DEFS.find((item) => item.key === role)
  return def?.label || role
}

export const clampStat = (value) => clamp(Math.round(Number(value) || 0), 0, 100)
