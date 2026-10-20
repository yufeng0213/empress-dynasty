<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { kvStorage } from '../storage/kv.js'
import {
  applyBiosToState,
  generateCharacterBios,
  generateEventNarrative,
  generateSceneNarrative,
} from '../game/llm.js'
import { llmConfigApi } from '../game/llmConfig.js'
import CharacterRadar from './CharacterRadar.vue'
import ChatScreen from './ChatScreen.vue'
import CityScreen from './CityScreen.vue'
import PortraitLightbox from './PortraitLightbox.vue'
import PortraitScreen from './PortraitScreen.vue'
import SettingsScreen from './SettingsScreen.vue'
import {
  displayPortraitFor,
  loadPortraitLibrary,
} from '../game/portraitStore.js'
import { portraitUrl } from '../game/portraits.js'
import {
  RESOURCE_KEYS,
  RESOURCE_LABELS,
  advanceMonth,
  advanceStruggle,
  arrangeConsort,
  completeSuccession,
  computeMonthlyIncome,
  createDynastyRun,
  designateHeir,
  formatCalendar,
  getAliveCharacters,
  getHaremProfile,
  getHaremDisposition,
  getPregnancyProgress,
  getReputation,
  getRoleGroups,
  computeHaremTension,
  ensureConspiracyFields,
  ensureIntakeFields,
  ensureMortalityFields,
  ensureAppointmentFields,
  getConsortSourceLabel,
  getDeathSummary,
  getDeathCauseLabel,
  FUNERAL_LEVELS,
  holdFuneral,
  interactCharacter,
  purgeCharacterById,
  resolveEvent,
  SELECTION_COST,
  cancelSelection,
  recruitConsort,
  startSelection,
  APPOINT_COST,
  appointOfficial,
  cancelAppointment,
  startAppointment,
  ensureBureaucracyFields,
  changeRank,
  interactGovernor,
  recommendCandidate,
  transferGovernor,
  startExam,
  EXAM_COST,
  getRankLabel,
  getRegionGovernor,
  computeRegionalTax,
  AVATAR_COUNTS,
  ensureAvatarFields,
  ensureAbilityStats,
  renameCharacter,
  renameDynasty,
  renameEra,
  EVENT_DEFS,
  ensureEventFields,
  setEventEnabled,
  PALACE_ROOMS,
  ensurePalaceFields,
  startPalaceAction,
  resolvePalaceChoice,
  setPalaceMode,
  cancelPalaceEncounter,
  ABILITY_KEYS,
  ABILITY_LABELS,
  averageAbility,
  computeStartResources,
  createRng,
  rollStartStats,
  ensureChildFields,
  interactChild,
  startChildMarriage,
  resolveChildMarriage,
  getChildSiblingRows,
  interactHeirSupporter,
  holdChildWedding,
  resolveChildSecretAffair,
  adoptChildForChild,
  CHILD_WEDDING_LEVELS,
  ensureCityFields,
  ensureChatFields,
  ensureBurdenFields,
  getBurdenSummary,
} from '../game-core/empire/index.js'

const emit = defineEmits(['back'])

const STORAGE_KEY = 'dynasty_runs_v1'
const MAX_RUNS = 5

const view = ref('select')
const runs = ref([])
const activeRun = ref(null)
const busy = ref(false)
const message = ref('')
const selectedRole = ref('minister')
const selectedPersonId = ref('')
const selectedEventId = ref('')
const selectedChoiceResult = ref('')
const showMoreMenu = ref(false)
const selectedPalaceRoomId = ref('garden')
const travelDetail = ref(false)
const palaceResult = ref('')
const chatMode = ref('list')
const chatCharacterId = ref('')
const newEraName = ref('')
const newDynastyName = ref('')
const newConsortMale = ref(4)
const newConsortFemale = ref(4)
const hideStats = ref(false)
const fateStats = ref(null)
const fateTotal = ref(0)
const fateRolling = ref(false)
const fateRolled = ref(false)
const transferFromRegionId = ref('')
const postSummaryView = ref('court')
const showPersonRename = ref(false)
const renamePersonValue = ref('')
const dynastyNameDraft = ref('')
const eraNameDraft = ref('')
const rulerNameDraft = ref('')
const bioStatus = ref({ running: false, done: 0, total: 0, failed: false })
const narratingEventId = ref('')
const personQuery = ref('')
const settingsFrom = ref('select')
const llmInfo = ref({ configured: false, model: '', name: '' })

const endingEvaluation = computed(() => {
  const run = activeRun.value
  if (!run) return ''
  const prestige = Number(run.resources.prestige) || 0
  const popularity = Number(run.resources.popularity) || 0
  if (prestige >= 75 && popularity >= 70) {
    return '史臣曰：帝在位日久，外攘边患，内修文治，仓廪充实，百姓安乐，可谓中兴之主。'
  }
  if (prestige >= 60 && popularity < 45) {
    return '史臣曰：帝威加海内，然赋役繁重，民有菜色。史笔之下，功过参半。'
  }
  if (popularity >= 70 && prestige < 50) {
    return '史臣曰：帝宽仁爱民，而失之柔弱，权柄旁落，终未能收。'
  }
  return '史臣曰：帝承大统，守成而已。宫闱之间，多有可叹。'
})

const RESOURCE_KEYS_LIST = RESOURCE_KEYS
const RESOURCE_LABELS_MAP = RESOURCE_LABELS

const ROLE_TABS = [
  { key: 'minister', label: '朝臣' },
  { key: 'clan', label: '宗室' },
  { key: 'consort', label: '后宫' },
  { key: 'servant', label: '侍从' },
  { key: 'child', label: '子嗣' },
  { key: 'dead', label: '故人' },
]

const FUNERAL_LEVEL_LIST = Object.values(FUNERAL_LEVELS)

const NAV_ITEMS = [
  { key: 'court', label: '朝堂', glyph: '朝' },
  { key: 'memorials', label: '奏折', glyph: '奏' },
  { key: 'chat', label: '召见', glyph: '召' },
  { key: 'palace', label: '出行', glyph: '行' },
  { key: 'more', label: '更多', glyph: '⋯' },
]

const SIDE_PRIMARY = [
  { key: 'court', label: '朝堂', glyph: '朝' },
  { key: 'memorials', label: '奏折', glyph: '奏' },
  { key: 'chat', label: '召见', glyph: '召' },
  { key: 'palace', label: '出行', glyph: '行' },
  { key: 'city', label: '京城', glyph: '京' },
  { key: 'intel', label: '密报', glyph: '密' },
  { key: 'chronicle', label: '纪事', glyph: '纪' },
]

const SIDE_SECONDARY = [
  { key: 'people', label: '人物', glyph: '人' },
  { key: 'harem', label: '后宫', glyph: '后' },
  { key: 'heirs', label: '子嗣', glyph: '嗣' },
  { key: 'treasury', label: '国库', glyph: '库' },
  { key: 'event-pool', label: '事件池', glyph: '事' },
  { key: 'names', label: '名号', glyph: '号' },
  { key: 'portraits', label: '立绘', glyph: '绘' },
  { key: 'settings', label: '设置', glyph: '设' },
]

const MORE_ITEMS = [
  { key: 'people', label: '人物名册', desc: '朝臣 · 宗室 · 后宫 · 子嗣' },
  { key: 'harem', label: '后宫', desc: '侍寝 · 选秀 · 孕事' },
  { key: 'heirs', label: '子嗣', desc: '教养 · 婚配 · 立储' },
  { key: 'city', label: '出宫', desc: '京城坊市与灯市夜行' },
  { key: 'treasury', label: '国库', desc: '税入 · 俸禄 · 军饷' },
  { key: 'intel', label: '密报', desc: '风闻与查实的把柄' },
  { key: 'chronicle', label: '编年史', desc: '逐月记录' },
  { key: 'event-pool', label: '事件池', desc: '停用不想再看到的事件' },
  { key: 'names', label: '王朝名号', desc: '国号 · 年号 · 君主名' },
  { key: 'portraits', label: '立绘库', desc: '导图 · 切图 · 分配大图' },
  { key: 'settings', label: '设置', desc: 'AI 接口 · 多套配置切换' },
]

const VIEW_TITLES = {
  court: '朝堂',
  memorials: '奏折',
  memorial: '批阅',
  people: '人物',
  person: '人物',
  harem: '后宫',
  selection: '选秀',
  exam: '科举',
  regions: '地方',
  appointment: '补缺',
  heirs: '子嗣',
  struggle: '争位',
  succession: '继位',
  palace: '出行',
  city: '京城',
  intel: '密报',
  chronicle: '纪事',
  summary: '月结',
  treasury: '国库',
  'event-pool': '事件池',
  names: '名号',
  portraits: '立绘库',
  chat: '召见',
  settings: '设置',
  select: '女帝 · 王朝',
  fate: '掷天命',
}

/* ===== 基础状态 ===== */

const ruler = computed(() => activeRun.value?.ruler || null)
const calendarText = computed(() => (activeRun.value ? formatCalendar(activeRun.value) : ''))
const income = computed(() => computeMonthlyIncome(activeRun.value || {}))
const actionPoints = computed(() => activeRun.value?.actionPoints || 0)
const maxActionPoints = computed(() => activeRun.value?.maxActionPoints || 2)
const canAct = computed(() => activeRun.value?.status === 'playing' && !busy.value)
const blindMode = computed(() => activeRun.value?.settings?.blindStats === true)
const rumors = computed(() => activeRun.value?.rumors || [])

const roleGroups = computed(() => (activeRun.value ? getRoleGroups(activeRun.value) : []))
const deadCharacters = computed(() => (
  (activeRun.value?.characters || [])
    .filter((item) => item.alive === false)
    .sort((a, b) => (b.deathMonth || 0) - (a.deathMonth || 0))
))
const activeRoleItems = computed(() => {
  const list = selectedRole.value === 'dead'
    ? deadCharacters.value
    : (roleGroups.value.find((item) => item.role === selectedRole.value)?.items || [])
  const query = personQuery.value.trim()
  if (!query) return list
  return list.filter((person) => [
    person.name,
    person.office,
    person.factionName,
    person.roleLabel,
    ...(Array.isArray(person.tags) ? person.tags : []),
  ].filter(Boolean).join(' ').includes(query))
})
const roleCounts = computed(() => {
  const map = { dead: deadCharacters.value.length }
  for (const group of roleGroups.value) map[group.role] = group.items.length
  return map
})

const pendingEvents = computed(() => activeRun.value?.pending || [])
const archiveEvents = computed(() => activeRun.value?.archive || [])
const currentEvent = computed(() => (
  pendingEvents.value.find((item) => item.instanceId === selectedEventId.value) || null
))
const currentPerson = computed(() => (
  activeRun.value?.characters?.find((item) => item.id === selectedPersonId.value) || null
))
const children = computed(() => (
  activeRun.value
    ? getAliveCharacters(activeRun.value, 'child').sort((a, b) => (b.age || 0) - (a.age || 0))
    : []
))
const consorts = computed(() => (
  activeRun.value ? getAliveCharacters(activeRun.value, 'consort') : []
))
const selectionCandidates = computed(() => activeRun.value?.selection?.candidates || [])
const vacancies = computed(() => activeRun.value?.vacancies || [])
const appointment = computed(() => activeRun.value?.appointment || null)
const appointmentCandidates = computed(() => activeRun.value?.appointment?.candidates || [])
const deathSummary = computed(() => (activeRun.value ? getDeathSummary(activeRun.value) : { dead: 0, vacant: 0 }))
const regions = computed(() => activeRun.value?.regions || [])
const examPool = computed(() => activeRun.value?.examPool || [])
const regionalTax = computed(() => (activeRun.value ? computeRegionalTax(activeRun.value) : 0))
const summary = computed(() => activeRun.value?.lastSummary || null)
const palace = computed(() => activeRun.value?.palace || null)
const palaceRooms = computed(() => PALACE_ROOMS)
const palaceRoom = computed(() => (
  PALACE_ROOMS.find((room) => room.id === selectedPalaceRoomId.value) || PALACE_ROOMS[0]
))
const travelRooms = computed(() => {
  const list = (activeRun.value?.characters || []).filter((item) => (
    item.alive !== false && item.role === 'consort'
  ))
  const residents = {
    kunning: list[0] || null,
    changchun: list[1] || null,
    chuxiu: list[2] || null,
  }
  return ['kunning', 'changchun', 'chuxiu', 'garden']
    .map((id) => {
      const room = PALACE_ROOMS.find((item) => item.id === id)
      return room ? { ...room, resident: residents[id] || null } : null
    })
    .filter(Boolean)
})
const palaceRoomResident = computed(() => {
  const roomId = selectedPalaceRoomId.value
  const candidate = travelRooms.value.find((item) => item.id === roomId)?.resident
  return candidate || null
})
const palaceActorCharacter = computed(() => {
  const id = palaceEncounter.value?.actor?.id
  if (!id) return null
  return (activeRun.value?.characters || []).find((item) => item.id === id) || null
})
const palaceEncounter = computed(() => palace.value?.encounter || null)
const palaceMode = computed(() => palace.value?.mode || 'day')
const palaceTension = computed(() => (
  activeRun.value ? computeHaremTension(activeRun.value).tension : 0
))
const fatePerson = computed(() => {
  const stats = fateStats.value || Object.fromEntries(ABILITY_KEYS.map((key) => [key, 0]))
  return {
    ...stats,
    name: '天命',
    ability: averageAbility(stats),
  }
})
const fateResources = computed(() => computeStartResources(fateStats.value || {}))
const fateHigh = computed(() => (
  [...ABILITY_KEYS].sort((a, b) => (fateStats.value?.[b] || 0) - (fateStats.value?.[a] || 0))[0]
))
const fateLow = computed(() => (
  [...ABILITY_KEYS].sort((a, b) => (fateStats.value?.[a] || 0) - (fateStats.value?.[b] || 0))[0]
))
const fateFortune = computed(() => {
  if (!fateStats.value) return '未定'
  if (fateTotal.value >= 350) return '天命所归'
  if (fateTotal.value >= 335) return '上吉'
  if (fateTotal.value >= 320) return '中吉'
  return '平'
})
const childMarriage = computed(() => activeRun.value?.childMarriage || null)
const heirInfluence = computed(() => Number(activeRun.value?.heirFaction?.influence) || 0)
const childSiblingRows = computed(() => (
  activeRun.value && currentPerson.value?.role === 'child'
    ? getChildSiblingRows(activeRun.value, currentPerson.value.id)
    : []
))
const childSpouse = computed(() => {
  const spouseId = currentPerson.value?.spouseId
  if (!spouseId) return null
  return activeRun.value?.characters?.find((item) => item.id === spouseId) || null
})
const heirSupporters = computed(() => activeRun.value?.heirFaction?.supporters || [])
const weddingLevels = CHILD_WEDDING_LEVELS
const childSecretAffair = computed(() => currentPerson.value?.secretAffair || null)
const childPregnancy = computed(() => currentPerson.value?.pregnancy || null)
const courtBurden = computed(() => (
  activeRun.value
    ? getBurdenSummary(activeRun.value)
    : { stress: 0, traits: [], debuffs: [], tyranny: 0, dread: 0 }
))
const visibleEventDefs = computed(() => EVENT_DEFS.filter((item) => !item.hidden))
const disabledEventIds = computed(() => new Set(activeRun.value?.eventSettings?.disabled || []))
const isEventEnabled = (eventId) => !disabledEventIds.value.has(eventId)
const totalPopulation = computed(() => (
  regions.value.reduce((sum, region) => sum + (Number(region.population) || 0), 0)
))
const haremTension = computed(() => (
  activeRun.value ? computeHaremTension(activeRun.value) : { tension: 0, avgDanger: 0, pregnantCount: 0, consorts: [] }
))
const pregnancies = computed(() => {
  if (!activeRun.value) return []
  return (activeRun.value.pregnancies || []).map((item) => ({
    ...item,
    carrier: activeRun.value.characters.find((char) => char.id === item.carrierId) || null,
    progress: getPregnancyProgress(activeRun.value, item),
  }))
})
const succession = computed(() => activeRun.value?.succession || null)
const successionWinner = computed(() => (
  succession.value?.candidates?.find((item) => item.id === succession.value?.winnerId) || null
))
const recentLogs = computed(() => {
  const logs = Array.isArray(activeRun.value?.log) ? activeRun.value.log : []
  return [...logs].reverse()
})
const isGameView = computed(() => Boolean(activeRun.value) && !['select', 'fate', 'settings'].includes(view.value))
const hideChrome = computed(() => ['select', 'fate', 'settings', 'chat', 'city'].includes(view.value))
const showSideNav = computed(() => isGameView.value)
const showTabbar = computed(() => isGameView.value && !['chat', 'city'].includes(view.value))
const showAdvanceButton = computed(() => (
  isGameView.value && !['chat', 'city', 'summary', 'struggle', 'succession', 'memorial'].includes(view.value)
))
const pageTitle = computed(() => {
  if (view.value === 'person') return currentPerson.value?.name || '人物'
  if (view.value === 'memorial' && currentEvent.value) return '批阅 · 奏折'
  return VIEW_TITLES[view.value] || '女帝 · 王朝'
})
const navActive = computed(() => {
  if (view.value === 'court') return 'court'
  if (['memorials', 'memorial'].includes(view.value)) return 'memorials'
  if (view.value === 'chat') return 'chat'
  if (view.value === 'palace') return 'palace'
  if (view.value === 'city') return 'city'
  if (view.value === 'intel') return 'intel'
  if (view.value === 'chronicle') return 'chronicle'
  if (['people', 'person', 'appointment', 'exam', 'regions'].includes(view.value)) return 'people'
  if (['harem', 'selection'].includes(view.value)) return 'harem'
  if (view.value === 'heirs') return 'heirs'
  if (view.value === 'treasury') return 'treasury'
  if (view.value === 'event-pool') return 'event-pool'
  if (view.value === 'names') return 'names'
  if (view.value === 'portraits') return 'portraits'
  if (view.value === 'settings') return 'settings'
  return ''
})
const navOnMore = computed(() => !['court', 'memorials', 'chat', 'palace'].includes(navActive.value))
const memorialBadge = computed(() => pendingEvents.value.length)
const intelBadge = computed(() => rumors.value.length)

const personMetrics = computed(() => {
  const person = currentPerson.value
  if (!person) return []
  const metrics = [
    { key: 'loyalty', label: '忠诚', value: person.loyalty, tone: 'jade' },
    { key: 'ambition', label: '野心', value: person.ambition, tone: 'red' },
    { key: 'ability', label: '能力', value: person.ability, tone: 'violet' },
    { key: 'health', label: '健康', value: person.health, tone: '' },
    { key: 'fertility', label: '生育', value: person.fertility, tone: '' },
  ]
  return blindMode.value
    ? metrics.filter((item) => item.key !== 'loyalty' && item.key !== 'ambition')
    : metrics
})

const HIDDEN_EFFECT_TARGETS = new Set(['character', 'role', 'faction', 'randomRole'])
const displayHint = (choice) => {
  const hint = String(choice?.hint || '')
  if (!blindMode.value) return hint
  const effects = Array.isArray(choice?.effects) ? choice.effects : []
  const hasPersonEffect = effects.some((effect) => HIDDEN_EFFECT_TARGETS.has(effect?.target))
  if (!hasPersonEffect) return hint
  const hasResourceEffect = effects.some((effect) => effect?.target === 'resource')
  return hasResourceEffect ? '国库/民心将有变化，人心难测' : '臣属态度将有变化，结果难料'
}

/* ===== 工具 ===== */

const formatPopulation = (value) => {
  const num = Number(value) || 0
  if (num >= 10000) return `${(num / 10000).toFixed(0)} 万`
  return num.toLocaleString('zh-CN')
}

const formatResource = (key, value) => {
  const num = Number(value) || 0
  if (key === 'treasury') {
    if (Math.abs(num) >= 10000) return `${(num / 10000).toFixed(1)}万`
    return num.toLocaleString('zh-CN')
  }
  return String(num)
}

const barWidth = (key) => {
  if (!activeRun.value) return '0%'
  const value = key === 'treasury'
    ? Math.round((Number(activeRun.value.resources?.treasury) || 0) / 200)
    : Number(activeRun.value.resources?.[key]) || 0
  return `${Math.max(2, Math.min(100, value))}%`
}

const avatarSrc = (person, thumb = false) => {
  if (!person) return ''
  const genderKey = person.gender === '男' ? 'male' : 'female'
  const count = Number(AVATAR_COUNTS[genderKey]) || 0
  const avatarId = Number(person.avatarId) || 0
  if (count <= 0 || avatarId <= 0) return ''
  const index = ((avatarId - 1) % count) + 1
  const file = `${genderKey}_${String(index).padStart(2, '0')}${thumb ? '_thumb' : ''}.webp`
  return `/data/dynasty/avatars/${genderKey}/${file}`
}

// 优先用立绘库分配的大图；没分配时用稳定预览；再退回内置头像，最后显示姓氏首字
const portraitOf = (person, thumb = false) => (
  displayPortraitFor(activeRun.value?.id, person) || avatarSrc(person, thumb)
)

const isPregnant = (consortId) => (
  (activeRun.value?.pregnancies || []).some((item) => item.carrierId === consortId)
)

// 头像文件缺失时退回姓氏首字，避免出现破图
const brokenAvatars = ref([])
const avatarOk = (src) => Boolean(src) && !brokenAvatars.value.includes(src)
const onAvatarError = (src) => {
  if (src && !brokenAvatars.value.includes(src)) {
    brokenAvatars.value = [...brokenAvatars.value, src]
  }
}

const personFallbackBio = (person) => {
  if (!person) return ''
  const tags = Array.isArray(person.tags) ? person.tags.join('、') : ''
  return `${person.office || person.roleLabel || ''}${person.factionName ? `，${person.factionName}` : ''}${tags ? `。${tags}。` : '。'}`
}

const logTypeClass = (type) => ({
  death: 'is-red',
  struggle: 'is-red',
  succession: 'is-gold',
  birth: 'is-jade',
  event: 'is-gold',
  heir: 'is-violet',
  funeral: 'is-gold',
}[type] || '')

const formatMonthIndex = (monthIndex) => {
  const value = Number(monthIndex) || 0
  if (value <= 0) return '—'
  const year = Math.floor((value - 1) / 12) + 1
  const month = ((value - 1) % 12) + 1
  return `${year}年${month}月`
}

const marriageStatusLabel = (status) => ({
  single: '未婚',
  betrothed: '已定亲',
  married: '已成婚',
  refused: '拒婚',
}[status] || '未婚')

const roleClass = (person) => {
  if (person?.role === 'consort') return 'avatar-consort'
  if (person?.role === 'servant') return 'avatar-inner'
  return ''
}

/* ===== 立绘 ===== */

const portraitTargetId = ref('')
const portraitReturnView = ref('people')
const portraitLightbox = ref(null)

const openPortraitManager = (person = null) => {
  portraitLightbox.value = null
  portraitTargetId.value = person?.id || ''
  portraitReturnView.value = view.value || (person ? 'person' : 'people')
  view.value = 'portraits'
  scrollTop()
}

const closePortraitManager = () => {
  const back = portraitReturnView.value || 'people'
  portraitTargetId.value = ''
  view.value = back === 'portraits' ? 'people' : back
  scrollTop()
}

const handlePortraitPicked = () => {
  message.value = '已更换立绘'
  const back = portraitReturnView.value || 'person'
  portraitTargetId.value = ''
  view.value = back === 'portraits' ? 'person' : back
  scrollTop()
}

const openPortraitLightbox = (person) => {
  if (!person) return
  const url = displayPortraitFor(activeRun.value?.id, person)
  if (!url) {
    openPortraitManager(person)
    return
  }
  const run = activeRun.value
  const canAssign = Boolean(
    run && (run.ruler?.id === person.id || run.characters?.some((item) => item.id === person.id)),
  )
  portraitLightbox.value = {
    url,
    name: person.name,
    characterId: person.id,
    canAssign,
    initial: person.name?.slice(0, 1) || '',
    subtitle: [person.office || person.roleLabel, person.age ? `${person.age} 岁` : '']
      .filter(Boolean)
      .join(' · '),
  }
}

const changePortraitFromLightbox = () => {
  const info = portraitLightbox.value
  const run = activeRun.value
  if (!info?.characterId || !run) return
  const person = run.ruler?.id === info.characterId
    ? run.ruler
    : run.characters?.find((item) => item.id === info.characterId)
  portraitLightbox.value = null
  if (person) openPortraitManager(person)
}

const scrollTop = () => {
  if (typeof document === 'undefined') return
  document.querySelector('.dyn-content')?.scrollTo({ top: 0, behavior: 'smooth' })
}

/* ===== AI 配置状态 ===== */

const loadLlmInfo = async () => {
  try {
    const data = await llmConfigApi.load()
    const active = (data.profiles || []).find((item) => item.id === data.activeId) || null
    llmInfo.value = active
      ? { configured: true, model: active.model, name: active.name }
      : { configured: false, model: '', name: '' }
  } catch {
    llmInfo.value = { configured: false, model: '', name: '' }
  }
}

/* ===== 存档 ===== */

const persistRuns = async () => {
  await kvStorage.set(STORAGE_KEY, runs.value.slice(0, MAX_RUNS))
}

const refreshSummary = (state) => {
  if (!state) return
  const index = runs.value.findIndex((item) => item.id === state.id)
  if (index >= 0) runs.value[index] = state
  else runs.value.unshift(state)
  if (runs.value.length > MAX_RUNS) runs.value = runs.value.slice(0, MAX_RUNS)
}

const loadRuns = async () => {
  const stored = await kvStorage.get(STORAGE_KEY)
  runs.value = Array.isArray(stored) ? stored.filter((item) => item?.id) : []
}

const persistActive = async () => {
  if (!activeRun.value) return
  refreshSummary(activeRun.value)
  await persistRuns()
}

/* ===== 人设 ===== */

const startBioGeneration = async () => {
  const run = activeRun.value
  if (!run) return
  const pending = run.characters.filter((item) => item.bioPending || !item.bio)
  if (pending.length === 0) return

  bioStatus.value = { running: true, done: 0, total: pending.length, failed: false }
  const result = await generateCharacterBios(run, (done, total) => {
    bioStatus.value = { running: true, done, total, failed: false }
  })

  if (result.success) {
    const latest = activeRun.value
    if (latest) {
      activeRun.value = applyBiosToState(latest, result.profiles)
      await persistActive()
    }
    bioStatus.value = { ...bioStatus.value, running: false }
  } else {
    const latest = activeRun.value
    if (latest) {
      const fallbackProfiles = {}
      for (const character of latest.characters) {
        if (character.bioPending || !character.bio) {
          fallbackProfiles[character.id] = {
            bio: personFallbackBio(character),
            appearance: '',
            speechStyle: '',
          }
        }
      }
      activeRun.value = applyBiosToState(latest, fallbackProfiles)
      await persistActive()
    }
    bioStatus.value = { ...bioStatus.value, running: false, failed: true }
    if (result.error && !/配置|AI 接口|API Key/i.test(result.error)) {
      message.value = `AI 人设生成失败：${result.error}`
    }
  }
}

/* ===== 事件长文本 ===== */

const narratePendingEvent = async (targetEvent = null) => {
  const run = activeRun.value
  const event = targetEvent || run?.pending?.find((item) => !item.narrated && item.kind !== 'harem')
  if (!run || !event) return
  if (narratingEventId.value) return

  narratingEventId.value = event.instanceId
  try {
    const generate = event.kind === 'scene' ? generateSceneNarrative : generateEventNarrative
    const result = await generate({ state: run, event })
    if (result.success) {
      const latest = activeRun.value
      if (latest && latest.id === run.id) {
        const next = JSON.parse(JSON.stringify(latest))
        const target = next.pending.find((item) => item.instanceId === event.instanceId)
        if (target) {
          target.text = result.text
          target.narrated = true
        }
        activeRun.value = next
        await persistActive()
      }
    } else if (result.error && !/配置|AI 接口|API Key/i.test(result.error)) {
      message.value = `史官拟稿失败：${result.error}`
    }
  } finally {
    narratingEventId.value = ''
  }
}

/* ===== 开局与推进 ===== */

const stepConsort = (side, delta) => {
  if (side === 'male') {
    newConsortMale.value = Math.max(0, Math.min(12, Number(newConsortMale.value) + delta))
  } else {
    newConsortFemale.value = Math.max(0, Math.min(12, Number(newConsortFemale.value) + delta))
  }
}

const openFate = () => {
  fateStats.value = null
  fateTotal.value = 0
  fateRolled.value = false
  fateRolling.value = false
  message.value = ''
  view.value = 'fate'
  scrollTop()
}

const handleRollFate = () => {
  if (fateRolling.value || busy.value) return
  fateRolling.value = true
  message.value = ''
  window.setTimeout(() => {
    const result = rollStartStats(createRng(Date.now() + Math.floor(Math.random() * 99999)))
    fateStats.value = result.stats
    fateTotal.value = result.total
    fateRolled.value = true
    fateRolling.value = false
  }, 420)
}

const handleConfirmFate = async () => {
  if (!fateStats.value) {
    message.value = '先掷天命，再开局'
    return
  }
  await handleCreate(fateStats.value)
}

const handleCreate = async (rulerStats = null) => {
  if (busy.value) return
  busy.value = true
  message.value = ''
  try {
    const state = createDynastyRun({
      seed: Date.now(),
      consortMale: newConsortMale.value,
      consortFemale: newConsortFemale.value,
      blindStats: hideStats.value,
      rulerStats,
    })
    activeRun.value = state
    refreshSummary(state)
    await persistRuns()
    newDynastyName.value = state.dynastyName
    newEraName.value = ''
    view.value = 'court'
    scrollTop()
    void startBioGeneration()
    void narratePendingEvent()
  } catch (error) {
    message.value = `开朝失败：${error?.message || error}`
  } finally {
    busy.value = false
  }
}

const handleContinue = async (id) => {
  const state = runs.value.find((item) => item.id === id)
  if (!state) {
    message.value = '这条王朝记录已丢失'
    return
  }
  ensureConspiracyFields(state)
  ensureIntakeFields(state)
  ensureMortalityFields(state)
  ensureAppointmentFields(state)
  ensureBureaucracyFields(state, { generate: true })
  ensureAvatarFields(state)
  ensureAbilityStats(state)
  ensureEventFields(state)
  ensurePalaceFields(state)
  ensureChildFields(state)
  ensureCityFields(state)
  ensureChatFields(state)
  ensureBurdenFields(state)
  activeRun.value = state
  newDynastyName.value = state.dynastyName
  newEraName.value = state.eraName
  view.value = state.status === 'succession'
    ? (state.succession?.mode === 'struggle' ? 'struggle' : 'succession')
    : 'court'
  scrollTop()
  if (state.characters.some((item) => item.bioPending)) {
    void startBioGeneration()
  }
  if (state.status === 'playing' && state.pending?.some((item) => !item.narrated)) {
    void narratePendingEvent()
  }
}

const handleAdvance = async () => {
  if (!canAct.value) return
  busy.value = true
  message.value = ''
  try {
    let next = advanceMonth(activeRun.value)
    let nextView = 'court'
    if (next.status === 'succession') {
      if (next.succession?.mode === 'heir') {
        next = advanceStruggle(next)
        nextView = 'succession'
      } else {
        nextView = 'struggle'
      }
      newDynastyName.value = next.dynastyName
      newEraName.value = ''
    }
    activeRun.value = next
    await persistActive()
    if (next.lastSummary) {
      postSummaryView.value = nextView
      view.value = 'summary'
    } else {
      view.value = nextView
    }
    scrollTop()
    if (next.status === 'playing') {
      void narratePendingEvent()
    }
  } catch (error) {
    message.value = `推进失败：${error?.message || error}`
  } finally {
    busy.value = false
  }
}

/* ===== 奏折 ===== */

const openEvent = (event) => {
  selectedEventId.value = event.instanceId
  selectedChoiceResult.value = ''
  view.value = 'memorial'
  scrollTop()
  if (event.kind === 'scene' && !event.narrated) {
    void narratePendingEvent(event)
  }
}

const chooseEventOption = async (choice) => {
  const result = resolveEvent(activeRun.value, selectedEventId.value, choice.id)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  selectedChoiceResult.value = choice.resultText || choice.hint || '已批红。'
  await persistActive()
  if (activeRun.value.characters.some((item) => item.bioPending)) {
    void startBioGeneration()
  }
}

/* ===== 人物 ===== */

const openPerson = (person) => {
  selectedPersonId.value = person.id
  showPersonRename.value = false
  view.value = 'person'
  scrollTop()
}

const openPersonById = (id) => {
  const person = activeRun.value?.characters?.find((item) => item.id === id)
  if (person) openPerson(person)
}

const handleInteract = async (action) => {
  if (!currentPerson.value) return
  const result = interactCharacter(activeRun.value, currentPerson.value.id, action)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  message.value = result.message
  await persistActive()
}

/* ===== 后宫与子嗣 ===== */

const handleStartSelection = async () => {
  if (!activeRun.value) return
  if (selectionCandidates.value.length > 0) {
    view.value = 'selection'
    return
  }
  const result = startSelection(activeRun.value)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  await persistActive()
  view.value = 'selection'
  message.value = result.message
}

const handleRecruitConsort = async (candidate) => {
  const result = recruitConsort(activeRun.value, candidate.id)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  message.value = result.message
  await persistActive()
  view.value = 'harem'
  if (activeRun.value.characters.some((item) => item.bioPending)) {
    void startBioGeneration()
  }
}

const handleStartAppointment = async (index) => {
  const result = startAppointment(activeRun.value, index)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  await persistActive()
  message.value = result.message
}

const handleAppoint = async (candidate) => {
  const result = appointOfficial(activeRun.value, candidate.id)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  message.value = result.message
  await persistActive()
  view.value = 'people'
  if (activeRun.value.characters.some((item) => item.bioPending)) {
    void startBioGeneration()
  }
}

const handleFuneral = async (levelId) => {
  if (!currentPerson.value) return
  const result = holdFuneral(activeRun.value, currentPerson.value.id, levelId)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  message.value = result.message
  await persistActive()
}

const handleStartExam = async () => {
  const result = startExam(activeRun.value)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  message.value = result.message
  await persistActive()
}

const handleChangeRank = async (direction) => {
  if (!currentPerson.value) return
  const result = changeRank(activeRun.value, currentPerson.value.id, direction)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  message.value = result.message
  await persistActive()
}

const handleGovernorAction = async (region, action) => {
  const result = interactGovernor(activeRun.value, region.id, action)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  message.value = result.message
  await persistActive()
}

const handleTransfer = async (toRegion) => {
  if (!transferFromRegionId.value) return
  const result = transferGovernor(activeRun.value, transferFromRegionId.value, toRegion.id)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  message.value = result.message
  transferFromRegionId.value = ''
  await persistActive()
}

const handleRecommend = async () => {
  if (!currentPerson.value) return
  const result = recommendCandidate(activeRun.value, currentPerson.value.id)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  message.value = result.message
  await persistActive()
}

const handleCancelAppointment = async () => {
  const result = cancelAppointment(activeRun.value)
  activeRun.value = result.state
  await persistActive()
}

const handleCancelSelection = async () => {
  const result = cancelSelection(activeRun.value)
  activeRun.value = result.state
  await persistActive()
  view.value = 'harem'
}

const handleArrange = async (consort) => {
  const result = arrangeConsort(activeRun.value, consort.id)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  message.value = result.message
  await persistActive()
}

const toggleBlindStats = async () => {
  if (!activeRun.value) return
  const next = JSON.parse(JSON.stringify(activeRun.value))
  next.settings = next.settings || {}
  next.settings.blindStats = !next.settings.blindStats
  activeRun.value = next
  showMoreMenu.value = false
  await persistActive()
}

const handlePurge = async () => {
  if (!currentPerson.value) return
  const result = purgeCharacterById(activeRun.value, currentPerson.value.id)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  message.value = result.message
  await persistActive()
  view.value = 'people'
}

const handleDesignate = async (child) => {
  const result = designateHeir(activeRun.value, child.id)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  message.value = result.message
  await persistActive()
}

const handleChildAction = async (action) => {
  if (!currentPerson.value) return
  const result = interactChild(activeRun.value, currentPerson.value.id, action)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  message.value = result.message
  await persistActive()
}

const handleChildMarriageStart = async () => {
  if (!currentPerson.value) return
  const result = startChildMarriage(activeRun.value, currentPerson.value.id)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  message.value = result.message
  await persistActive()
}

const handleChildMarriageChoice = async (candidateId, action) => {
  const result = resolveChildMarriage(activeRun.value, candidateId, action)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  message.value = result.message
  await persistActive()
  if (action === 'approve' && activeRun.value.characters.some((item) => item.bioPending)) {
    void startBioGeneration()
  }
}

const handleHeirSupporter = async (supporterId, action) => {
  const result = interactHeirSupporter(activeRun.value, supporterId, action)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  message.value = result.message
  await persistActive()
}

const handleChildWedding = async (scale) => {
  if (!currentPerson.value) return
  const result = holdChildWedding(activeRun.value, currentPerson.value.id, scale)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  message.value = result.message
  await persistActive()
  const weddingScene = activeRun.value.pending?.find((item) => item.sceneType === 'wedding')
  if (weddingScene) openEvent(weddingScene)
}

const handleChildSecret = async (action) => {
  if (!currentPerson.value) return
  const result = resolveChildSecretAffair(activeRun.value, currentPerson.value.id, action)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  message.value = result.message
  await persistActive()
  if (activeRun.value.characters.some((item) => item.bioPending)) {
    void startBioGeneration()
  }
}

const handleAdoptChild = async () => {
  if (!currentPerson.value) return
  const result = adoptChildForChild(activeRun.value, currentPerson.value.id)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  message.value = result.message
  await persistActive()
  if (activeRun.value.characters.some((item) => item.bioPending)) {
    void startBioGeneration()
  }
}

/* ===== 争位与继位 ===== */

const handleStruggleRound = async () => {
  if (!succession.value) return
  const next = advanceStruggle(activeRun.value)
  activeRun.value = next
  await persistActive()
  if (next.succession?.winnerId) {
    newDynastyName.value = next.dynastyName
    newEraName.value = ''
  }
}

const handleConfirmSuccession = async () => {
  const result = completeSuccession(activeRun.value, {
    eraName: newEraName.value,
    dynastyName: newDynastyName.value,
  })
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  message.value = result.message
  await persistActive()
  view.value = 'court'
  scrollTop()
}

/* ===== 导航 ===== */

const handleToggleEvent = async (def) => {
  if (!activeRun.value) return
  const result = setEventEnabled(activeRun.value, def.id, !isEventEnabled(def.id))
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  message.value = `${def.title}：${result.message}`
  await persistActive()
}

const openPalace = () => {
  palaceResult.value = ''
  message.value = ''
  selectedPalaceRoomId.value = 'garden'
  travelDetail.value = false
  showMoreMenu.value = false
  view.value = 'palace'
  scrollTop()
}

const openChat = (mode = 'list', characterId = '') => {
  chatMode.value = mode
  chatCharacterId.value = characterId
  message.value = ''
  showMoreMenu.value = false
  view.value = 'chat'
}

const openCity = () => {
  message.value = ''
  showMoreMenu.value = false
  view.value = 'city'
}

const handleCityUpdate = async (next) => {
  activeRun.value = next
  await persistActive()
}

const handleChatUpdate = async (next) => {
  activeRun.value = next
  await persistActive()
}

const handlePalaceRoom = (room) => {
  selectedPalaceRoomId.value = room.id
  travelDetail.value = true
  palaceResult.value = ''
  message.value = ''
}

const closeTravelDetail = () => {
  travelDetail.value = false
  palaceResult.value = ''
  message.value = ''
}

const handlePalaceMode = async (mode) => {
  if (!activeRun.value) return
  const result = setPalaceMode(activeRun.value, mode)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  message.value = result.message
  await persistActive()
}

const handlePalaceAction = async (action) => {
  if (!activeRun.value) return
  const result = startPalaceAction(activeRun.value, selectedPalaceRoomId.value, action.id)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  message.value = result.message
  palaceResult.value = ''
  await persistActive()
}

const handlePalaceChoice = async (choice) => {
  if (!activeRun.value) return
  const result = resolvePalaceChoice(activeRun.value, choice.id)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  message.value = ''
  palaceResult.value = result.resultText || ''
  await persistActive()
}

const handlePalaceCancel = async () => {
  if (!activeRun.value) return
  const result = cancelPalaceEncounter(activeRun.value)
  activeRun.value = result.state
  message.value = ''
  palaceResult.value = ''
  await persistActive()
}

const handleSummaryContinue = () => {
  view.value = postSummaryView.value || 'court'
  message.value = ''
  scrollTop()
}

const openPersonRename = () => {
  if (!currentPerson.value) return
  renamePersonValue.value = currentPerson.value.name
  showPersonRename.value = true
  message.value = ''
}

const handleRenamePerson = async () => {
  if (!currentPerson.value) return
  const result = renameCharacter(activeRun.value, currentPerson.value.id, renamePersonValue.value)
  if (!result.success) {
    message.value = result.message
    return
  }
  activeRun.value = result.state
  message.value = result.message
  showPersonRename.value = false
  await persistActive()
}

const openNames = () => {
  if (!activeRun.value) return
  dynastyNameDraft.value = activeRun.value.dynastyName
  eraNameDraft.value = activeRun.value.eraName
  rulerNameDraft.value = activeRun.value.ruler?.name || ''
  showMoreMenu.value = false
  view.value = 'names'
  message.value = ''
  scrollTop()
}

const handleSaveNames = async () => {
  if (!activeRun.value) return
  let next = activeRun.value
  const messages = []

  let result = renameDynasty(next, dynastyNameDraft.value)
  if (!result.success) {
    message.value = result.message
    return
  }
  next = result.state
  messages.push(result.message)

  result = renameEra(next, eraNameDraft.value)
  if (!result.success) {
    message.value = result.message
    return
  }
  next = result.state
  messages.push(result.message)

  result = renameCharacter(next, next.ruler?.id, rulerNameDraft.value)
  if (!result.success) {
    message.value = result.message
    return
  }
  next = result.state
  messages.push(result.message)

  activeRun.value = next
  dynastyNameDraft.value = next.dynastyName
  eraNameDraft.value = next.eraName
  rulerNameDraft.value = next.ruler?.name || ''
  message.value = messages.join('；')
  await persistActive()
}

const openSettings = () => {
  settingsFrom.value = ['chat', 'city'].includes(view.value) ? 'court' : view.value
  showMoreMenu.value = false
  view.value = 'settings'
}

const closeSettings = () => {
  const target = settingsFrom.value
  view.value = (target && target !== 'settings') ? target : (activeRun.value ? 'court' : 'select')
  message.value = ''
  scrollTop()
}

const go = (target) => {
  if (target === 'palace') travelDetail.value = false
  if (target === 'people') personQuery.value = ''
  view.value = target
  showMoreMenu.value = false
  message.value = ''
  selectedChoiceResult.value = ''
  transferFromRegionId.value = ''
  showPersonRename.value = false
  scrollTop()
}

const handleNav = (key) => {
  if (key === 'more') {
    showMoreMenu.value = true
    return
  }
  if (key === 'chat') {
    openChat('list')
    return
  }
  if (key === 'city') {
    openCity()
    return
  }
  if (key === 'settings') {
    openSettings()
    return
  }
  go(key)
}

const handleBack = () => {
  if (view.value === 'select') {
    emit('back')
    return
  }
  if (view.value === 'settings') return closeSettings()
  if (view.value === 'summary') return handleSummaryContinue()
  if (view.value === 'fate') {
    view.value = 'select'
    message.value = ''
    return
  }
  if (view.value === 'chat') return go('court')
  if (view.value === 'city') return go('court')
  if (view.value === 'names') return go('court')
  if (view.value === 'event-pool') return go('court')
  if (view.value === 'palace') return go('court')
  if (view.value === 'memorial') return go('memorials')
  if (view.value === 'person') return go('people')
  if (view.value === 'selection') return go('harem')
  if (view.value === 'appointment') return go('people')
  if (view.value === 'exam') return go('people')
  if (view.value === 'regions') return go('people')
  if (view.value === 'portraits') return closePortraitManager()
  if (activeRun.value?.status === 'succession') {
    view.value = succession.value?.winnerId ? 'succession' : 'struggle'
    showMoreMenu.value = false
    return
  }
  return go('court')
}

const backToSelect = async () => {
  await persistActive()
  view.value = 'select'
  activeRun.value = null
  showMoreMenu.value = false
  message.value = ''
}

let messageTimer = 0
watch(message, (value) => {
  window.clearTimeout(messageTimer)
  if (!value) return
  messageTimer = window.setTimeout(() => {
    message.value = ''
  }, 6000)
})

onMounted(() => {
  void loadRuns()
  void loadLlmInfo()
  void loadPortraitLibrary()
})

onBeforeUnmount(() => {
  window.clearTimeout(messageTimer)
})
</script>

<template>
  <div class="shell">
    <!-- ===== 侧栏（桌面） ===== -->
    <aside v-if="showSideNav" class="sidebar">
      <div class="brand">
        <div class="brand-seal">帝</div>
        <div class="brand-main">
          <b>{{ activeRun.dynastyName }}</b>
          <span>{{ activeRun.eraName }} · 第 {{ activeRun.generation }} 代</span>
        </div>
      </div>

      <nav class="side-nav">
        <button
          v-for="item in SIDE_PRIMARY"
          :key="item.key"
          type="button"
          class="side-item"
          :class="{ 'is-active': navActive === item.key }"
          @click="handleNav(item.key)"
        >
          <span class="side-glyph">{{ item.glyph }}</span>
          <span class="side-label">{{ item.label }}</span>
          <em v-if="item.key === 'memorials' && memorialBadge">{{ memorialBadge }}</em>
          <em v-else-if="item.key === 'intel' && intelBadge">{{ intelBadge }}</em>
        </button>

        <div class="side-sep">案卷</div>

        <button
          v-for="item in SIDE_SECONDARY"
          :key="item.key"
          type="button"
          class="side-item is-sub"
          :class="{ 'is-active': navActive === item.key }"
          @click="handleNav(item.key)"
        >
          <span class="side-glyph">{{ item.glyph }}</span>
          <span class="side-label">{{ item.label }}</span>
        </button>
      </nav>

      <div class="side-foot">
        <div class="side-date">{{ calendarText }}</div>
        <button type="button" class="btn btn-primary btn-block" :disabled="!canAct" @click="handleAdvance">
          {{ busy ? '结算中…' : '过 一 月' }}
        </button>
        <div class="side-ap">
          行动点 <b>{{ actionPoints }}</b> / {{ maxActionPoints }}
          <span class="side-ai" :class="{ 'is-off': !llmInfo.configured }">
            AI {{ llmInfo.configured ? '已接' : '未配置' }}
          </span>
        </div>
      </div>
    </aside>

    <div class="main">
      <!-- ===== 顶栏 ===== -->
      <header v-if="!hideChrome" class="topbar">
        <button v-if="view !== 'court'" type="button" class="icon-btn" aria-label="返回" @click="handleBack">‹</button>
        <div class="topbar-title">
          <b>{{ pageTitle }}</b>
          <span v-if="isGameView">{{ calendarText }}</span>
        </div>
        <button
          type="button"
          class="ai-pill"
          :class="{ 'is-off': !llmInfo.configured }"
          @click="openSettings"
        >
          <i></i>
          <span>{{ llmInfo.configured ? (llmInfo.name || llmInfo.model) : 'AI 未配置' }}</span>
        </button>
        <button
          v-if="showAdvanceButton"
          type="button"
          class="icon-btn advance"
          :disabled="!canAct"
          aria-label="过一月"
          @click="handleAdvance"
        >过月</button>
      </header>

      <main class="dyn-content" :class="{ 'is-full': ['chat', 'city', 'settings'].includes(view) }">
        <!-- ===== 王朝选择 ===== -->
        <div v-if="view === 'select'" class="page start">
          <section class="hero">
            <div class="hero-seal">帝</div>
            <button type="button" class="hero-settings" @click="openSettings">
              <i class="ai-dot" :class="{ 'is-off': !llmInfo.configured }"></i>
              AI 设置
            </button>
            <p class="eyebrow">多代宫廷经营</p>
            <h1>女帝 · 王朝</h1>
            <p class="hero-lead">
              一月一回合。经营朝政、纳宠、生育、立储。<br />
              你死后，由继承人接着走下去。
            </p>
            <div class="chips hero-tags">
              <span class="chip">朝政</span>
              <span class="chip">后宫</span>
              <span class="chip">子嗣</span>
              <span class="chip">继承</span>
            </div>
          </section>

          <div class="start-grid" :class="{ 'has-saves': runs.length > 0 }">
            <section class="card start-card">
              <div class="section"><span>开局设置</span></div>

              <div class="stepper-row">
                <div class="stepper">
                  <div class="stepper-label">
                    <b>男宠</b>
                    <small>开局侍宠</small>
                  </div>
                  <div class="stepper-ctrl">
                    <button type="button" :disabled="newConsortMale <= 0" @click="stepConsort('male', -1)">−</button>
                    <strong>{{ newConsortMale }}</strong>
                    <button type="button" :disabled="newConsortMale >= 12" @click="stepConsort('male', 1)">＋</button>
                  </div>
                </div>
                <div class="stepper">
                  <div class="stepper-label">
                    <b>女宠</b>
                    <small>开局侍宠</small>
                  </div>
                  <div class="stepper-ctrl">
                    <button type="button" :disabled="newConsortFemale <= 0" @click="stepConsort('female', -1)">−</button>
                    <strong>{{ newConsortFemale }}</strong>
                    <button type="button" :disabled="newConsortFemale >= 12" @click="stepConsort('female', 1)">＋</button>
                  </div>
                </div>
              </div>
              <p class="note">0 表示不设后宫。子嗣只会由受孕与分娩产生。</p>

              <button type="button" class="toggle-row" @click="hideStats = !hideStats">
                <span class="toggle-main">
                  <b>隐藏臣属忠诚与野心</b>
                  <small>挑战模式。只能靠风评、密报和事件判断人心。</small>
                </span>
                <span class="switch" :class="{ 'is-on': hideStats }"></span>
              </button>

              <button type="button" class="btn btn-primary btn-block start-cta" :disabled="busy" @click="openFate">
                开新朝 · 掷天命
              </button>
            </section>

            <section class="card start-card is-saves">
              <div class="section">
                <span>已有王朝</span>
                <span class="section-note">{{ runs.length }} 卷</span>
              </div>
              <p v-if="runs.length === 0" class="empty empty-sm">还没有王朝记录。开一局新的。</p>
              <div v-else class="save-list">
                <button
                  v-for="run in runs"
                  :key="run.id"
                  type="button"
                  class="save-item"
                  @click="handleContinue(run.id)"
                >
                  <span class="save-mark">{{ (run.dynastyName || '王').slice(0, 1) }}</span>
                  <span class="save-main">
                    <b>{{ run.dynastyName }} · {{ run.eraName }}</b>
                    <small>
                      第 {{ run.generation || 1 }} 代 · {{ run.eraName }}{{ run.calendar?.year || 1 }}年{{ run.calendar?.month || 1 }}月
                    </small>
                    <small>{{ run.ruler?.name || '—' }} · {{ run.ruler?.age || '—' }} 岁</small>
                  </span>
                  <span class="save-side">
                    <em v-if="run.status === 'succession'">待继位</em>
                    <i>继续 ›</i>
                  </span>
                </button>
              </div>
              <p v-if="runs.length > 0" class="note save-note">
                最多保存 5 卷。存档存在服务器上，换设备或清缓存都不会丢。
              </p>
            </section>
          </div>

          <button type="button" class="card ai-strip" @click="openSettings">
            <span class="ai-dot" :class="{ 'is-off': !llmInfo.configured }"></span>
            <span class="ai-strip-main">
              <b>{{ llmInfo.configured ? `AI 叙事：${llmInfo.name || llmInfo.model}` : 'AI 叙事未配置' }}</b>
              <small>
                {{ llmInfo.configured
                  ? `当前模型 ${llmInfo.model} · 可保存多套接口并随时切换`
                  : '配置后可让模型撰写人设、奏报与对白；不配置也能玩' }}
              </small>
            </span>
            <span class="ai-strip-go">配置 ›</span>
          </button>
        </div>

        <!-- ===== 掷天命 ===== -->
        <div v-else-if="view === 'fate'" class="page fate">
          <header class="page-head">
            <div>
              <button type="button" class="link-btn fate-back-top" @click="view = 'select'">‹ 返回开局设置</button>
              <p class="eyebrow">开新朝</p>
              <h1>掷天命</h1>
              <p class="page-sub">总值随机，五维偏科；确认后不能改点。</p>
            </div>
            <div class="fate-total">
              <span>天命总值</span>
              <b>{{ fateStats ? fateTotal : '—' }}</b>
              <em>{{ fateFortune }}</em>
            </div>
          </header>

          <div class="fate-grid">
            <section class="card fate-panel">
              <div class="section"><span>五维天命</span></div>
              <div class="fate-bars">
                <div v-for="key in ABILITY_KEYS" :key="key" class="fate-row">
                  <span>{{ ABILITY_LABELS[key] }}</span>
                  <div class="bar"><i :style="{ width: `${fateStats ? fateStats[key] : 0}%` }"></i></div>
                  <b>{{ fateStats ? fateStats[key] : '—' }}</b>
                </div>
              </div>
              <CharacterRadar :person="fatePerson" :size="220" />
              <p v-if="fateStats" class="note">
                主天赋 {{ ABILITY_LABELS[fateHigh] }} · 短板 {{ ABILITY_LABELS[fateLow] }}
              </p>
            </section>

            <section class="card fate-side">
              <button
                type="button"
                class="fate-dice"
                :class="{ 'is-rolling': fateRolling, 'is-set': fateStats }"
                :disabled="fateRolling || busy"
                @click="handleRollFate"
              >
                <span>{{ fateRolling ? '…' : (fateStats ? '定' : '命') }}</span>
                <em>{{ fateStats ? '可重掷' : '点击掷天命' }}</em>
              </button>

              <div class="section"><span>开局资源预览</span></div>
              <div class="res-preview">
                <div><span>国库</span><b>{{ fateStats ? `${fateResources.treasury} 贯` : '—' }}</b></div>
                <div><span>威望</span><b>{{ fateStats ? fateResources.prestige : '—' }}</b></div>
                <div><span>民心</span><b>{{ fateStats ? fateResources.popularity : '—' }}</b></div>
                <div><span>军力</span><b>{{ fateStats ? fateResources.military : '—' }}</b></div>
                <div><span>圣听</span><b>{{ fateStats ? fateResources.intelligence : '—' }}</b></div>
              </div>

              <div class="btn-row">
                <button type="button" class="btn" :disabled="fateRolling || busy" @click="handleRollFate">
                  {{ fateRolled ? '重 掷' : '掷 天 命' }}
                </button>
                <button
                  type="button"
                  class="btn btn-primary"
                  :disabled="!fateStats || fateRolling || busy"
                  @click="handleConfirmFate"
                >{{ busy ? '正在开局…' : '以此天命开局' }}</button>
              </div>
              <button type="button" class="btn btn-ghost btn-block fate-back" @click="view = 'select'">
                返回开局设置
              </button>
              <p class="note">可无限重掷；确认后锁定；不能手动改点。</p>
            </section>
          </div>
        </div>

        <!-- ===== 立绘库 ===== -->
        <PortraitScreen
          v-else-if="view === 'portraits'"
          :run="activeRun"
          :target-id="portraitTargetId"
          @back="closePortraitManager"
          @picked="handlePortraitPicked"
        />

        <!-- ===== 设置 ===== -->
        <div v-else-if="view === 'settings'" class="settings-wrap">
          <SettingsScreen @back="closeSettings" @changed="loadLlmInfo" />
        </div>

        <!-- ===== 游戏内 ===== -->
        <template v-else-if="activeRun">
          <ChatScreen
            v-if="view === 'chat'"
            :run="activeRun"
            :initial-mode="chatMode"
            :initial-character-id="chatCharacterId"
            @update="handleChatUpdate"
            @back="go('court')"
          />

          <CityScreen
            v-else-if="view === 'city'"
            :run="activeRun"
            @update="handleCityUpdate"
            @back="go('court')"
          />

          <!-- 朝堂 -->
          <div v-else-if="view === 'court'" class="page court">
            <section class="ruler-card">
              <div
                class="avatar avatar-lg ruler-avatar is-clickable"
                :class="{ 'avatar-dead': ruler?.health <= 0 }"
                role="button"
                tabindex="0"
                @click="openPortraitLightbox(ruler)"
                @keydown.enter="openPortraitLightbox(ruler)"
              >
                <img v-if="avatarOk(portraitOf(ruler))" :src="portraitOf(ruler)" :alt="ruler?.name" @error="onAvatarError(portraitOf(ruler))" />
                <template v-else>{{ (ruler?.name || '帝').slice(0, 1) }}</template>
              </div>
              <div class="ruler-main">
                <div class="ruler-name">
                  {{ ruler?.name }}
                  <span>{{ ruler?.age }} 岁</span>
                  <em>第 {{ activeRun.generation }} 代</em>
                </div>
                <div class="ruler-meta">
                  <span>健康 <b :class="{ 'is-bad': ruler?.health < 40 }">{{ ruler?.health }}</b></span>
                  <span>压力 <b :class="{ 'is-bad': courtBurden.stress >= 70 }">{{ courtBurden.stress }}</b></span>
                  <span>寿元 <b>{{ ruler?.lifespan }}</b></span>
                  <span>国库 <b>{{ formatResource('treasury', activeRun.resources.treasury) }}</b></span>
                </div>
                <div class="chips ruler-burden">
                  <span v-for="trait in courtBurden.traits" :key="trait.id" class="chip chip-gold">{{ trait.label }}</span>
                  <span v-for="debuff in courtBurden.debuffs" :key="debuff.id" class="chip chip-red">{{ debuff.label }}</span>
                  <span v-if="!courtBurden.traits.length && !courtBurden.debuffs.length" class="chip">暂无负面状态</span>
                </div>
              </div>
              <div class="ruler-seal">御</div>
            </section>

            <div class="court-grid">
              <div class="court-col">
                <div class="section">
                  <span>国情</span>
                  <span class="section-note">行动点 {{ actionPoints }} / {{ maxActionPoints }}</span>
                </div>
                <div class="res-grid">
                  <div v-for="key in RESOURCE_KEYS_LIST" :key="key" class="res-card">
                    <div class="res-head">
                      <span>{{ RESOURCE_LABELS_MAP[key] }}</span>
                      <b>{{ formatResource(key, activeRun.resources[key]) }}</b>
                    </div>
                    <div class="bar"><i :style="{ width: barWidth(key) }"></i></div>
                  </div>
                </div>

                <div class="income-strip">
                  <span>税入 <b class="plus">+{{ income.tax }}</b></span>
                  <span>官俸 <b class="minus">-{{ income.salary }}</b></span>
                  <span>后宫 <b class="minus">-{{ income.harem }}</b></span>
                  <span>行政 <b class="minus">-{{ income.adminCost }}</b></span>
                  <span>军饷 <b class="minus">-{{ income.armyUpkeep }}</b></span>
                  <span class="income-net">
                    净 <b :class="income.net >= 0 ? 'plus' : 'minus'">{{ income.net >= 0 ? '+' : '' }}{{ income.net }}</b>
                  </span>
                </div>

                <button
                  v-if="rumors.length > 0"
                  type="button"
                  class="rumor-strip"
                  @click="go('intel')"
                >
                  <span class="chip chip-gold">密报</span>
                  <span class="rumor-text">{{ rumors[0]?.text }}</span>
                  <span class="rumor-more">{{ rumors.length }} 条 ›</span>
                </button>

                <div class="section">
                  <span>待批奏折 · {{ pendingEvents.length }}</span>
                  <button type="button" class="link-btn" @click="go('memorials')">全部 ›</button>
                </div>
                <p v-if="pendingEvents.length === 0" class="empty empty-sm">本旬无奏折。</p>
                <div v-else class="memorial-list">
                  <button
                    v-for="event in pendingEvents"
                    :key="event.instanceId"
                    type="button"
                    class="memorial-card"
                    @click="openEvent(event)"
                  >
                    <div class="memorial-card-head">
                      <span class="chip" :class="event.kind === 'scene' ? 'chip-violet' : 'chip-gold'">
                        {{ event.kind === 'scene' ? '剧情' : event.source }}
                      </span>
                      <b>{{ event.title }}</b>
                    </div>
                    <p>{{ event.text }}</p>
                    <span class="memorial-card-foot">批阅 ›</span>
                  </button>
                </div>
                <p v-if="narratingEventId" class="note is-live">史官正在拟稿…</p>
              </div>

              <aside class="court-col">
                <div class="section"><span>快捷</span></div>
                <div class="quick-grid">
                  <button type="button" @click="openPalace"><b>出行</b><small>皇宫</small></button>
                  <button type="button" @click="openCity"><b>出宫</b><small>京城</small></button>
                  <button type="button" @click="openChat('list')"><b>召见</b><small>聊天</small></button>
                  <button type="button" @click="openChat('duty')"><b>值房</b><small>看人</small></button>
                  <button type="button" @click="go('people')"><b>人物</b><small>名册</small></button>
                  <button type="button" @click="go('harem')"><b>后宫</b><small>{{ consorts.length }} 人</small></button>
                  <button type="button" @click="go('heirs')"><b>子嗣</b><small>{{ children.length }} 人</small></button>
                  <button type="button" @click="go('treasury')"><b>国库</b><small>{{ formatResource('treasury', activeRun.resources.treasury) }}</small></button>
                </div>

                <div class="section"><span>本月</span></div>
                <div class="card-flat turn-card">
                  <p class="turn-note">
                    批阅奏折不耗行动点。侍寝、赏赐、申斥、召见各耗 1 点；每月开始回满。
                  </p>
                  <button type="button" class="btn btn-primary btn-block" :disabled="!canAct" @click="handleAdvance">
                    {{ busy ? '结算中…' : '过 一 月' }}
                  </button>
                  <div class="turn-ap">
                    <span v-for="index in maxActionPoints" :key="index" class="ap-dot" :class="{ 'is-on': index <= actionPoints }"></span>
                    <em>{{ actionPoints }} / {{ maxActionPoints }}</em>
                  </div>
                </div>

                <div v-if="bioStatus.running || bioStatus.failed" class="card-flat bio-card">
                  <div class="kv">
                    <span>AI 人设</span>
                    <b>{{ bioStatus.running ? `${bioStatus.done} / ${bioStatus.total}` : '已回退本地模板' }}</b>
                  </div>
                  <div class="bar"><i :style="{ width: `${bioStatus.total ? Math.round(bioStatus.done / bioStatus.total * 100) : 0}%` }"></i></div>
                </div>
              </aside>
            </div>
          </div>

          <!-- 奏折列表 -->
          <div v-else-if="view === 'memorials'" class="page">
            <header class="page-head">
              <div>
                <p class="eyebrow">案牍</p>
                <h1>奏折</h1>
                <p class="page-sub">待批 {{ pendingEvents.length }} · 已批 {{ archiveEvents.length }}</p>
              </div>
            </header>

            <div class="section"><span>待批</span></div>
            <p v-if="pendingEvents.length === 0" class="empty">没有待批奏折。</p>
            <div v-else class="memorial-list">
              <button
                v-for="event in pendingEvents"
                :key="event.instanceId"
                type="button"
                class="memorial-card"
                @click="openEvent(event)"
              >
                <div class="memorial-card-head">
                  <span class="chip" :class="event.kind === 'scene' ? 'chip-violet' : 'chip-gold'">
                    {{ event.kind === 'scene' ? '剧情' : event.source }}
                  </span>
                  <b>{{ event.title }}</b>
                  <span class="chip chip-red">待批</span>
                </div>
                <p>{{ event.text }}</p>
                <span class="memorial-card-foot">批阅 ›</span>
              </button>
            </div>

            <div class="section"><span>已批</span></div>
            <p v-if="archiveEvents.length === 0" class="empty empty-sm">还没有批过奏折。</p>
            <div v-else class="archive-list">
              <div v-for="item in archiveEvents.slice(0, 16)" :key="item.instanceId" class="archive-row">
                <div>
                  <b>{{ item.title }}</b>
                  <small>{{ item.missed ? '未批，已积压' : item.choiceText }}</small>
                </div>
                <span class="chip" :class="{ 'chip-red': item.missed }">{{ item.missed ? '积压' : '已批' }}</span>
              </div>
            </div>
          </div>

          <!-- 奏折详情 -->
          <div v-else-if="view === 'memorial'" class="page">
            <template v-if="currentEvent">
              <header class="page-head memorial-head">
                <div>
                  <p class="eyebrow">
                    {{ currentEvent.kind === 'scene' ? '剧情' : currentEvent.source }}
                    · {{ currentEvent.year }}年{{ currentEvent.month }}月
                  </p>
                  <h1>{{ currentEvent.title }}</h1>
                </div>
              </header>

              <div v-if="currentEvent.actors?.length" class="chips actor-row">
                <button
                  v-for="actor in currentEvent.actors"
                  :key="actor.id"
                  type="button"
                  class="chip chip-gold actor-chip"
                  @click="openPersonById(actor.id)"
                >
                  {{ actor.name }}<span v-if="actor.office"> · {{ actor.office }}</span>
                </button>
                <button
                  v-if="currentEvent.kind === 'scene' && currentEvent.actors?.[0]?.id"
                  type="button"
                  class="btn btn-sm btn-ghost"
                  @click="openChat('audience', currentEvent.actors[0].id)"
                >召见此人</button>
              </div>

              <p v-if="narratingEventId === currentEvent.instanceId" class="note is-live">史官正在拟稿…</p>

              <article class="prose">
                <p>{{ currentEvent.text }}</p>
              </article>

              <div class="section"><span>处置</span><span class="section-note">后果由朝廷结算</span></div>
              <div class="choice-list">
                <button
                  v-for="choice in currentEvent.choices"
                  :key="choice.id"
                  type="button"
                  class="choice"
                  @click="chooseEventOption(choice)"
                >
                  <span class="choice-title">{{ choice.text }}</span>
                  <span class="choice-hint">{{ displayHint(choice) }}</span>
                </button>
              </div>
            </template>
            <template v-else-if="selectedChoiceResult">
              <div class="result-panel">
                <p class="eyebrow">已批红</p>
                <p>{{ selectedChoiceResult }}</p>
              </div>
              <button type="button" class="btn btn-primary btn-block" @click="go('memorials')">返回奏折</button>
            </template>
            <p v-else class="empty">这份奏折已经批过了。</p>
          </div>

          <!-- 人物 -->
          <div v-else-if="view === 'people'" class="page">
            <header class="page-head">
              <div>
                <p class="eyebrow">名册</p>
                <h1>人物</h1>
                <p class="page-sub">已故 {{ deathSummary.dead }} 人 · 空缺 {{ deathSummary.vacant }} 职</p>
              </div>
              <div class="head-actions">
                <button type="button" class="btn btn-sm" @click="go('exam')">科举 · 候补 {{ examPool.length }}</button>
                <button type="button" class="btn btn-sm" @click="go('regions')">地方官</button>
              </div>
            </header>

            <div class="tabs">
              <button
                v-for="tab in ROLE_TABS"
                :key="tab.key"
                type="button"
                class="tab"
                :class="{ 'is-active': selectedRole === tab.key }"
                @click="selectedRole = tab.key"
              >
                {{ tab.label }} <b>{{ roleCounts[tab.key] || 0 }}</b>
              </button>
            </div>

            <div class="people-tools">
              <input v-model="personQuery" class="input" type="search" placeholder="搜索姓名、官职、派系或标签" />
              <span v-if="activeRoleItems.length" class="section-note">{{ activeRoleItems.length }} 人</span>
            </div>

            <div v-if="vacancies.length > 0" class="alert-row">
              <span>缺员 {{ vacancies.length }}：{{ vacancies.map((item) => item.office).join('、') }}</span>
              <button type="button" class="btn btn-sm" @click="go('appointment')">补缺</button>
            </div>

            <p v-if="activeRoleItems.length === 0" class="empty">这一类暂时没有人。</p>
            <div v-else class="people-grid">
              <button
                v-for="person in activeRoleItems"
                :key="person.id"
                type="button"
                class="person-card"
                :class="{ 'is-dead': person.alive === false }"
                @click="openPerson(person)"
              >
                <div class="avatar avatar-portrait" :class="[roleClass(person), { 'avatar-dead': person.alive === false }]">
                  <img v-if="avatarOk(portraitOf(person, true))" :src="portraitOf(person, true)" alt="" loading="lazy" @error="onAvatarError(portraitOf(person, true))" />
                  <template v-else>{{ person.name.slice(0, 1) }}</template>
                </div>
                <div class="person-main">
                  <div class="person-name">
                    {{ person.name }}
                    <span v-if="person.alive !== false">{{ person.age }}</span>
                    <span v-else>卒 {{ formatMonthIndex(person.deathMonth) }}</span>
                  </div>
                  <div class="person-office">
                    <template v-if="person.alive === false">故 · </template>{{ person.office }}
                  </div>
                  <div class="chips">
                    <template v-if="person.alive === false">
                      <span class="chip chip-red">{{ getDeathCauseLabel(person.deathCause) }}</span>
                    </template>
                    <template v-else-if="blindMode">
                      <span
                        class="chip"
                        :class="getReputation(person).tone ? `chip-${getReputation(person).tone}` : ''"
                      >{{ getReputation(person).label }}</span>
                    </template>
                    <template v-else>
                      <span class="chip chip-jade">忠 {{ person.loyalty }}</span>
                      <span class="chip" :class="{ 'chip-red': person.ambition > 60 }">野 {{ person.ambition }}</span>
                    </template>
                    <span class="chip chip-violet">能 {{ person.ability }}</span>
                  </div>
                </div>
                <span class="person-go">›</span>
              </button>
            </div>
          </div>

          <!-- 人物详情 -->
          <div v-else-if="view === 'person' && currentPerson" class="page person-page">
            <section class="person-hero">
              <div
                class="portrait-frame"
                :class="{ 'is-empty': !avatarOk(portraitOf(currentPerson)), 'is-dead': currentPerson.alive === false }"
                role="button"
                tabindex="0"
                @click="openPortraitLightbox(currentPerson)"
                @keydown.enter="openPortraitLightbox(currentPerson)"
              >
                <img
                  v-if="avatarOk(portraitOf(currentPerson))"
                  :src="portraitOf(currentPerson)"
                  :alt="currentPerson.name"
                  @error="onAvatarError(portraitOf(currentPerson))"
                />
                <span v-else class="portrait-initial">{{ currentPerson.name.slice(0, 1) }}</span>
                <span class="portrait-shade"></span>
                <span class="portrait-name">{{ currentPerson.name }}</span>
                <button type="button" class="portrait-change" @click.stop="openPortraitManager(currentPerson)">
                  更换立绘
                </button>
              </div>
              <div class="person-hero-main">
                <p class="eyebrow">{{ currentPerson.office || currentPerson.roleLabel }}</p>
                <h1>{{ currentPerson.name }}</h1>
                <p class="person-hero-sub">
                  {{ currentPerson.office }} · {{ currentPerson.age }} 岁
                  <template v-if="currentPerson.factionName"> · {{ currentPerson.factionName }}</template>
                </p>
                <div class="chips">
                  <span v-for="tag in currentPerson.tags" :key="tag" class="chip">{{ tag }}</span>
                  <span v-if="currentPerson.alive === false" class="chip chip-red">已故 · {{ getDeathCauseLabel(currentPerson.deathCause) }}</span>
                  <span v-if="currentPerson.id === activeRun.designatedHeirId" class="chip chip-gold">储君</span>
                </div>
              </div>
            </section>

            <div v-if="showPersonRename" class="inline-form">
              <input
                v-model="renamePersonValue"
                type="text"
                maxlength="12"
                placeholder="新名字"
                @keyup.enter="handleRenamePerson"
              />
              <button type="button" class="btn btn-sm btn-primary" @click="handleRenamePerson">保存</button>
              <button type="button" class="btn btn-sm btn-ghost" @click="showPersonRename = false">取消</button>
            </div>

            <div v-if="currentPerson.alive !== false" class="action-bar">
              <button type="button" class="btn btn-sm" :disabled="!canAct" @click="handleInteract('reward')">赏赐</button>
              <button type="button" class="btn btn-sm" :disabled="!canAct" @click="handleInteract('warn')">申斥</button>
              <button type="button" class="btn btn-sm" @click="openChat('chat', currentPerson.id)">召见</button>
              <button type="button" class="btn btn-sm" @click="openChat('audience', currentPerson.id)">奏对</button>
              <button
                v-if="currentPerson.rank > 0"
                type="button"
                class="btn btn-sm"
                :disabled="!canAct"
                @click="handleChangeRank('up')"
              >升迁</button>
              <button
                v-if="currentPerson.rank > 0"
                type="button"
                class="btn btn-sm"
                :disabled="!canAct"
                @click="handleChangeRank('down')"
              >贬黜</button>
              <button
                v-if="currentPerson.rank > 0"
                type="button"
                class="btn btn-sm"
                :disabled="!canAct"
                @click="handleRecommend"
              >令其举荐</button>
              <button type="button" class="btn btn-sm btn-ghost" @click="openPersonRename">改名</button>
              <button
                v-if="currentPerson.exposed"
                type="button"
                class="btn btn-sm btn-danger"
                :disabled="!canAct"
                @click="handlePurge"
              >下狱</button>
            </div>

            <div class="detail-grid">
              <section class="card">
                <div class="section"><span>五维能力</span></div>
                <CharacterRadar :person="currentPerson" :size="238" />

                <div class="metric-list">
                  <div v-for="metric in personMetrics" :key="metric.key" class="metric">
                    <div class="metric-head">
                      <span>{{ metric.label }}</span>
                      <b>{{ metric.value }}</b>
                    </div>
                    <div class="bar" :class="metric.tone ? `bar-${metric.tone}` : ''">
                      <i :style="{ width: `${metric.value}%` }"></i>
                    </div>
                  </div>
                </div>
              </section>

              <section class="card">
                <div class="section"><span>履历</span></div>
                <div v-if="currentPerson.rank > 0" class="kv">
                  <span>品级</span>
                  <b>{{ getRankLabel(currentPerson.rank) }} · 任 {{ currentPerson.tenureMonths || 0 }} 月</b>
                </div>
                <div v-if="currentPerson.regionName" class="kv">
                  <span>外任</span><b>{{ currentPerson.regionName }}</b>
                </div>
                <div v-if="currentPerson.rank > 0" class="kv">
                  <span>考成</span><b>{{ currentPerson.performance || 0 }}</b>
                </div>
                <div v-if="currentPerson.examCohort" class="kv">
                  <span>科第</span>
                  <b>{{ currentPerson.examCohort }}年{{ currentPerson.examRank || '进士' }}</b>
                </div>
                <div v-if="currentPerson.examMasterName" class="kv">
                  <span>座师</span><b>{{ currentPerson.examMasterName }}</b>
                </div>
                <div
                  v-if="currentPerson.recommendedByName && currentPerson.recommendedByName !== currentPerson.examMasterName"
                  class="kv"
                >
                  <span>举荐</span><b>{{ currentPerson.recommendedByName }}</b>
                </div>
                <div v-if="currentPerson.role === 'consort'" class="kv">
                  <span>入宫</span><b>{{ getConsortSourceLabel(currentPerson) }}</b>
                </div>
                <div v-if="currentPerson.patronName" class="kv">
                  <span>恩主</span><b>{{ currentPerson.patronName }}</b>
                </div>
                <div v-if="currentPerson.exposed" class="alert-row is-danger">
                  此人已被密探查实：结党、挪用银钱。可下狱处置。
                </div>
                <div v-if="blindMode" class="reputation-box">
                  <span
                    class="chip"
                    :class="getReputation(currentPerson).tone ? `chip-${getReputation(currentPerson).tone}` : ''"
                  >风评：{{ getReputation(currentPerson).label }}</span>
                  <p>忠诚与野心已隐藏。可用密报、事件与言行判断，或提高圣听。</p>
                </div>
              </section>
            </div>

            <section class="card bio-card">
              <div class="section"><span>人设</span></div>
              <p class="bio-text">{{ currentPerson.bio || personFallbackBio(currentPerson) }}</p>
              <div v-if="currentPerson.appearance" class="kv"><span>外貌</span><b>{{ currentPerson.appearance }}</b></div>
              <div v-if="currentPerson.speechStyle" class="kv"><span>说话</span><b>{{ currentPerson.speechStyle }}</b></div>
            </section>

            <template v-if="currentPerson.role === 'child'">
              <div class="section"><span>成长</span></div>
              <section class="card">
                <div class="kv"><span>阶段</span><b>{{ currentPerson.stageLabel || '—' }} · {{ currentPerson.age }} 岁</b></div>
                <div class="kv"><span>亲密度</span><b>{{ currentPerson.intimacy ?? 60 }}</b></div>
                <div class="kv"><span>声望</span><b>{{ currentPerson.reputation ?? 0 }}</b></div>
                <div class="kv"><span>婚约</span><b>{{ marriageStatusLabel(currentPerson.marriageStatus) }}</b></div>
                <div v-if="childSpouse" class="kv"><span>配偶</span><b>{{ childSpouse.name }} · {{ childSpouse.office }}</b></div>

                <div class="btn-row child-actions">
                  <button type="button" class="btn btn-sm" :disabled="!canAct" @click="handleChildAction('visit')">探望</button>
                  <button type="button" class="btn btn-sm" :disabled="!canAct || currentPerson.age < 5" @click="handleChildAction('study')">考课</button>
                  <button type="button" class="btn btn-sm" :disabled="!canAct || currentPerson.age < 8" @click="handleChildAction('drill')">骑射</button>
                  <button type="button" class="btn btn-sm" :disabled="!canAct || currentPerson.age < 5" @click="handleChildAction('warn')">训诫</button>
                  <button
                    v-if="currentPerson.age >= 14 && currentPerson.marriageStatus === 'single'"
                    type="button"
                    class="btn btn-sm"
                    @click="handleChildMarriageStart"
                  >议婚</button>
                  <button
                    v-if="currentPerson.id !== activeRun.designatedHeirId"
                    type="button"
                    class="btn btn-sm btn-primary"
                    :disabled="!canAct"
                    @click="handleDesignate(currentPerson)"
                  >立储</button>
                </div>

                <template v-if="childSiblingRows.length">
                  <div class="section"><span>手足</span></div>
                  <div v-for="row in childSiblingRows" :key="row.id" class="kv">
                    <span>{{ row.name }}</span>
                    <b :class="row.value < 0 ? 'minus' : 'plus'">{{ row.value > 0 ? '+' : '' }}{{ row.value }}</b>
                  </div>
                </template>
              </section>

              <template v-if="currentPerson.id === activeRun.designatedHeirId">
                <div class="section"><span>东宫</span></div>
                <section class="card">
                  <div class="kv"><span>东宫势力</span><b>{{ heirInfluence }}</b></div>
                  <div class="bar bar-violet"><i :style="{ width: `${heirInfluence}%` }"></i></div>
                  <p class="note">60 开始结党，80 出现逼宫风险。</p>

                  <div v-for="supporter in heirSupporters" :key="supporter.id" class="sub-card">
                    <div class="sub-card-head">
                      <b>{{ supporter.name }}</b>
                      <span class="chip">{{ supporter.roleTag }}</span>
                    </div>
                    <div class="kv"><span>官职</span><b>{{ supporter.office }}</b></div>
                    <div class="kv"><span>忠诚</span><b>对君 {{ supporter.rulerLoyalty }} · 对太子 {{ supporter.heirLoyalty }}</b></div>
                    <div class="kv"><span>影响</span><b>{{ supporter.impact }} · {{ supporter.status }}</b></div>
                    <div class="btn-row">
                      <button type="button" class="btn btn-sm" :disabled="!canAct" @click="handleHeirSupporter(supporter.id, 'audience')">召见</button>
                      <button type="button" class="btn btn-sm" :disabled="!canAct" @click="handleHeirSupporter(supporter.id, 'heir_choose')">让太子自选</button>
                      <button type="button" class="btn btn-sm btn-danger" :disabled="!canAct" @click="handleHeirSupporter(supporter.id, 'suppress')">裁抑</button>
                    </div>
                  </div>
                </section>
              </template>

              <template v-if="childMarriage && childMarriage.childId === currentPerson.id">
                <div class="section"><span>议婚候选</span></div>
                <section v-for="candidate in childMarriage.candidates" :key="candidate.id" class="card sub-card">
                  <div class="sub-card-head">
                    <b>{{ candidate.name }}</b>
                    <span class="chip">{{ candidate.gender }} · {{ candidate.age }} 岁</span>
                  </div>
                  <p class="note">{{ candidate.family }} · {{ candidate.origin }}</p>
                  <div class="kv">
                    <span>五维</span>
                    <b>文{{ candidate.civil }} 武{{ candidate.military }} 智{{ candidate.strategy }} 魅{{ candidate.charm }} 财{{ candidate.finance }}</b>
                  </div>
                  <div class="btn-row">
                    <button type="button" class="btn btn-sm btn-primary" @click="handleChildMarriageChoice(candidate.id, 'approve')">定亲 · 800贯</button>
                    <button type="button" class="btn btn-sm" @click="handleChildMarriageChoice(candidate.id, 'refuse')">拒绝</button>
                    <button type="button" class="btn btn-sm" @click="handleChildMarriageChoice(candidate.id, 'delay')">暂缓</button>
                  </div>
                </section>
              </template>

              <template v-if="childSecretAffair?.active">
                <div class="section"><span>私会</span></div>
                <section class="card">
                  <div class="kv">
                    <span>{{ childSecretAffair.candidate?.name || '某人' }}</span>
                    <b>阶段 {{ (childSecretAffair.stage || 0) + 1 }} / 4 · 风闻 {{ childSecretAffair.scandal || 0 }}</b>
                  </div>
                  <p class="note">拒婚后仍在私下往来。风闻越高，越可能传到御史台。</p>
                  <div class="btn-row">
                    <button type="button" class="btn btn-sm btn-primary" @click="handleChildSecret('allow')">成全 · 500贯</button>
                    <button type="button" class="btn btn-sm" @click="handleChildSecret('separate')">拆散</button>
                    <button type="button" class="btn btn-sm" @click="handleChildSecret('suppress')">压下</button>
                    <button type="button" class="btn btn-sm btn-danger" @click="handleChildSecret('punish')">公开惩处</button>
                  </div>
                </section>
              </template>

              <template v-if="currentPerson.marriageStatus === 'betrothed'">
                <div class="section"><span>大婚</span></div>
                <section class="card">
                  <p class="note">定亲后三个月内可举行大婚。礼制越铺张，威望与姻亲越稳，国库越吃紧。</p>
                  <div class="btn-row">
                    <button
                      v-for="(level, key) in weddingLevels"
                      :key="key"
                      type="button"
                      class="btn btn-sm"
                      @click="handleChildWedding(key)"
                    >{{ level.label }} · {{ level.cost }}贯</button>
                  </div>
                </section>
              </template>

              <template v-if="currentPerson.marriageStatus === 'married'">
                <div class="section"><span>婚后</span></div>
                <section class="card">
                  <div class="kv"><span>大婚</span><b>{{ currentPerson.weddingScale || '已成婚' }}</b></div>
                  <div class="kv"><span>子女</span><b>{{ (currentPerson.childrenIds || []).length }}</b></div>
                  <div v-if="childPregnancy" class="kv"><span>有孕</span><b>待产</b></div>
                  <p class="note">异性婚姻会按月判定自然生育；同性婚姻或无子女时，可过继宗室子女。</p>
                  <button type="button" class="btn btn-sm" @click="handleAdoptChild">过继宗室子女 · 300贯</button>
                </section>
              </template>
            </template>

            <template v-if="currentPerson.alive === false">
              <div class="section"><span>丧仪</span></div>
              <section class="card">
                <div class="kv"><span>卒于</span><b>{{ formatMonthIndex(currentPerson.deathMonth) }}</b></div>
                <div class="kv"><span>死因</span><b>{{ getDeathCauseLabel(currentPerson.deathCause) }}</b></div>
                <div class="kv"><span>享年</span><b>{{ currentPerson.age }} 岁</b></div>
                <div v-if="currentPerson.funeralLevel" class="kv">
                  <span>已治丧</span>
                  <b>{{ FUNERAL_LEVELS[currentPerson.funeralLevel]?.label }} · 追封 {{ currentPerson.posthumousTitle }}</b>
                </div>
                <div v-else class="funeral-grid">
                  <button
                    v-for="level in FUNERAL_LEVEL_LIST"
                    :key="level.id"
                    type="button"
                    class="funeral-btn"
                    :disabled="busy || activeRun.resources.treasury < level.cost"
                    @click="handleFuneral(level.id)"
                  >
                    <b>{{ level.label }}</b>
                    <span>{{ level.cost }} 贯</span>
                    <em>{{ level.desc }}</em>
                  </button>
                </div>
                <p class="note">治丧会提高民心与威望，安抚同派系；侍宠的子女会因此获得继承合法性。</p>
              </section>
            </template>
          </div>

          <!-- 后宫 -->
          <div v-else-if="view === 'harem'" class="page">
            <header class="page-head">
              <div>
                <p class="eyebrow">内廷</p>
                <h1>后宫</h1>
                <p class="page-sub">{{ consorts.length }} 人 · 有孕 {{ haremTension.pregnantCount }} · 张力 {{ haremTension.tension }}</p>
              </div>
              <button type="button" class="btn btn-sm btn-primary" :disabled="busy" @click="handleStartSelection">
                {{ selectionCandidates.length > 0 ? '查看选秀名册' : `开选秀 · ${SELECTION_COST} 贯` }}
              </button>
            </header>

            <div class="tension-grid">
              <div class="tension-card">
                <span>后宫张力</span>
                <b>{{ haremTension.tension }}</b>
                <div class="bar bar-red"><i :style="{ width: `${Math.min(100, haremTension.tension)}%` }"></i></div>
              </div>
              <div class="tension-card">
                <span>平均危险</span>
                <b>{{ haremTension.avgDanger }}</b>
                <div class="bar bar-violet"><i :style="{ width: `${Math.min(100, haremTension.avgDanger)}%` }"></i></div>
              </div>
              <div class="tension-card">
                <span>行动点</span>
                <b>{{ actionPoints }} / {{ maxActionPoints }}</b>
                <div class="bar"><i :style="{ width: `${maxActionPoints ? actionPoints / maxActionPoints * 100 : 0}%` }"></i></div>
              </div>
            </div>
            <p class="note">选秀每半年一次。臣属也会进献；带恩主入宫的人，平时会替恩主说话。</p>

            <div v-if="pregnancies.length" class="section"><span>孕事</span></div>
            <div v-if="pregnancies.length" class="pregnancy-list">
              <div v-for="item in pregnancies" :key="item.id" class="pregnancy">
                <div class="avatar avatar-sm avatar-consort">
                  <img v-if="avatarOk(portraitOf(item.carrier, true))" :src="portraitOf(item.carrier, true)" alt="" loading="lazy" @error="onAvatarError(portraitOf(item.carrier, true))" />
                  <template v-else>{{ item.carrier?.name?.slice(0, 1) || '孕' }}</template>
                </div>
                <div class="pregnancy-main">
                  <div class="pregnancy-head">
                    <b>{{ item.carrier?.name || '侍宠' }}</b>
                    <span class="chip chip-violet">{{ item.progress.remaining }} 月后分娩</span>
                  </div>
                  <div class="bar"><i :style="{ width: `${item.progress.percent}%` }"></i></div>
                  <small>孕 {{ item.progress.elapsed }} / {{ item.progress.total }} 月</small>
                </div>
              </div>
            </div>

            <div class="section"><span>侍寝名册</span><span class="section-note">行动点 {{ actionPoints }} / {{ maxActionPoints }}</span></div>
            <p v-if="consorts.length === 0" class="empty">后宫无人。</p>
            <div v-else class="harem-list">
              <div v-for="person in consorts" :key="person.id" class="harem-row">
                <div
                  class="avatar avatar-portrait avatar-consort is-clickable"
                  role="button"
                  tabindex="0"
                  @click="openPortraitLightbox(person)"
                  @keydown.enter="openPortraitLightbox(person)"
                >
                  <img v-if="avatarOk(portraitOf(person, true))" :src="portraitOf(person, true)" alt="" loading="lazy" @error="onAvatarError(portraitOf(person, true))" />
                  <template v-else>{{ person.name.slice(0, 1) }}</template>
                </div>
                <div class="harem-main">
                  <div class="harem-head">
                    <b @click="openPerson(person)">{{ person.name }}</b>
                    <span class="chip">{{ person.gender }}</span>
                    <span v-if="isPregnant(person.id)" class="chip chip-violet">有孕</span>
                  </div>
                  <div class="harem-meta">
                    {{ getConsortSourceLabel(person) }} · {{ person.office }} · {{ (person.tags || []).join('、') }}
                  </div>
                  <div class="harem-meta">
                    <template v-if="blindMode">风评 {{ getHaremDisposition(getHaremProfile(person)).label }}</template>
                    <template v-else>危险 {{ getHaremProfile(person).danger }}</template>
                    · 受孕 {{ person.fertility }} · 健康 {{ person.health }}
                  </div>
                </div>
                <button
                  type="button"
                  class="btn btn-sm"
                  :disabled="!canAct || actionPoints <= 0 || isPregnant(person.id)"
                  @click="handleArrange(person)"
                >安排</button>
              </div>
            </div>
            <p class="note">仙侠设定：男女侍宠皆可受孕。受孕率与双方生育、健康、年龄有关。</p>
          </div>

          <!-- 科举 -->
          <div v-else-if="view === 'exam'" class="page">
            <header class="page-head">
              <div>
                <p class="eyebrow">取士</p>
                <h1>科举</h1>
                <p class="page-sub">候补 {{ examPool.length }} 人</p>
              </div>
              <button
                type="button"
                class="btn btn-sm btn-primary"
                :disabled="busy || activeRun.resources.treasury < EXAM_COST"
                @click="handleStartExam"
              >开科取士 · {{ EXAM_COST }} 贯</button>
            </header>
            <p class="note">新科进士进入候补池；补缺时优先从候补中选人。</p>

            <p v-if="examPool.length === 0" class="empty">候补池是空的。</p>
            <div v-else class="row-list">
              <div v-for="candidate in examPool" :key="candidate.id" class="row">
                <div class="row-main">
                  <div class="row-title">
                    {{ candidate.name }}
                    <span class="chip chip-gold">{{ candidate.examRank || '进士' }}</span>
                  </div>
                  <div class="row-sub">
                    {{ candidate.age }} 岁 · 能力 {{ candidate.ability }}
                    <template v-if="candidate.examCohort"> · {{ candidate.examCohort }}年{{ candidate.examRank || '进士' }}</template>
                    <template v-if="candidate.examMasterName"> · 座师{{ candidate.examMasterName }}</template>
                    · {{ (candidate.tags || []).join('、') }}
                  </div>
                </div>
                <span class="chip">{{ getRankLabel(candidate.rank) }}</span>
              </div>
            </div>
          </div>

          <!-- 地方官 -->
          <div v-else-if="view === 'regions'" class="page">
            <header class="page-head">
              <div>
                <p class="eyebrow">外任</p>
                <h1>地方</h1>
                <p class="page-sub">月入约 {{ regionalTax }} 贯 · 人口 {{ formatPopulation(totalPopulation) }}</p>
              </div>
            </header>

            <div class="region-grid">
              <section v-for="region in regions" :key="region.id" class="card region-card">
                <div class="region-head">
                  <div>
                    <div class="region-name">{{ region.name }}</div>
                    <div class="row-sub">{{ region.desc }} · 人口 {{ formatPopulation(region.population) }}</div>
                  </div>
                  <span class="chip" :class="{ 'chip-red': region.unrest >= 60 }">风险 {{ region.unrest }}</span>
                </div>

                <template v-if="getRegionGovernor(activeRun, region)">
                  <div class="kv">
                    <span>刺史</span>
                    <b>{{ getRegionGovernor(activeRun, region).name }} · {{ getRankLabel(getRegionGovernor(activeRun, region).rank) }}</b>
                  </div>
                  <div class="kv"><span>考成</span><b>{{ getRegionGovernor(activeRun, region).performance || 0 }}</b></div>
                  <div class="btn-row">
                    <button type="button" class="btn btn-sm" :disabled="!canAct" @click="handleGovernorAction(region, 'audience')">召见</button>
                    <button type="button" class="btn btn-sm" :disabled="!canAct" @click="handleGovernorAction(region, 'reward')">嘉奖</button>
                    <button type="button" class="btn btn-sm" :disabled="!canAct" @click="handleGovernorAction(region, 'reprimand')">申斥</button>
                    <button
                      type="button"
                      class="btn btn-sm"
                      :disabled="!canAct"
                      @click="transferFromRegionId = transferFromRegionId === region.id ? '' : region.id"
                    >调任</button>
                  </div>
                  <div v-if="transferFromRegionId === region.id" class="transfer-row">
                    <span>调往</span>
                    <button
                      v-for="other in regions.filter((item) => item.id !== region.id)"
                      :key="other.id"
                      type="button"
                      class="chip"
                      :disabled="!getRegionGovernor(activeRun, other)"
                      @click="handleTransfer(other)"
                    >{{ other.name }}</button>
                    <button type="button" class="chip" @click="transferFromRegionId = ''">取消</button>
                  </div>
                </template>
                <template v-else>
                  <p class="empty empty-sm">暂无主官，需要补缺。</p>
                  <button type="button" class="btn btn-sm btn-block" @click="go('appointment')">去补缺</button>
                </template>
              </section>
            </div>
            <p class="note">地方官每月产税，治安越低税越少；召见耗 1 行动点，嘉奖 150 贯，申斥会压野心但伤好感。</p>
          </div>

          <!-- 补缺 -->
          <div v-else-if="view === 'appointment'" class="page">
            <header class="page-head">
              <div>
                <p class="eyebrow">人事</p>
                <h1>补缺</h1>
                <p class="page-sub">缺员 {{ vacancies.length }} · 每次 {{ APPOINT_COST }} 贯</p>
              </div>
            </header>

            <p v-if="vacancies.length === 0" class="empty">没有缺员。</p>
            <div v-else class="row-list">
              <div v-for="(vacancy, index) in vacancies" :key="vacancy.office" class="row">
                <div class="row-main">
                  <div class="row-title">{{ vacancy.office }}</div>
                  <div class="row-sub">
                    {{ vacancy.role === 'clan' ? '宗室' : (vacancy.role === 'servant' ? '侍从' : '朝臣') }}
                    · {{ vacancy.factionName || '无派系' }} · {{ vacancy.month }} 月起空置
                  </div>
                </div>
                <button type="button" class="btn btn-sm" :disabled="busy" @click="handleStartAppointment(index)">择人</button>
              </div>
            </div>

            <template v-if="appointment">
              <div class="section"><span>{{ appointment.vacancyOffice }} · 候选人</span></div>
              <div class="candidate-grid">
                <section v-for="candidate in appointmentCandidates" :key="candidate.id" class="card candidate-card">
                  <div
                    class="candidate-art"
                    role="button"
                    tabindex="0"
                    @click="openPortraitLightbox(candidate)"
                    @keydown.enter="openPortraitLightbox(candidate)"
                  >
                    <img v-if="avatarOk(portraitOf(candidate))" :src="portraitOf(candidate)" :alt="candidate.name" loading="lazy" @error="onAvatarError(portraitOf(candidate))" />
                    <span v-else class="candidate-initial">{{ candidate.name.slice(0, 1) }}</span>
                    <span class="candidate-art-hint">点击看大图</span>
                  </div>
                  <div class="candidate-head">
                    <div>
                      <div class="row-title">{{ candidate.name }} <span class="chip">{{ candidate.gender }} · {{ candidate.age }} 岁</span></div>
                      <div class="row-sub">{{ (candidate.tags || []).join('、') }}</div>
                    </div>
                  </div>
                  <div class="kv"><span>能力</span><b>{{ candidate.ability }}</b></div>
                  <div class="kv"><span>健康</span><b>{{ candidate.health }}</b></div>
                  <div v-if="!blindMode" class="kv"><span>忠诚 / 野心</span><b>{{ candidate.loyalty }} / {{ candidate.ambition }}</b></div>
                  <button
                    type="button"
                    class="btn btn-sm btn-primary btn-block"
                    :disabled="busy || activeRun.resources.treasury < APPOINT_COST"
                    @click="handleAppoint(candidate)"
                  >任命 · {{ APPOINT_COST }} 贯</button>
                </section>
              </div>
              <button type="button" class="btn btn-block" @click="handleCancelAppointment">取消</button>
            </template>
            <p class="note">补缺需 {{ APPOINT_COST }} 贯。任命后由 AI 补写人设。</p>
          </div>

          <!-- 选秀 -->
          <div v-else-if="view === 'selection'" class="page">
            <header class="page-head">
              <div>
                <p class="eyebrow">内廷</p>
                <h1>选秀</h1>
                <p class="page-sub">名册 {{ selectionCandidates.length }} 人 · 纳入后宫 {{ SELECTION_COST }} 贯</p>
              </div>
              <button type="button" class="btn btn-sm" @click="handleCancelSelection">遣回名册</button>
            </header>
            <p class="note">名册只在本次选秀有效。</p>

            <p v-if="selectionCandidates.length === 0" class="empty">名册已空。</p>
            <div class="candidate-grid">
              <section v-for="candidate in selectionCandidates" :key="candidate.id" class="card candidate-card">
                <div
                  class="candidate-art"
                  role="button"
                  tabindex="0"
                  @click="openPortraitLightbox(candidate)"
                  @keydown.enter="openPortraitLightbox(candidate)"
                >
                  <img v-if="avatarOk(portraitOf(candidate))" :src="portraitOf(candidate)" :alt="candidate.name" loading="lazy" @error="onAvatarError(portraitOf(candidate))" />
                  <span v-else class="candidate-initial">{{ candidate.name.slice(0, 1) }}</span>
                  <span class="candidate-art-hint">点击看大图</span>
                </div>
                <div class="candidate-head">
                  <div>
                    <div class="row-title">{{ candidate.name }} <span class="chip">{{ candidate.gender }} · {{ candidate.age }} 岁</span></div>
                    <div class="row-sub">{{ candidate.office }} · {{ (candidate.tags || []).join('、') }}</div>
                  </div>
                </div>
                <div class="kv"><span>能力</span><b>{{ candidate.ability }}</b></div>
                <div class="kv"><span>健康</span><b>{{ candidate.health }}</b></div>
                <div class="kv"><span>生育</span><b>{{ candidate.fertility }}</b></div>
                <button
                  type="button"
                  class="btn btn-sm btn-primary btn-block"
                  :disabled="busy || activeRun.resources.treasury < SELECTION_COST"
                  @click="handleRecruitConsort(candidate)"
                >纳入后宫 · {{ SELECTION_COST }} 贯</button>
              </section>
            </div>
          </div>

          <!-- 子嗣 -->
          <div v-else-if="view === 'heirs'" class="page">
            <header class="page-head">
              <div>
                <p class="eyebrow">宗室</p>
                <h1>子嗣</h1>
                <p class="page-sub">{{ children.length }} 人 · 储君 {{ (children.find((item) => item.id === activeRun.designatedHeirId)?.name) || '未立' }}</p>
              </div>
            </header>
            <p v-if="children.length === 0" class="empty">还没有子嗣。</p>
            <div v-else class="row-list">
              <div v-for="child in children" :key="child.id" class="row is-tall">
                <div class="row-main">
                  <div class="row-title">
                    {{ child.name }}
                    <span v-if="child.id === activeRun.designatedHeirId" class="chip chip-gold">储君</span>
                  </div>
                  <div class="row-sub">
                    {{ child.office }} · {{ child.age }} 岁 · {{ child.stageLabel || '成长中' }}
                  </div>
                  <div class="row-sub">
                    亲密 {{ child.intimacy ?? 60 }} · {{ marriageStatusLabel(child.marriageStatus) }} · 天赋 {{ child.ability }}
                  </div>
                </div>
                <div class="row-actions">
                  <button type="button" class="btn btn-sm" @click="openPerson(child)">详情</button>
                  <button
                    type="button"
                    class="btn btn-sm"
                    :disabled="child.id === activeRun.designatedHeirId"
                    @click="handleDesignate(child)"
                  >{{ child.id === activeRun.designatedHeirId ? '已立' : '立储' }}</button>
                </div>
              </div>
            </div>
            <p class="note">不立储时，女帝驾崩后将进入争位流程；未满 6 岁的子嗣不参与争位。</p>
          </div>

          <!-- 争位 -->
          <div v-else-if="view === 'struggle' && succession" class="page">
            <div class="alert-row is-danger">{{ succession.deathLog }}</div>
            <header class="page-head">
              <div>
                <p class="eyebrow">大丧</p>
                <h1>争位</h1>
                <p class="page-sub">第 {{ succession.round }} / 3 轮</p>
              </div>
            </header>

            <div class="row-list">
              <div v-for="candidate in succession.candidates" :key="candidate.id" class="row">
                <div class="row-main">
                  <div class="row-title">{{ candidate.name }} <span class="chip">{{ candidate.office }}</span></div>
                  <div class="row-sub">合法性 {{ candidate.legitimacy }} · 支持 {{ candidate.support || 0 }}</div>
                </div>
                <b class="score">{{ candidate.score }}</b>
              </div>
            </div>

            <div class="section"><span>各方势力</span></div>
            <div class="card">
              <div v-for="factionItem in succession.factions" :key="factionItem.id" class="kv">
                <span>{{ factionItem.name }}</span>
                <b>{{ factionItem.power }}</b>
              </div>
            </div>

            <button
              v-if="!succession.winnerId"
              type="button"
              class="btn btn-primary btn-block succession-btn"
              :disabled="busy"
              @click="handleStruggleRound"
            >推进一轮</button>
            <button
              v-else
              type="button"
              class="btn btn-primary btn-block succession-btn"
              @click="go('succession')"
            >进入继位</button>
            <p class="note">胜负由合法性、各派支持与三轮博弈决定；LLM 只负责叙述。</p>
          </div>

          <!-- 继位 -->
          <div v-else-if="view === 'succession' && succession" class="page succession">
            <div class="succession-hero">
              <div class="hero-seal">嗣</div>
              <p class="eyebrow">改元</p>
              <h1>{{ successionWinner?.name || '新君' }} 继位</h1>
              <p class="page-sub">第 {{ activeRun.generation + 1 }} 代 · 合法性 {{ successionWinner?.legitimacy || 0 }}</p>
            </div>

            <section class="card">
              <div class="section"><span>新朝</span></div>
              <div class="form-grid">
                <label class="field">
                  <span>国号</span>
                  <input v-model="newDynastyName" type="text" maxlength="8" />
                </label>
                <label class="field">
                  <span>年号</span>
                  <input v-model="newEraName" type="text" maxlength="8" placeholder="留空则自动拟定" />
                </label>
              </div>
            </section>

            <section class="card">
              <div class="section"><span>承继</span></div>
              <div class="kv"><span>国库继承</span><b>{{ formatResource('treasury', activeRun.resources.treasury) }}</b></div>
              <div class="kv"><span>朝臣留任</span><b>{{ activeRun.characters.filter((item) => item.alive !== false).length }} 人</b></div>
              <div class="kv"><span>旧帝</span><b>{{ ruler?.name }} · {{ activeRun.eraName }}{{ activeRun.calendar.year }}年</b></div>
              <div class="kv"><span>在位</span><b>{{ activeRun.calendar.year }} 年</b></div>
              <div class="kv"><span>子嗣</span><b>{{ children.length }} 人</b></div>
            </section>

            <p class="prose-note">{{ endingEvaluation }}</p>

            <button type="button" class="btn btn-primary btn-block" @click="handleConfirmSuccession">
              继 位 · 改 元
            </button>
            <p class="note">新君继位后，朝臣忠诚按合法性重算；旧帝的私交不继承。</p>
          </div>

          <!-- 出行 -->
          <div v-else-if="view === 'palace'" class="page">
            <template v-if="!travelDetail">
              <header class="page-head">
                <div>
                  <p class="eyebrow">皇宫</p>
                  <h1>出行</h1>
                  <p class="page-sub">行动点 {{ actionPoints }} / {{ maxActionPoints }} · {{ palaceMode === 'night' ? '夜巡' : '白日常朝' }}</p>
                </div>
                <div class="mode-switch">
                  <button type="button" :class="{ 'is-active': palaceMode === 'day' }" @click="handlePalaceMode('day')">白日常朝</button>
                  <button type="button" :class="{ 'is-active': palaceMode === 'night' }" @click="handlePalaceMode('night')">夜巡</button>
                </div>
              </header>

              <div class="palace-grid">
                <button
                  v-for="room in travelRooms"
                  :key="room.id"
                  type="button"
                  class="room-card"
                  @click="handlePalaceRoom(room)"
                >
                  <span class="room-portrait">
                    <img v-if="avatarOk(portraitOf(room.resident))" :src="portraitOf(room.resident)" alt="" @error="onAvatarError(portraitOf(room.resident))" />
                    <template v-else>{{ room.resident ? room.resident.name.slice(0, 1) : room.name.slice(0, 1) }}</template>
                  </span>
                  <span class="room-body">
                    <b>{{ room.name }}</b>
                    <small>{{ room.resident ? room.resident.name : '没有固定居住者' }}</small>
                    <em>{{ room.resident ? (room.resident.office || '侍宠') : room.subtitle }}</em>
                  </span>
                  <span class="room-go">›</span>
                </button>
              </div>
              <p class="note">去坤宁宫、长春宫、储秀宫可以留宿；御花园会遇见人。</p>

              <div class="palace-meta">
                <span>体力 {{ ruler?.health ?? '—' }}</span>
                <span>宫门令 {{ palace?.gatePass ? '有' : '无' }}</span>
                <span>后宫张力 {{ palaceTension }}</span>
              </div>
            </template>

            <template v-else>
              <button type="button" class="link-btn back-link" @click="closeTravelDetail">‹ 返回宫室</button>

              <section
                class="room-hero"
                :class="{ 'is-clickable': palaceRoomResident }"
                role="button"
                :tabindex="palaceRoomResident ? 0 : -1"
                @click="palaceRoomResident && openPortraitLightbox(palaceRoomResident)"
                @keydown.enter="palaceRoomResident && openPortraitLightbox(palaceRoomResident)"
              >
                <img v-if="avatarOk(portraitOf(palaceRoomResident))" :src="portraitOf(palaceRoomResident)" alt="" @error="onAvatarError(portraitOf(palaceRoomResident))" />
                <div v-else class="room-hero-fallback">{{ palaceRoom.name.slice(0, 1) }}</div>
                <div class="room-hero-shade"></div>
                <div class="room-hero-body">
                  <h1>{{ palaceRoom.name }}</h1>
                  <p v-if="palaceRoomResident">
                    {{ palaceRoomResident.name }} · {{ palaceRoomResident.office || '侍宠' }}
                    · 好感 {{ palaceRoomResident.loyalty ?? 50 }} · 健康 {{ palaceRoomResident.health ?? 70 }}
                  </p>
                  <p v-else>{{ palaceRoom.subtitle }}</p>
                  <div class="chips">
                    <span v-for="tag in palaceRoom.tags" :key="tag" class="chip">{{ tag }}</span>
                  </div>
                </div>
              </section>

              <p class="room-desc">{{ palaceRoom.desc }}</p>

              <div class="mode-switch room-mode">
                <button type="button" :class="{ 'is-active': palaceMode === 'day' }" @click="handlePalaceMode('day')">白日常朝</button>
                <button type="button" :class="{ 'is-active': palaceMode === 'night' }" @click="handlePalaceMode('night')">夜巡</button>
              </div>

              <p
                v-if="palaceMode === 'night' && palaceRoom.zone === 'inner' && !palace?.gatePass"
                class="alert-row is-danger"
              >
                夜入内廷需宫门令。先去乾清门「领宫门令」，否则会被禁军盘问。
              </p>

              <div class="action-list">
                <button
                  v-for="action in palaceRoom.actions"
                  :key="action.id"
                  type="button"
                  class="action-row"
                  :disabled="busy || actionPoints < action.cost || (action.special === 'token' && palace?.gatePass)"
                  @click="handlePalaceAction(action)"
                >
                  <span class="action-main">
                    <b>{{ action.label }}</b>
                    <small>{{ action.desc }}</small>
                  </span>
                  <span class="action-cost">
                    {{ action.special === 'token' && palace?.gatePass ? '已领' : `${action.cost} 行动点` }}
                  </span>
                </button>
              </div>
            </template>

            <div v-if="palaceEncounter" class="encounter-card">
              <div class="encounter-head">
                <div class="avatar avatar-sm">
                  <img v-if="avatarOk(portraitOf(palaceActorCharacter))" :src="portraitOf(palaceActorCharacter)" alt="" @error="onAvatarError(portraitOf(palaceActorCharacter))" />
                  <template v-else>{{ palaceEncounter.actor?.name?.slice(0, 1) }}</template>
                </div>
                <div>
                  <h3>{{ palaceEncounter.title }}</h3>
                  <p class="row-sub">
                    {{ palaceEncounter.roomName }} · {{ palaceEncounter.actionName }}
                    · {{ palaceEncounter.actor?.name }}（{{ palaceEncounter.actor?.label }}）
                  </p>
                </div>
              </div>
              <p class="encounter-text">{{ palaceEncounter.text }}</p>
              <div class="choice-list">
                <button
                  v-for="choice in palaceEncounter.choices"
                  :key="choice.id"
                  type="button"
                  class="choice"
                  :disabled="busy"
                  @click="handlePalaceChoice(choice)"
                >
                  <span class="choice-title">{{ choice.text }}</span>
                  <span class="choice-hint">{{ choice.hint }}</span>
                </button>
              </div>
              <button type="button" class="btn btn-sm btn-ghost" @click="handlePalaceCancel">先不处置</button>
            </div>
            <div v-else-if="palaceResult" class="result-panel">
              <p>{{ palaceResult }}</p>
            </div>
          </div>

          <!-- 事件池 -->
          <div v-else-if="view === 'event-pool'" class="page">
            <header class="page-head">
              <div>
                <p class="eyebrow">调控</p>
                <h1>事件池</h1>
                <p class="page-sub">{{ visibleEventDefs.length }} 个事件</p>
              </div>
            </header>
            <p class="note">手动停用不想再看到的事件；只影响之后的抽取，不影响已经生成的奏折。</p>
            <div class="row-list">
              <div v-for="def in visibleEventDefs" :key="def.id" class="row">
                <div class="row-main">
                  <div class="row-title">
                    {{ def.title }}
                    <span class="chip">{{ def.source }}</span>
                    <span v-if="!isEventEnabled(def.id)" class="chip chip-red">已停用</span>
                  </div>
                  <div class="row-sub">权重 {{ def.weight }} · 冷却 {{ def.cooldown }} 月</div>
                </div>
                <button type="button" class="btn btn-sm" @click="handleToggleEvent(def)">
                  {{ isEventEnabled(def.id) ? '停用' : '启用' }}
                </button>
              </div>
            </div>
          </div>

          <!-- 名号 -->
          <div v-else-if="view === 'names'" class="page">
            <header class="page-head">
              <div>
                <p class="eyebrow">称谓</p>
                <h1>王朝名号</h1>
                <p class="page-sub">改名不会改写已经写下的历史</p>
              </div>
            </header>
            <section class="card form-card">
              <label class="field">
                <span>国号</span>
                <input v-model="dynastyNameDraft" type="text" maxlength="8" />
              </label>
              <label class="field">
                <span>年号</span>
                <input v-model="eraNameDraft" type="text" maxlength="6" />
              </label>
              <label class="field">
                <span>君主名</span>
                <input v-model="rulerNameDraft" type="text" maxlength="12" />
              </label>
              <button type="button" class="btn btn-primary btn-block" :disabled="busy" @click="handleSaveNames">保 存</button>
              <p class="note">国号最多 8 字，年号最多 6 字，人名最多 12 字。</p>
            </section>
          </div>

          <!-- 密报 -->
          <div v-else-if="view === 'intel'" class="page">
            <header class="page-head">
              <div>
                <p class="eyebrow">耳目</p>
                <h1>密报</h1>
                <p class="page-sub">{{ rumors.length }} 条 · 圣听 {{ activeRun.resources.intelligence }}</p>
              </div>
            </header>
            <p v-if="rumors.length === 0" class="empty">暂无密报。圣听越高，越容易发现暗处的人。</p>
            <div v-else class="row-list">
              <button
                v-for="rumor in rumors"
                :key="rumor.id"
                type="button"
                class="row is-clickable"
                :disabled="!rumor.characterId"
                @click="rumor.characterId && openPersonById(rumor.characterId)"
              >
                <div class="row-main">
                  <div class="row-title">
                    <span class="chip" :class="rumor.revealed ? 'chip-red' : 'chip-gold'">
                      {{ rumor.revealed ? '已查实' : '风闻' }}
                    </span>
                    {{ rumor.year }}年{{ rumor.month }}月
                  </div>
                  <div class="row-sub">{{ rumor.text }}</div>
                </div>
              </button>
            </div>
            <p class="note">「风闻」不会点名，只是线索；「已查实」的人会出现在人物详情里，可以下狱。</p>
          </div>

          <!-- 月度总结 -->
          <div v-else-if="view === 'summary' && summary" class="page">
            <header class="page-head">
              <div>
                <p class="eyebrow">月结</p>
                <h1>{{ summary.year }}年{{ summary.month }}月</h1>
                <p class="page-sub">国库 {{ formatResource('treasury', summary.treasuryBefore) }} → {{ formatResource('treasury', summary.treasuryAfter) }}</p>
              </div>
            </header>

            <div class="summary-grid">
              <div class="summary-card"><span>税入</span><b class="plus">+{{ summary.finance.tax }}</b></div>
              <div class="summary-card"><span>官俸</span><b class="minus">-{{ summary.finance.salary }}</b></div>
              <div class="summary-card"><span>后宫</span><b class="minus">-{{ summary.finance.harem }}</b></div>
              <div class="summary-card"><span>行政</span><b class="minus">-{{ summary.finance.adminCost || 0 }}</b></div>
              <div class="summary-card"><span>军饷</span><b class="minus">-{{ summary.finance.armyUpkeep || 0 }}</b></div>
              <div class="summary-card"><span>净额</span><b :class="summary.finance.net >= 0 ? 'plus' : 'minus'">{{ summary.finance.net >= 0 ? '+' : '' }}{{ summary.finance.net }}</b></div>
            </div>

            <div class="section"><span>上月做了</span></div>
            <p v-if="!summary.activities.length" class="empty empty-sm">没有留下处置记录。</p>
            <div v-else class="log-list">
              <div v-for="activity in summary.activities" :key="activity.id" class="log-row">{{ activity.text }}</div>
            </div>

            <div class="section"><span>本月发生</span></div>
            <div v-if="summary.deaths.length" class="log-block">
              <b>亡故</b>
              <p>
                <span v-for="(death, index) in summary.deaths" :key="death.name">
                  {{ index ? '、' : '' }}{{ death.name }}（{{ getDeathCauseLabel(death.cause) }}）
                </span>
              </p>
            </div>
            <div v-if="summary.newCharacters.length" class="log-block">
              <b>新人物</b>
              <p>
                <span v-for="(person, index) in summary.newCharacters" :key="person.name">
                  {{ index ? '、' : '' }}{{ person.name }}<span v-if="person.office">（{{ person.office }}）</span>
                </span>
              </p>
            </div>
            <div v-if="summary.newEvents.length" class="log-block">
              <b>待批</b>
              <p>{{ summary.newEvents.join('、') }}</p>
            </div>
            <p v-if="!summary.deaths.length && !summary.newCharacters.length && !summary.newEvents.length" class="empty empty-sm">
              本月暂无异常。
            </p>

            <button type="button" class="btn btn-primary btn-block summary-btn" @click="handleSummaryContinue">继 续</button>
          </div>

          <!-- 国库 -->
          <div v-else-if="view === 'treasury'" class="page">
            <header class="page-head">
              <div>
                <p class="eyebrow">度支</p>
                <h1>国库</h1>
                <p class="page-sub">全国人口 {{ formatPopulation(totalPopulation) }}</p>
              </div>
            </header>

            <div class="treasury-hero">
              <span>存银</span>
              <b>{{ formatResource('treasury', activeRun.resources.treasury) }}</b>
              <em>贯</em>
            </div>

            <section class="card">
              <div class="kv"><span>人口税</span><b class="plus">+{{ income.regionalTax }}</b></div>
              <div class="kv"><span>盐铁与杂税</span><b class="plus">+{{ income.tax - income.regionalTax }}</b></div>
              <div class="kv"><span>税入合计</span><b class="plus">+{{ income.tax }}</b></div>
              <div class="kv"><span>百官俸禄</span><b class="minus">-{{ income.salary }}</b></div>
              <div class="kv"><span>后宫用度</span><b class="minus">-{{ income.harem }}</b></div>
              <div class="kv"><span>地方行政</span><b class="minus">-{{ income.adminCost }}</b></div>
              <div class="kv"><span>军饷</span><b class="minus">-{{ income.armyUpkeep }}</b></div>
              <div class="kv"><span>本月净</span><b :class="income.net >= 0 ? 'plus' : 'minus'">{{ income.net >= 0 ? '+' : '' }}{{ income.net }}</b></div>
            </section>
            <p class="note">国库低于 2,000 贯时，民心每月 -2，军饷与俸禄开始拖欠。</p>
          </div>

          <!-- 编年史 -->
          <div v-else-if="view === 'chronicle'" class="page">
            <header class="page-head">
              <div>
                <p class="eyebrow">史册</p>
                <h1>编年史</h1>
                <p class="page-sub">{{ recentLogs.length }} 条记录</p>
              </div>
            </header>
            <p v-if="recentLogs.length === 0" class="empty">还没有可记的事。</p>
            <div v-else class="timeline">
              <div
                v-for="log in recentLogs.slice(0, 100)"
                :key="log.id"
                class="timeline-item"
                :class="logTypeClass(log.type)"
              >
                <span class="timeline-date">{{ log.year }}年{{ log.month }}月</span>
                <span class="timeline-dot"></span>
                <div class="timeline-body">
                  <b>{{ log.title }}</b>
                  <p v-if="log.desc">{{ log.desc }}</p>
                </div>
              </div>
            </div>
          </div>
        </template>
      </main>

      <!-- ===== 底部导航（移动端） ===== -->
      <nav v-if="showTabbar" class="tabbar">
        <button
          v-for="item in NAV_ITEMS"
          :key="item.key"
          type="button"
          class="tab-item"
          :class="{ 'is-active': item.key === 'more' ? (showMoreMenu || navOnMore) : navActive === item.key }"
          @click="handleNav(item.key)"
        >
          <span class="tab-glyph">
            {{ item.glyph }}
            <i v-if="item.key === 'memorials' && memorialBadge" class="tab-badge">{{ memorialBadge }}</i>
          </span>
          <span class="tab-label">{{ item.label }}</span>
        </button>
      </nav>
    </div>

    <!-- ===== 更多 ===== -->
    <div v-if="showMoreMenu" class="mask" @click.self="showMoreMenu = false">
      <div class="sheet">
        <div class="sheet-head">
          <h3>全部功能</h3>
          <button type="button" class="icon-btn" @click="showMoreMenu = false">×</button>
        </div>
        <div class="more-grid">
          <button
            v-for="item in MORE_ITEMS"
            :key="item.key"
            type="button"
            class="more-item"
            @click="handleNav(item.key)"
          >
            <b>{{ item.label }}</b>
            <small>{{ item.desc }}</small>
          </button>
        </div>
        <div class="more-foot">
          <button type="button" class="btn btn-sm" @click="toggleBlindStats">
            臣属数值：{{ blindMode ? '隐藏' : '显示' }}
          </button>
          <button type="button" class="btn btn-sm btn-ghost" @click="backToSelect">返回王朝列表</button>
        </div>
        <p class="note more-note">当前 AI：{{ llmInfo.configured ? `${llmInfo.name} · ${llmInfo.model}` : '未配置，使用本地模板' }}</p>
      </div>
    </div>

    <PortraitLightbox
      v-if="portraitLightbox"
      :url="portraitLightbox.url"
      :name="portraitLightbox.name"
      :subtitle="portraitLightbox.subtitle"
      :initial="portraitLightbox.initial"
      @close="portraitLightbox = null"
    >
      <template #actions>
        <button
          v-if="portraitLightbox.canAssign"
          type="button"
          class="btn btn-ghost btn-sm"
          @click="changePortraitFromLightbox"
        >
          更换立绘
        </button>
      </template>
    </PortraitLightbox>

    <transition name="toast">
      <button v-if="message" type="button" class="toast" @click="message = ''">{{ message }}</button>
    </transition>
  </div>
</template>

<style scoped src="./DynastyScreen.css"></style>
