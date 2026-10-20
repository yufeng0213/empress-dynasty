<script setup>
import { computed, onMounted, ref } from 'vue'
import { kvStorage } from '../storage/kv.js'
import {
  applyBiosToState,
  generateCharacterBios,
  generateEventNarrative,
  generateSceneNarrative,
} from '../game/llm.js'
import CharacterRadar from './CharacterRadar.vue'
import ChatScreen from './ChatScreen.vue'
import CityScreen from './CityScreen.vue'
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
  { key: 'court', char: '朝', label: '朝堂' },
  { key: 'memorials', char: '奏', label: '奏折' },
  { key: 'palace', char: '行', label: '出行' },
  { key: 'intel', char: '密', label: '密报' },
  { key: 'chronicle', char: '纪', label: '纪事' },
]

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
  if (selectedRole.value === 'dead') return deadCharacters.value
  const group = roleGroups.value.find((item) => item.role === selectedRole.value)
  return group?.items || []
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
  const consorts = (activeRun.value?.characters || []).filter((item) => (
    item.alive !== false && item.role === 'consort'
  ))
  const residents = {
    kunning: consorts[0] || null,
    changchun: consorts[1] || null,
    chuxiu: consorts[2] || null,
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
const isGameView = computed(() => view.value !== 'select')
// 只有游戏主界面才有底部导航，桌面端据此决定是否启用左侧栏布局
const showSideNav = computed(() => !['select', 'fate', 'chat', 'city'].includes(view.value))
// 开局相关页面在桌面端保持收拢，避免表单被拉得过宽
const isSetupView = computed(() => ['select', 'fate'].includes(view.value))
const navActive = computed(() => {
  if (['court', 'treasury', 'people', 'person', 'appointment', 'exam', 'regions', 'harem', 'selection', 'heirs', 'succession'].includes(view.value)) return 'court'
  if (['memorials', 'memorial'].includes(view.value)) return 'memorials'
  if (view.value === 'palace') return 'palace'
  if (view.value === 'intel') return 'intel'
  if (view.value === 'chronicle') return 'chronicle'
  return ''
})

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

const isPregnant = (consortId) => (
  (activeRun.value?.pregnancies || []).some((item) => item.carrierId === consortId)
)

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

const go = (target) => {
  if (target === 'palace') travelDetail.value = false
  view.value = target
  showMoreMenu.value = false
  message.value = ''
  selectedChoiceResult.value = ''
  transferFromRegionId.value = ''
  showPersonRename.value = false
}

const handleBack = () => {
  if (view.value === 'select') {
    emit('back')
    return
  }
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

onMounted(loadRuns)
</script>

<template>
  <div class="dyn-app" :class="{ 'has-nav': showSideNav, 'is-setup': isSetupView }">
    <header v-if="view !== 'chat' && view !== 'city'" class="dyn-head">
      <button type="button" class="dyn-back" aria-label="返回" @click="handleBack">‹</button>
      <div class="dyn-title">
        {{ isGameView && activeRun ? activeRun.dynastyName : '女帝 · 王朝' }}
        <span class="dyn-subtitle">{{ isGameView ? calendarText : '多代宫廷经营' }}</span>
      </div>
      <button
        v-if="isGameView"
        type="button"
        class="dyn-more-btn"
        @click="showMoreMenu = !showMoreMenu"
      >更多</button>
      <div v-else class="dyn-head-note">第一卷</div>
    </header>

    <!-- ===== 王朝选择 ===== -->
    <div v-if="view === 'select'" class="dyn-body dyn-start">
      <section class="start-hero">
        <div class="start-eyebrow">多代宫廷经营</div>
        <h1>女帝 · 王朝</h1>
        <p>一月一回合。经营朝政、纳宠、生育、立储。<br>你死后，由继承人接着走下去。</p>
        <div class="start-meta">
          <span>朝政</span>
          <span>后宫</span>
          <span>子嗣</span>
          <span>继承</span>
        </div>
        <div class="start-watermark">帝</div>
      </section>

      <section class="start-card">
        <div class="start-card-head">
          <div>
            <h2>开局后宫</h2>
            <p>0 表示不设后宫。子嗣只会由受孕与分娩产生。</p>
          </div>
          <span>可留空</span>
        </div>

        <div class="start-steppers">
          <div class="start-stepper">
            <div class="start-stepper-label">
              <b>男宠</b>
              <small>开局侍宠</small>
            </div>
            <div class="start-stepper-controls">
              <button type="button" :disabled="newConsortMale <= 0" @click="stepConsort('male', -1)">−</button>
              <strong>{{ newConsortMale }}</strong>
              <button type="button" :disabled="newConsortMale >= 12" @click="stepConsort('male', 1)">＋</button>
            </div>
          </div>
          <div class="start-stepper">
            <div class="start-stepper-label">
              <b>女宠</b>
              <small>开局侍宠</small>
            </div>
            <div class="start-stepper-controls">
              <button type="button" :disabled="newConsortFemale <= 0" @click="stepConsort('female', -1)">−</button>
              <strong>{{ newConsortFemale }}</strong>
              <button type="button" :disabled="newConsortFemale >= 12" @click="stepConsort('female', 1)">＋</button>
            </div>
          </div>
        </div>
      </section>

      <label class="start-toggle">
        <div>
          <b>隐藏臣属忠诚与野心</b>
          <small>挑战模式。只能靠风评、密报和事件判断人心。</small>
        </div>
        <span class="start-switch" :class="{ 'is-on': hideStats }"><i></i></span>
        <input v-model="hideStats" type="checkbox" />
      </label>

      <button type="button" class="start-cta" :disabled="busy" @click="openFate">
        <span>开新朝</span>
        <b>掷天命</b>
      </button>

      <div class="start-saves-head">
        <h2>已有王朝</h2>
        <span>{{ runs.length }} 卷</span>
      </div>
      <p v-if="runs.length === 0" class="dyn-empty">还没有王朝记录。开一局新的。</p>
      <div v-else class="start-saves">
        <button
          v-for="run in runs"
          :key="run.id"
          type="button"
          class="start-save"
          @click="handleContinue(run.id)"
        >
          <div class="start-save-mark">{{ (run.dynastyName || '王').slice(0, 1) }}</div>
          <div class="start-save-main">
            <b>{{ run.dynastyName }} · {{ run.eraName }}</b>
            <small>
              第 {{ run.generation || 1 }} 代 ·
              {{ run.eraName }}{{ run.calendar?.year || 1 }}年{{ run.calendar?.month || 1 }}月 ·
              {{ run.ruler?.name || '—' }}
            </small>
            <em v-if="run.status === 'succession'">待继位</em>
          </div>
          <span class="start-save-go">继续 ›</span>
        </button>
      </div>

      <p v-if="message" class="dyn-message">{{ message }}</p>
    </div>

    <!-- ===== 开局天命 ===== -->
    <div v-else-if="view === 'fate'" class="dyn-body">
      <div class="dyn-hero">
        <div class="dyn-seal">命</div>
        <p>先掷天命，再开新朝。<br>总值随机，五维偏科，确认后不能改点。</p>
      </div>

      <div class="dyn-fate-total">
        <span>天命总值</span>
        <b>{{ fateStats ? fateTotal : '—' }}</b>
        <em>{{ fateFortune }}</em>
      </div>

      <div class="dyn-fate-layout">
        <button
          type="button"
          class="dyn-fate-dice"
          :class="{ 'is-rolling': fateRolling }"
          :disabled="fateRolling || busy"
          @click="handleRollFate"
        >
          {{ fateRolling ? '…' : (fateStats ? '定' : '天命') }}
        </button>

        <div class="dyn-fate-panel">
          <div class="dyn-section">五维天命</div>
          <div class="dyn-fate-bars">
            <div v-for="key in ABILITY_KEYS" :key="key" class="dyn-fate-row">
              <span>{{ ABILITY_LABELS[key] }}</span>
              <div class="dyn-fate-track">
                <i :style="{ width: `${fateStats ? fateStats[key] : 0}%` }"></i>
              </div>
              <b>{{ fateStats ? fateStats[key] : '—' }}</b>
            </div>
          </div>
          <CharacterRadar :person="fatePerson" :size="205" />
          <p v-if="fateStats" class="dyn-note">
            主天赋 {{ ABILITY_LABELS[fateHigh] }} · 短板 {{ ABILITY_LABELS[fateLow] }}
          </p>
        </div>
      </div>

      <div class="dyn-section">开局资源预览</div>
      <div class="dyn-fate-resources">
        <div><span>国库</span><b>{{ fateStats ? `${fateResources.treasury} 贯` : '—' }}</b></div>
        <div><span>威望</span><b>{{ fateStats ? fateResources.prestige : '—' }}</b></div>
        <div><span>民心</span><b>{{ fateStats ? fateResources.popularity : '—' }}</b></div>
        <div><span>军力</span><b>{{ fateStats ? fateResources.military : '—' }}</b></div>
        <div><span>圣听</span><b>{{ fateStats ? fateResources.intelligence : '—' }}</b></div>
      </div>

      <div class="dyn-btn-row">
        <button type="button" class="dyn-btn" :disabled="fateRolling || busy" @click="handleRollFate">
          {{ fateRolled ? '重 掷' : '掷 天 命' }}
        </button>
        <button
          type="button"
          class="dyn-btn is-primary"
          :disabled="!fateStats || fateRolling || busy"
          @click="handleConfirmFate"
        >{{ busy ? '正在开局…' : '以此天命开局' }}</button>
      </div>
      <button type="button" class="dyn-btn is-block" @click="view = 'select'">返回开局设置</button>
      <p class="dyn-note">可无限重掷；确认后锁定；不能手动改点。</p>
      <p v-if="message" class="dyn-message">{{ message }}</p>
    </div>

    <!-- ===== 游戏内 ===== -->
    <template v-else-if="activeRun">
      <div class="dyn-more-menu" v-if="showMoreMenu">
        <button type="button" @click="openChat('list')">召见聊天</button>
        <button type="button" @click="openChat('duty')">值房</button>
        <button type="button" @click="openPalace">出行 · 皇宫</button>
        <button type="button" @click="openCity">出宫 · 京城</button>
        <button type="button" @click="go('people')">人物</button>
        <button type="button" @click="go('harem')">后宫</button>
        <button type="button" @click="go('heirs')">子嗣</button>
        <button type="button" @click="go('treasury')">国库收支</button>
        <button type="button" @click="go('chronicle')">编年史</button>
        <button type="button" @click="go('intel')">密报 · {{ rumors.length }}</button>
        <button type="button" @click="go('event-pool')">事件池 · {{ visibleEventDefs.length }}</button>
        <button type="button" @click="openNames">王朝名号</button>
        <button type="button" @click="toggleBlindStats">数值：{{ blindMode ? '隐藏' : '显示' }}</button>
        <button type="button" @click="backToSelect">返回王朝列表</button>
      </div>

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

      <div v-else class="dyn-body">
        <!-- 朝堂 -->
        <template v-if="view === 'court'">
          <div class="dyn-ruler">
            <div class="dyn-avatar">
              <img v-if="avatarSrc(ruler)" :src="avatarSrc(ruler)" alt="" />
              <template v-else>{{ (ruler?.name || '帝').slice(0, 1) }}</template>
            </div>
            <div class="dyn-ruler-main">
              <div class="dyn-ruler-name">
                {{ ruler?.name }}
                <span>{{ ruler?.age }} 岁</span>
              </div>
              <div class="dyn-ruler-sub">
                女帝 · 健康 {{ ruler?.health }} · 压力 {{ courtBurden.stress }} · 寿元 {{ ruler?.lifespan }} · 第 {{ activeRun.generation }} 代
              </div>
            </div>
            <div class="dyn-mark">御</div>
          </div>

          <div class="dyn-burden-strip">
            <span class="dyn-burden-label">君主状态</span>
            <span v-for="trait in courtBurden.traits" :key="trait.id" class="dyn-burden-chip is-trait">{{ trait.label }}</span>
            <span v-for="debuff in courtBurden.debuffs" :key="debuff.id" class="dyn-burden-chip is-debuff">{{ debuff.label }}</span>
            <span v-if="!courtBurden.traits.length && !courtBurden.debuffs.length" class="dyn-burden-empty">暂无负面状态</span>
          </div>

          <div class="dyn-stats">
            <div v-for="key in RESOURCE_KEYS_LIST" :key="key" class="dyn-stat">
              <div class="dyn-stat-head">
                <span>{{ RESOURCE_LABELS_MAP[key] }}</span>
                <b>{{ formatResource(key, activeRun.resources[key]) }}</b>
              </div>
              <div class="dyn-bar"><i :style="{ width: barWidth(key) }"></i></div>
            </div>
          </div>

          <div class="dyn-income">
            <span>税入 +{{ income.tax }}</span>
            <span>官俸 -{{ income.salary }}</span>
            <span>后宫 -{{ income.harem }}</span>
            <span>行政 -{{ income.adminCost }}</span>
            <span>军饷 -{{ income.armyUpkeep }}</span>
            <b :class="{ 'is-minus': income.net < 0 }">净 {{ income.net >= 0 ? '+' : '' }}{{ income.net }}</b>
          </div>

          <button
            v-if="rumors.length > 0"
            type="button"
            class="dyn-event-card is-intel"
            @click="go('intel')"
          >
            <div class="dyn-event-head">
              <span class="dyn-chip is-gold">密报</span>
              <span class="dyn-event-title">{{ rumors.length }} 条风闻</span>
            </div>
            <div class="dyn-event-text">{{ rumors[0]?.text }}</div>
            <div class="dyn-event-foot">查看 ›</div>
          </button>

          <div class="dyn-section">待批奏折 · {{ pendingEvents.length }}</div>
          <p v-if="pendingEvents.length === 0" class="dyn-empty is-compact">本旬无奏折。</p>
          <p v-if="narratingEventId" class="dyn-message is-gold">史官正在拟稿…</p>
          <button
            v-for="event in pendingEvents"
            :key="event.instanceId"
            type="button"
            class="dyn-event-card"
            @click="openEvent(event)"
          >
            <div class="dyn-event-head">
              <span class="dyn-chip" :class="event.kind === 'scene' ? 'is-violet' : 'is-red'">
                {{ event.kind === 'scene' ? '剧情' : event.source }}
              </span>
              <span class="dyn-event-title">{{ event.title }}</span>
            </div>
            <div class="dyn-event-text">{{ event.text }}</div>
            <div class="dyn-event-foot">批阅 ›</div>
          </button>

          <div class="dyn-quick">
            <button type="button" @click="openPalace">出行 <b>皇宫</b></button>
            <button type="button" @click="openCity">出宫 <b>京城</b></button>
            <button type="button" @click="openChat('list')">召见 <b>聊天</b></button>
            <button type="button" @click="openChat('duty')">值房 <b>看人</b></button>
            <button type="button" @click="go('intel')">密报 <b>{{ rumors.length }}</b></button>
            <button type="button" @click="go('treasury')">国库 <b>{{ formatResource('treasury', activeRun.resources.treasury) }}</b></button>
          </div>

          <button type="button" class="dyn-btn is-primary is-block" :disabled="!canAct" @click="handleAdvance">
            {{ busy ? '结算中…' : '过 一 月' }}
          </button>
          <p class="dyn-note">
            行动点 {{ actionPoints }} / {{ maxActionPoints }}。批阅奏折不耗行动点；侍寝、赏赐、申斥各耗 1 点。
          </p>
          <p v-if="bioStatus.running" class="dyn-message is-gold">
            AI 正在写人设 {{ bioStatus.done }} / {{ bioStatus.total }}…
          </p>
          <p v-else-if="bioStatus.failed" class="dyn-message">AI 人设生成失败，已使用本地模板。</p>
          <p v-if="message" class="dyn-message">{{ message }}</p>
        </template>

        <!-- 奏折列表 -->
        <template v-else-if="view === 'memorials'">
          <div class="dyn-section">待批 · {{ pendingEvents.length }}</div>
          <p v-if="pendingEvents.length === 0" class="dyn-empty">没有待批奏折。</p>
          <button
            v-for="event in pendingEvents"
            :key="event.instanceId"
            type="button"
            class="dyn-list-item is-clickable"
            @click="openEvent(event)"
          >
            <div class="dyn-list-main">
              <div class="dyn-list-title">{{ event.title }}</div>
              <div class="dyn-list-sub">{{ event.source }} · {{ event.text }}</div>
            </div>
            <span class="dyn-chip is-red">待批</span>
          </button>

          <div class="dyn-section">已批 · {{ archiveEvents.length }}</div>
          <p v-if="archiveEvents.length === 0" class="dyn-empty">还没有批过奏折。</p>
          <div
            v-for="item in archiveEvents.slice(0, 12)"
            :key="item.instanceId"
            class="dyn-list-item is-muted"
          >
            <div class="dyn-list-main">
              <div class="dyn-list-title">{{ item.title }}</div>
              <div class="dyn-list-sub">{{ item.missed ? '未批' : item.choiceText }}</div>
            </div>
            <span class="dyn-chip">{{ item.missed ? '积压' : '已批' }}</span>
          </div>
        </template>

        <!-- 奏折详情 -->
        <template v-else-if="view === 'memorial'">
          <template v-if="currentEvent">
            <div class="dyn-source">
              <span v-if="currentEvent.kind === 'scene'" class="dyn-chip is-violet">剧情</span>
              {{ currentEvent.source }} · {{ currentEvent.year }}年{{ currentEvent.month }}月
            </div>
            <h2 class="dyn-memorial-title">{{ currentEvent.title }}</h2>
            <div v-if="currentEvent.actors?.length" class="dyn-chips">
              <button
                v-for="actor in currentEvent.actors"
                :key="actor.id"
                type="button"
                class="dyn-chip is-gold dyn-actor-chip"
                @click="openPersonById(actor.id)"
              >
                {{ actor.name }}<span v-if="actor.office"> · {{ actor.office }}</span>
              </button>
              <button
                v-if="currentEvent.kind === 'scene' && currentEvent.actors?.[0]?.id"
                type="button"
                class="dyn-mini-btn"
                @click="openChat('audience', currentEvent.actors[0].id)"
              >召见此人</button>
            </div>
            <p v-if="narratingEventId === currentEvent.instanceId" class="dyn-message is-gold">
              史官正在拟稿…
            </p>
            <div class="dyn-prose"><p>{{ currentEvent.text }}</p></div>
            <div class="dyn-section">处置</div>
            <button
              v-for="choice in currentEvent.choices"
              :key="choice.id"
              type="button"
              class="dyn-choice"
              @click="chooseEventOption(choice)"
            >
              <div class="dyn-choice-title">{{ choice.text }}</div>
              <div class="dyn-choice-hint">{{ displayHint(choice) }}</div>
            </button>
          </template>
          <template v-else-if="selectedChoiceResult">
            <div class="dyn-result">{{ selectedChoiceResult }}</div>
            <button type="button" class="dyn-btn is-primary is-block" @click="go('memorials')">
              返回奏折
            </button>
          </template>
          <p v-else class="dyn-empty">这份奏折已经批过了。</p>
        </template>

        <!-- 人物 -->
        <template v-else-if="view === 'people'">
          <div class="dyn-tabs">
            <button
              v-for="tab in ROLE_TABS"
              :key="tab.key"
              type="button"
              class="dyn-tab"
              :class="{ active: selectedRole === tab.key }"
              @click="selectedRole = tab.key"
            >
              {{ tab.label }} <b>{{ roleCounts[tab.key] || 0 }}</b>
            </button>
          </div>
          <div class="dyn-btn-row">
            <button type="button" class="dyn-btn" @click="go('exam')">科举 · 候补 {{ examPool.length }}</button>
            <button type="button" class="dyn-btn" @click="go('regions')">地方官</button>
          </div>

          <div v-if="vacancies.length > 0" class="dyn-alert">
            <div>缺员 {{ vacancies.length }}：{{ vacancies.map((item) => item.office).join('、') }}</div>
            <button type="button" class="dyn-mini-btn" @click="go('appointment')">补缺</button>
          </div>
          <p class="dyn-note">已故 {{ deathSummary.dead }} 人 · 空缺 {{ deathSummary.vacant }} 个</p>

          <p v-if="activeRoleItems.length === 0" class="dyn-empty">这一类暂时没有人。</p>
          <div class="dyn-people-grid">
            <button
              v-for="person in activeRoleItems"
              :key="person.id"
              type="button"
              class="dyn-person-card"
              @click="openPerson(person)"
            >
              <div class="dyn-avatar is-small" :class="{ 'is-dead': person.alive === false }">
                <img
                  v-if="avatarSrc(person, true)"
                  :src="avatarSrc(person, true)"
                  alt=""
                  loading="lazy"
                />
                <template v-else>{{ person.name.slice(0, 1) }}</template>
              </div>
              <div class="dyn-person-main">
                <div class="dyn-person-name">
                  {{ person.name }}
                  <span v-if="person.alive !== false">{{ person.age }}</span>
                  <span v-else>卒 {{ formatMonthIndex(person.deathMonth) }}</span>
                </div>
                <div class="dyn-person-office">
                  <template v-if="person.alive === false">故 · </template>{{ person.office }}
                </div>
                <div class="dyn-person-chips">
                  <template v-if="person.alive === false">
                    <span class="dyn-chip is-red">{{ getDeathCauseLabel(person.deathCause) }}</span>
                    <span class="dyn-chip">{{ person.age }} 岁</span>
                  </template>
                  <template v-else-if="blindMode">
                    <span
                      class="dyn-chip"
                      :class="getReputation(person).tone ? `is-${getReputation(person).tone}` : ''"
                    >{{ getReputation(person).label }}</span>
                  </template>
                  <template v-else>
                    <span class="dyn-chip is-jade">忠 {{ person.loyalty }}</span>
                    <span class="dyn-chip" :class="{ 'is-red': person.ambition > 60 }">野 {{ person.ambition }}</span>
                  </template>
                  <span class="dyn-chip is-violet">能 {{ person.ability }}</span>
                </div>
              </div>
            </button>
          </div>
        </template>

        <!-- 人物详情 -->
        <template v-else-if="view === 'person' && currentPerson">
          <div class="dyn-detail-head">
            <div class="dyn-avatar" :class="{ 'is-dead': currentPerson.alive === false }">
              <img v-if="avatarSrc(currentPerson)" :src="avatarSrc(currentPerson)" alt="" />
              <template v-else>{{ currentPerson.name.slice(0, 1) }}</template>
            </div>
            <div>
              <h2 class="dyn-detail-title">{{ currentPerson.name }}</h2>
              <div class="dyn-muted">
                {{ currentPerson.office }} · {{ currentPerson.age }} 岁
                <span v-if="currentPerson.factionName"> · {{ currentPerson.factionName }}</span>
              </div>
              <div class="dyn-chips">
                <span v-for="tag in currentPerson.tags" :key="tag" class="dyn-chip">{{ tag }}</span>
              </div>
            </div>
          </div>

          <div v-if="showPersonRename" class="dyn-rename">
            <input
              v-model="renamePersonValue"
              type="text"
              maxlength="12"
              placeholder="新名字"
              @keyup.enter="handleRenamePerson"
            />
            <button type="button" class="dyn-mini-btn" @click="handleRenamePerson">保存</button>
            <button type="button" class="dyn-mini-btn" @click="showPersonRename = false">取消</button>
          </div>

          <div class="dyn-section">五维能力</div>
          <CharacterRadar :person="currentPerson" :size="238" />

          <template v-if="currentPerson.role === 'child'">
            <div class="dyn-section">成长</div>
            <div class="dyn-kv"><span>阶段</span><b>{{ currentPerson.stageLabel || '—' }} · {{ currentPerson.age }} 岁</b></div>
            <div class="dyn-kv"><span>亲密度</span><b>{{ currentPerson.intimacy ?? 60 }}</b></div>
            <div class="dyn-kv"><span>声望</span><b>{{ currentPerson.reputation ?? 0 }}</b></div>
            <div class="dyn-kv"><span>婚约</span><b>{{ marriageStatusLabel(currentPerson.marriageStatus) }}</b></div>
            <div v-if="childSpouse" class="dyn-kv"><span>配偶</span><b>{{ childSpouse.name }} · {{ childSpouse.office }}</b></div>

            <div class="dyn-btn-row">
              <button type="button" class="dyn-btn" :disabled="!canAct" @click="handleChildAction('visit')">探望</button>
              <button type="button" class="dyn-btn" :disabled="!canAct || currentPerson.age < 5" @click="handleChildAction('study')">考课</button>
              <button type="button" class="dyn-btn" :disabled="!canAct || currentPerson.age < 8" @click="handleChildAction('drill')">骑射</button>
              <button type="button" class="dyn-btn" :disabled="!canAct || currentPerson.age < 5" @click="handleChildAction('warn')">训诫</button>
              <button
                v-if="currentPerson.age >= 14 && currentPerson.marriageStatus === 'single'"
                type="button"
                class="dyn-btn"
                @click="handleChildMarriageStart"
              >议婚</button>
              <button
                v-if="currentPerson.id !== activeRun.designatedHeirId"
                type="button"
                class="dyn-btn"
                :disabled="!canAct"
                @click="handleDesignate(currentPerson)"
              >立储</button>
            </div>

            <div v-if="childSiblingRows.length" class="dyn-section">手足</div>
            <div v-for="row in childSiblingRows" :key="row.id" class="dyn-kv">
              <span>{{ row.name }}</span>
              <b :class="row.value < 0 ? 'is-minus' : 'is-plus'">{{ row.value > 0 ? '+' : '' }}{{ row.value }}</b>
            </div>

            <div v-if="currentPerson.id === activeRun.designatedHeirId" class="dyn-section">东宫</div>
            <template v-if="currentPerson.id === activeRun.designatedHeirId">
              <div class="dyn-kv"><span>东宫势力</span><b>{{ heirInfluence }}</b></div>
              <div class="dyn-bar is-violet"><i :style="{ width: `${heirInfluence}%` }"></i></div>
              <p class="dyn-note">60 开始结党，80 出现逼宫风险。</p>

              <div v-for="supporter in heirSupporters" :key="supporter.id" class="dyn-selection-card">
                <div class="dyn-selection-name">
                  {{ supporter.name }}
                  <span>{{ supporter.office }} · {{ supporter.roleTag }}</span>
                </div>
                <div class="dyn-kv">
                  <span>忠诚</span>
                  <b>对君 {{ supporter.rulerLoyalty }} · 对太子 {{ supporter.heirLoyalty }}</b>
                </div>
                <div class="dyn-kv"><span>影响</span><b>{{ supporter.impact }} · {{ supporter.status }}</b></div>
                <div class="dyn-btn-row">
                  <button type="button" class="dyn-btn" :disabled="!canAct" @click="handleHeirSupporter(supporter.id, 'audience')">召见</button>
                  <button type="button" class="dyn-btn" :disabled="!canAct" @click="handleHeirSupporter(supporter.id, 'heir_choose')">让太子自选</button>
                  <button type="button" class="dyn-btn is-danger" :disabled="!canAct" @click="handleHeirSupporter(supporter.id, 'suppress')">裁抑</button>
                </div>
              </div>
            </template>

            <template v-if="childMarriage && childMarriage.childId === currentPerson.id">
              <div class="dyn-section">议婚候选</div>
              <div
                v-for="candidate in childMarriage.candidates"
                :key="candidate.id"
                class="dyn-selection-card"
              >
                <div class="dyn-selection-name">
                  {{ candidate.name }}
                  <span>{{ candidate.gender }} · {{ candidate.age }} 岁</span>
                </div>
                <div class="dyn-muted">{{ candidate.family }} · {{ candidate.origin }}</div>
                <div class="dyn-kv">
                  <span>五维</span>
                  <b>
                    文{{ candidate.civil }} 武{{ candidate.military }} 智{{ candidate.strategy }}
                    魅{{ candidate.charm }} 财{{ candidate.finance }}
                  </b>
                </div>
                <div class="dyn-btn-row">
                  <button type="button" class="dyn-btn is-primary" @click="handleChildMarriageChoice(candidate.id, 'approve')">定亲 · 800贯</button>
                  <button type="button" class="dyn-btn" @click="handleChildMarriageChoice(candidate.id, 'refuse')">拒绝</button>
                  <button type="button" class="dyn-btn" @click="handleChildMarriageChoice(candidate.id, 'delay')">暂缓</button>
                </div>
              </div>
            </template>

            <template v-if="childSecretAffair?.active">
              <div class="dyn-section">私会</div>
              <div class="dyn-kv">
                <span>{{ childSecretAffair.candidate?.name || '某人' }}</span>
                <b>阶段 {{ (childSecretAffair.stage || 0) + 1 }} / 4 · 风闻 {{ childSecretAffair.scandal || 0 }}</b>
              </div>
              <p class="dyn-note">拒婚后仍在私下往来。风闻越高，越可能传到御史台。</p>
              <div class="dyn-btn-row">
                <button type="button" class="dyn-btn is-primary" @click="handleChildSecret('allow')">成全 · 500贯</button>
                <button type="button" class="dyn-btn" @click="handleChildSecret('separate')">拆散</button>
                <button type="button" class="dyn-btn" @click="handleChildSecret('suppress')">压下</button>
                <button type="button" class="dyn-btn is-danger" @click="handleChildSecret('punish')">公开惩处</button>
              </div>
            </template>

            <template v-if="currentPerson.marriageStatus === 'betrothed'">
              <div class="dyn-section">大婚</div>
              <p class="dyn-note">定亲后三个月内可举行大婚。礼制越铺张，威望与姻亲越稳，国库越吃紧。</p>
              <div class="dyn-btn-row">
                <button
                  v-for="(level, key) in weddingLevels"
                  :key="key"
                  type="button"
                  class="dyn-btn"
                  @click="handleChildWedding(key)"
                >{{ level.label }} · {{ level.cost }}贯</button>
              </div>
            </template>

            <template v-if="currentPerson.marriageStatus === 'married'">
              <div class="dyn-section">婚后</div>
              <div class="dyn-kv"><span>大婚</span><b>{{ currentPerson.weddingScale || '已成婚' }}</b></div>
              <div class="dyn-kv"><span>子女</span><b>{{ (currentPerson.childrenIds || []).length }}</b></div>
              <div v-if="childPregnancy" class="dyn-kv"><span>有孕</span><b>待产</b></div>
              <p class="dyn-note">异性婚姻会按月判定自然生育；同性婚姻或无子女时，可过继宗室子女。</p>
              <button type="button" class="dyn-btn" @click="handleAdoptChild">过继宗室子女 · 300贯</button>
            </template>
          </template>

          <div v-if="currentPerson.alive === false" class="dyn-death-note">
            <div class="dyn-kv"><span>卒于</span><b>{{ formatMonthIndex(currentPerson.deathMonth) }}</b></div>
            <div class="dyn-kv"><span>死因</span><b>{{ getDeathCauseLabel(currentPerson.deathCause) }}</b></div>
            <div class="dyn-kv"><span>享年</span><b>{{ currentPerson.age }} 岁</b></div>
          </div>

          <div v-if="currentPerson.rank > 0" class="dyn-kv">
            <span>品级</span>
            <b>{{ getRankLabel(currentPerson.rank) }} · 任 {{ currentPerson.tenureMonths || 0 }} 月</b>
          </div>
          <div v-if="currentPerson.regionName" class="dyn-kv">
            <span>外任</span><b>{{ currentPerson.regionName }}</b>
          </div>
          <div v-if="currentPerson.rank > 0" class="dyn-kv">
            <span>考成</span><b>{{ currentPerson.performance || 0 }}</b>
          </div>
          <div v-if="currentPerson.examCohort" class="dyn-kv">
            <span>科第</span>
            <b>{{ currentPerson.examCohort }}年{{ currentPerson.examRank || '进士' }}</b>
          </div>
          <div v-if="currentPerson.examMasterName" class="dyn-kv">
            <span>座师</span><b>{{ currentPerson.examMasterName }}</b>
          </div>
          <div
            v-if="currentPerson.recommendedByName && currentPerson.recommendedByName !== currentPerson.examMasterName"
            class="dyn-kv"
          >
            <span>举荐</span><b>{{ currentPerson.recommendedByName }}</b>
          </div>

          <div v-if="currentPerson.role === 'consort'" class="dyn-kv">
            <span>入宫</span><b>{{ getConsortSourceLabel(currentPerson) }}</b>
          </div>
          <div v-if="currentPerson.patronName" class="dyn-kv">
            <span>恩主</span><b>{{ currentPerson.patronName }}</b>
          </div>

          <div v-if="blindMode" class="dyn-reputation">
            <span
              class="dyn-chip"
              :class="getReputation(currentPerson).tone ? `is-${getReputation(currentPerson).tone}` : ''"
            >风评：{{ getReputation(currentPerson).label }}</span>
            <p>忠诚与野心已隐藏。可用密报、事件与言行判断，或提高圣听。</p>
          </div>
          <div v-if="currentPerson.exposed" class="dyn-alert">
            此人已被密探查实：结党、挪用银钱。可下狱处置。
          </div>

          <div v-for="metric in personMetrics" :key="metric.key" class="dyn-metric">
            <div class="dyn-metric-head">
              <span>{{ metric.label }}</span>
              <b>{{ metric.value }}</b>
            </div>
            <div class="dyn-bar" :class="`is-${metric.tone}`"><i :style="{ width: `${metric.value}%` }"></i></div>
          </div>

          <div class="dyn-section">人设</div>
          <p class="dyn-bio">{{ currentPerson.bio || personFallbackBio(currentPerson) }}</p>
          <div v-if="currentPerson.appearance" class="dyn-kv"><span>外貌</span><b>{{ currentPerson.appearance }}</b></div>
          <div v-if="currentPerson.speechStyle" class="dyn-kv"><span>说话</span><b>{{ currentPerson.speechStyle }}</b></div>

          <div v-if="currentPerson.alive !== false" class="dyn-btn-row">
            <button type="button" class="dyn-btn" :disabled="!canAct" @click="handleInteract('reward')">赏赐</button>
            <button type="button" class="dyn-btn" :disabled="!canAct" @click="handleInteract('warn')">申斥</button>
            <button type="button" class="dyn-btn" @click="openPersonRename">改名</button>
            <button type="button" class="dyn-btn" @click="openChat('chat', currentPerson.id)">召见</button>
            <button type="button" class="dyn-btn" @click="openChat('audience', currentPerson.id)">奏对</button>
            <button
              v-if="currentPerson.rank > 0"
              type="button"
              class="dyn-btn"
              :disabled="!canAct"
              @click="handleChangeRank('up')"
            >升迁</button>
            <button
              v-if="currentPerson.rank > 0"
              type="button"
              class="dyn-btn"
              :disabled="!canAct"
              @click="handleChangeRank('down')"
            >贬黜</button>
            <button
              v-if="currentPerson.rank > 0"
              type="button"
              class="dyn-btn"
              :disabled="!canAct"
              @click="handleRecommend"
            >令其举荐</button>
            <button
              v-if="currentPerson.exposed"
              type="button"
              class="dyn-btn is-danger"
              :disabled="!canAct"
              @click="handlePurge"
            >下狱</button>
          </div>

          <template v-if="currentPerson.alive === false">
            <div class="dyn-section">丧仪</div>
            <div v-if="currentPerson.funeralLevel" class="dyn-kv">
              <span>已治丧</span>
              <b>{{ FUNERAL_LEVELS[currentPerson.funeralLevel]?.label }} · 追封 {{ currentPerson.posthumousTitle }}</b>
            </div>
            <div v-else class="dyn-funeral-grid">
              <button
                v-for="level in FUNERAL_LEVEL_LIST"
                :key="level.id"
                type="button"
                class="dyn-funeral-btn"
                :disabled="busy || activeRun.resources.treasury < level.cost"
                @click="handleFuneral(level.id)"
              >
                <b>{{ level.label }}</b>
                <span>{{ level.cost }} 贯</span>
                <em>{{ level.desc }}</em>
              </button>
            </div>
            <p class="dyn-note">
              治丧会提高民心与威望，安抚同派系；侍宠的子女会因此获得继承合法性。
            </p>
          </template>

          <p v-if="message" class="dyn-message">{{ message }}</p>
        </template>

        <!-- 后宫 -->
        <template v-else-if="view === 'harem'">
          <div class="dyn-tension">
            <span>后宫张力</span>
            <b>{{ haremTension.tension }}</b>
            <span class="dyn-tension-sub">
              平均危险 {{ haremTension.avgDanger }} · 有孕 {{ haremTension.pregnantCount }} · {{ consorts.length }} 人
            </span>
          </div>

          <button
            type="button"
            class="dyn-btn is-block"
            :disabled="busy"
            @click="handleStartSelection"
          >
            {{ selectionCandidates.length > 0 ? '查看选秀名册' : `开选秀（${SELECTION_COST} 贯）` }}
          </button>
          <p class="dyn-note">
            选秀每半年一次。臣属也会进献；带恩主入宫的人，平时会替恩主说话。
          </p>

          <div class="dyn-section">孕事</div>
          <p v-if="pregnancies.length === 0" class="dyn-empty">宫中暂无身孕。</p>
          <div v-for="item in pregnancies" :key="item.id" class="dyn-pregnancy">
            <div class="dyn-avatar is-small is-violet">
              <img
                v-if="avatarSrc(item.carrier, true)"
                :src="avatarSrc(item.carrier, true)"
                alt=""
                loading="lazy"
              />
              <template v-else>{{ item.carrier?.name?.slice(0, 1) || '孕' }}</template>
            </div>
            <div class="dyn-preg-main">
              <div class="dyn-preg-title">{{ item.carrier?.name || '侍宠' }}</div>
              <div class="dyn-preg-sub">
                孕 {{ item.progress.elapsed }} / {{ item.progress.total }} 月 · 预计 {{ item.progress.remaining }} 月后分娩
              </div>
              <div class="dyn-progress"><i :style="{ width: `${item.progress.percent}%` }"></i></div>
            </div>
          </div>

          <div class="dyn-section">侍寝 · 行动点 {{ actionPoints }} / {{ maxActionPoints }}</div>
          <p v-if="consorts.length === 0" class="dyn-empty">后宫无人。</p>
          <div v-for="person in consorts" :key="person.id" class="dyn-list-item">
            <div class="dyn-list-main">
              <div class="dyn-list-title">
                {{ person.name }}
                <span class="dyn-chip">{{ person.gender }}</span>
              </div>
              <div class="dyn-list-sub">
                {{ getConsortSourceLabel(person) }} · {{ person.office }} · {{ (person.tags || []).join('、') }}
                <template v-if="blindMode">
                  · 风评 {{ getHaremDisposition(getHaremProfile(person)).label }}
                </template>
                <template v-else>
                  · 危险 {{ getHaremProfile(person).danger }}
                </template>
                · 受孕 {{ person.fertility }} · 健康 {{ person.health }}
                <span v-if="isPregnant(person.id)"> · 有孕</span>
              </div>
            </div>
            <button
              type="button"
              class="dyn-mini-btn"
              :disabled="!canAct || actionPoints <= 0 || isPregnant(person.id)"
              @click="handleArrange(person)"
            >安排</button>
          </div>
          <p v-if="message" class="dyn-message">{{ message }}</p>
          <p class="dyn-note">仙侠设定：男女侍宠皆可受孕。受孕率与双方生育、健康、年龄有关。</p>
        </template>

        <!-- 科举 -->
        <template v-else-if="view === 'exam'">
          <div class="dyn-section">科举 · 候补 {{ examPool.length }}</div>
          <button
            type="button"
            class="dyn-btn is-primary is-block"
            :disabled="busy || activeRun.resources.treasury < EXAM_COST"
            @click="handleStartExam"
          >开科取士 · {{ EXAM_COST }} 贯</button>
          <p class="dyn-note">新科进士进入候补池；补缺时优先从候补中选人。</p>

          <p v-if="examPool.length === 0" class="dyn-empty">候补池是空的。</p>
          <div v-for="candidate in examPool" :key="candidate.id" class="dyn-list-item">
            <div class="dyn-list-main">
              <div class="dyn-list-title">
                {{ candidate.name }}
                <span class="dyn-chip is-gold">{{ candidate.examRank || '进士' }}</span>
              </div>
              <div class="dyn-list-sub">
                {{ candidate.age }} 岁 · 能力 {{ candidate.ability }}
                <template v-if="candidate.examCohort"> · {{ candidate.examCohort }}年{{ candidate.examRank || '进士' }}</template>
                <template v-if="candidate.examMasterName"> · 座师{{ candidate.examMasterName }}</template>
                · {{ (candidate.tags || []).join('、') }}
              </div>
            </div>
            <span class="dyn-chip">{{ getRankLabel(candidate.rank) }}</span>
          </div>
          <p v-if="message" class="dyn-message">{{ message }}</p>
        </template>

        <!-- 地方官 -->
        <template v-else-if="view === 'regions'">
          <div class="dyn-section">地方 · 月入约 {{ regionalTax }} 贯</div>
          <div v-for="region in regions" :key="region.id" class="dyn-region">
            <div class="dyn-region-head">
              <div>
                <div class="dyn-region-name">{{ region.name }}</div>
                <div class="dyn-muted">
                  {{ region.desc }} · 人口 {{ formatPopulation(region.population) }}
                </div>
              </div>
              <div class="dyn-region-risk" :class="{ 'is-danger': region.unrest >= 60 }">
                风险 {{ region.unrest }}
              </div>
            </div>

            <template v-if="getRegionGovernor(activeRun, region)">
              <div class="dyn-kv">
                <span>刺史</span>
                <b>
                  {{ getRegionGovernor(activeRun, region).name }}
                  · {{ getRankLabel(getRegionGovernor(activeRun, region).rank) }}
                </b>
              </div>
              <div class="dyn-kv">
                <span>考成</span>
                <b>{{ getRegionGovernor(activeRun, region).performance || 0 }}</b>
              </div>
              <div class="dyn-btn-row">
                <button type="button" class="dyn-btn" :disabled="!canAct" @click="handleGovernorAction(region, 'audience')">召见</button>
                <button type="button" class="dyn-btn" :disabled="!canAct" @click="handleGovernorAction(region, 'reward')">嘉奖</button>
                <button type="button" class="dyn-btn" :disabled="!canAct" @click="handleGovernorAction(region, 'reprimand')">申斥</button>
                <button
                  type="button"
                  class="dyn-btn"
                  :disabled="!canAct"
                  @click="transferFromRegionId = transferFromRegionId === region.id ? '' : region.id"
                >调任</button>
              </div>
              <div v-if="transferFromRegionId === region.id" class="dyn-transfer">
                <span>调往：</span>
                <button
                  v-for="other in regions.filter((item) => item.id !== region.id)"
                  :key="other.id"
                  type="button"
                  class="dyn-mini-btn"
                  :disabled="!getRegionGovernor(activeRun, other)"
                  @click="handleTransfer(other)"
                >{{ other.name }}</button>
                <button type="button" class="dyn-mini-btn" @click="transferFromRegionId = ''">取消</button>
              </div>
            </template>
            <template v-else>
              <p class="dyn-empty">暂无主官，需要补缺。</p>
              <button type="button" class="dyn-btn is-block" @click="go('appointment')">去补缺</button>
            </template>
          </div>
          <p v-if="message" class="dyn-message">{{ message }}</p>
          <p class="dyn-note">
            地方官每月产税，治安越低税越少；召见耗 1 行动点，嘉奖 150 贯，申斥会压野心但伤好感。
          </p>
        </template>

        <!-- 补缺 -->
        <template v-else-if="view === 'appointment'">
          <div class="dyn-section">缺员 · {{ vacancies.length }}</div>
          <p v-if="vacancies.length === 0" class="dyn-empty">没有缺员。</p>

          <div
            v-for="(vacancy, index) in vacancies"
            :key="vacancy.office"
            class="dyn-list-item"
          >
            <div class="dyn-list-main">
              <div class="dyn-list-title">{{ vacancy.office }}</div>
              <div class="dyn-list-sub">
                {{ vacancy.role === 'clan' ? '宗室' : (vacancy.role === 'servant' ? '侍从' : '朝臣') }}
                · {{ vacancy.factionName || '无派系' }} · {{ vacancy.month }} 月起空置
              </div>
            </div>
            <button
              type="button"
              class="dyn-mini-btn"
              :disabled="busy"
              @click="handleStartAppointment(index)"
            >择人</button>
          </div>

          <template v-if="appointment">
            <div class="dyn-section">{{ appointment.vacancyOffice }} · 候选人</div>
            <div
              v-for="candidate in appointmentCandidates"
              :key="candidate.id"
              class="dyn-selection-card"
            >
              <div class="dyn-selection-head">
                <div class="dyn-avatar is-small">
                  <img
                    v-if="avatarSrc(candidate, true)"
                    :src="avatarSrc(candidate, true)"
                    alt=""
                    loading="lazy"
                  />
                  <template v-else>{{ candidate.name.slice(0, 1) }}</template>
                </div>
                <div>
                  <div class="dyn-selection-name">
                    {{ candidate.name }}
                    <span>{{ candidate.gender }} · {{ candidate.age }} 岁</span>
                  </div>
                  <div class="dyn-muted">{{ (candidate.tags || []).join('、') }}</div>
                </div>
              </div>
              <div class="dyn-kv"><span>能力</span><b>{{ candidate.ability }}</b></div>
              <div class="dyn-kv"><span>健康</span><b>{{ candidate.health }}</b></div>
              <div v-if="!blindMode" class="dyn-kv"><span>忠诚 / 野心</span><b>{{ candidate.loyalty }} / {{ candidate.ambition }}</b></div>
              <button
                type="button"
                class="dyn-btn is-primary is-block"
                :disabled="busy || activeRun.resources.treasury < APPOINT_COST"
                @click="handleAppoint(candidate)"
              >任命 · {{ APPOINT_COST }} 贯</button>
            </div>
            <button type="button" class="dyn-btn is-block" @click="handleCancelAppointment">取消</button>
          </template>

          <p v-if="message" class="dyn-message">{{ message }}</p>
          <p class="dyn-note">补缺需 {{ APPOINT_COST }} 贯。任命后由 AI 补写人设。</p>
        </template>

        <!-- 选秀 -->
        <template v-else-if="view === 'selection'">
          <div class="dyn-section">选秀名册 · {{ selectionCandidates.length }}</div>
          <p class="dyn-note">纳入后宫需 {{ SELECTION_COST }} 贯。名册只在本次选秀有效。</p>

          <p v-if="selectionCandidates.length === 0" class="dyn-empty">名册已空。</p>
          <div
            v-for="candidate in selectionCandidates"
            :key="candidate.id"
            class="dyn-selection-card"
          >
            <div class="dyn-selection-head">
              <div class="dyn-avatar is-small">{{ candidate.name.slice(0, 1) }}</div>
              <div>
                <div class="dyn-selection-name">
                  {{ candidate.name }}
                  <span>{{ candidate.gender }} · {{ candidate.age }} 岁</span>
                </div>
                <div class="dyn-muted">{{ candidate.office }} · {{ (candidate.tags || []).join('、') }}</div>
              </div>
            </div>
            <div class="dyn-kv"><span>能力</span><b>{{ candidate.ability }}</b></div>
            <div class="dyn-kv"><span>健康</span><b>{{ candidate.health }}</b></div>
            <div class="dyn-kv"><span>生育</span><b>{{ candidate.fertility }}</b></div>
            <button
              type="button"
              class="dyn-btn is-primary is-block"
              :disabled="busy || activeRun.resources.treasury < SELECTION_COST"
              @click="handleRecruitConsort(candidate)"
            >纳入后宫 · {{ SELECTION_COST }} 贯</button>
          </div>

          <button type="button" class="dyn-btn is-block" @click="handleCancelSelection">遣回名册</button>
          <p v-if="message" class="dyn-message">{{ message }}</p>
        </template>

        <!-- 子嗣 -->
        <template v-else-if="view === 'heirs'">
          <div class="dyn-section">子嗣 · {{ children.length }}</div>
          <p v-if="children.length === 0" class="dyn-empty">还没有子嗣。</p>
          <div v-for="child in children" :key="child.id" class="dyn-list-item">
            <div class="dyn-list-main">
              <div class="dyn-list-title">
                {{ child.name }}
                <span v-if="child.id === activeRun.designatedHeirId" class="dyn-chip is-gold">储君</span>
              </div>
              <div class="dyn-list-sub">
                {{ child.office }} · {{ child.age }} 岁 · {{ child.stageLabel || '成长中' }}
                · 亲密 {{ child.intimacy ?? 60 }} · {{ marriageStatusLabel(child.marriageStatus) }}
                · 天赋 {{ child.ability }}
              </div>
            </div>
            <div class="dyn-list-actions">
              <button type="button" class="dyn-mini-btn" @click="openPerson(child)">详情</button>
              <button
                type="button"
                class="dyn-mini-btn"
                :disabled="child.id === activeRun.designatedHeirId"
                @click="handleDesignate(child)"
              >{{ child.id === activeRun.designatedHeirId ? '已立' : '立储' }}</button>
            </div>
          </div>
          <p v-if="message" class="dyn-message">{{ message }}</p>
          <p class="dyn-note">不立储时，女帝驾崩后将进入争位流程；未满 6 岁的子嗣不参与争位。</p>
        </template>

        <!-- 争位 -->
        <template v-else-if="view === 'struggle' && succession">
          <div class="dyn-alert">{{ succession.deathLog }}</div>
          <div class="dyn-section">
            争位 · 第 {{ succession.round }} / 3 轮
          </div>
          <div v-for="candidate in succession.candidates" :key="candidate.id" class="dyn-list-item">
            <div class="dyn-list-main">
              <div class="dyn-list-title">
                {{ candidate.name }}
                <span class="dyn-chip">{{ candidate.office }}</span>
              </div>
              <div class="dyn-list-sub">
                合法性 {{ candidate.legitimacy }} · 支持 {{ candidate.support || 0 }}
              </div>
            </div>
            <b class="dyn-score">{{ candidate.score }}</b>
          </div>

          <div class="dyn-section">各方</div>
          <div v-for="factionItem in succession.factions" :key="factionItem.id" class="dyn-kv">
            <span>{{ factionItem.name }}</span>
            <b>{{ factionItem.power }}</b>
          </div>

          <button
            v-if="!succession.winnerId"
            type="button"
            class="dyn-btn is-primary is-block"
            :disabled="busy"
            @click="handleStruggleRound"
          >推进一轮</button>
          <button
            v-else
            type="button"
            class="dyn-btn is-primary is-block"
            @click="go('succession')"
          >进入继位</button>
          <p class="dyn-note">胜负由合法性、各派支持与三轮博弈决定；LLM 只负责叙述。</p>
        </template>

        <!-- 继位 -->
        <template v-else-if="view === 'succession' && succession">
          <div class="dyn-ending">
            <div class="dyn-seal">嗣</div>
            <h2 class="dyn-ending-title">{{ successionWinner?.name || '新君' }} 继位</h2>
            <p class="dyn-ending-sub">
              第 {{ activeRun.generation + 1 }} 代 · 合法性 {{ successionWinner?.legitimacy || 0 }}
            </p>
          </div>

          <div class="dyn-section">新朝</div>
          <label class="dyn-field">
            <span>国号</span>
            <input v-model="newDynastyName" type="text" maxlength="8" />
          </label>
          <label class="dyn-field">
            <span>年号</span>
            <input v-model="newEraName" type="text" maxlength="8" placeholder="留空则自动拟定" />
          </label>

          <div class="dyn-kv"><span>国库继承</span><b>{{ formatResource('treasury', activeRun.resources.treasury) }}</b></div>
          <div class="dyn-kv"><span>朝臣留任</span><b>{{ activeRun.characters.filter((item) => item.alive !== false).length }} 人</b></div>
          <div class="dyn-kv"><span>旧帝</span><b>{{ ruler?.name }} · {{ activeRun.eraName }}{{ activeRun.calendar.year }}年</b></div>
          <div class="dyn-kv"><span>在位</span><b>{{ activeRun.calendar.year }} 年</b></div>
          <div class="dyn-kv"><span>子嗣</span><b>{{ children.length }} 人</b></div>

          <p class="dyn-bio">{{ endingEvaluation }}</p>

          <button type="button" class="dyn-btn is-primary is-block" @click="handleConfirmSuccession">
            继 位 · 改 元
          </button>
          <p class="dyn-note">新君继位后，朝臣忠诚按合法性重算；旧帝的私交不继承。</p>
          <p v-if="message" class="dyn-message">{{ message }}</p>
        </template>

        <!-- 出行 -->
        <template v-else-if="view === 'palace'">
          <template v-if="!travelDetail">
            <div class="dyn-section">出行 · 皇宫 · 行动点 {{ actionPoints }} / {{ maxActionPoints }}</div>
            <div class="dyn-travel-overview">
              <button
                v-for="room in travelRooms"
                :key="room.id"
                type="button"
                class="dyn-travel-room"
                @click="handlePalaceRoom(room)"
              >
                <span class="dyn-travel-room-portrait">
                  <img v-if="avatarSrc(room.resident)" :src="avatarSrc(room.resident)" alt="" />
                  <template v-else>{{ room.resident ? room.resident.name.slice(0, 1) : room.name.slice(0, 1) }}</template>
                </span>
                <span class="dyn-travel-room-body">
                  <b>{{ room.name }}</b>
                  <small>{{ room.resident ? room.resident.name : '没有固定居住者' }}</small>
                  <em>{{ room.resident ? (room.resident.office || '侍宠') : room.subtitle }}</em>
                </span>
              </button>
            </div>
            <p class="dyn-travel-tip">去坤宁宫、长春宫、储秀宫可以留宿；御花园会遇见人。</p>
            <div class="dyn-palace-meta">
              <span>体力 {{ ruler?.health ?? '—' }}</span>
              <span>宫门令：{{ palace?.gatePass ? '有' : '无' }}</span>
              <span>后宫张力 {{ palaceTension }}</span>
              <span>{{ palaceMode === 'night' ? '夜巡' : '白日常朝' }}</span>
            </div>
          </template>

          <template v-else>
            <button type="button" class="dyn-travel-back" @click="closeTravelDetail">‹ 返回宫室</button>
            <div class="dyn-travel-hero">
              <img v-if="avatarSrc(palaceRoomResident)" :src="avatarSrc(palaceRoomResident)" alt="" />
              <div v-else class="dyn-travel-hero-placeholder">{{ palaceRoom.name.slice(0, 1) }}</div>
              <div class="dyn-travel-hero-shade"></div>
              <div class="dyn-travel-hero-name">
                <h2>{{ palaceRoom.name }}</h2>
                <p v-if="palaceRoomResident">
                  {{ palaceRoomResident.name }} · {{ palaceRoomResident.office || '侍宠' }}
                  · 好感 {{ palaceRoomResident.loyalty ?? 50 }}
                  · 健康 {{ palaceRoomResident.health ?? 70 }}
                </p>
                <p v-else>{{ palaceRoom.subtitle }}</p>
                <div class="dyn-chips">
                  <span v-for="tag in palaceRoom.tags" :key="tag" class="dyn-chip">{{ tag }}</span>
                </div>
              </div>
            </div>

            <div class="dyn-travel-detail">
              <p class="dyn-travel-desc">{{ palaceRoom.desc }}</p>
              <div class="dyn-palace-mode">
                <button
                  type="button"
                  :class="{ active: palaceMode === 'day' }"
                  @click="handlePalaceMode('day')"
                >白日常朝</button>
                <button
                  type="button"
                  :class="{ active: palaceMode === 'night' }"
                  @click="handlePalaceMode('night')"
                >夜巡</button>
              </div>

              <p
                v-if="palaceMode === 'night' && palaceRoom.zone === 'inner' && !palace?.gatePass"
                class="dyn-gate-warning"
              >
                夜入内廷需宫门令。先去乾清门「领宫门令」，否则会被禁军盘问。
              </p>

              <div class="dyn-palace-actions">
                <button
                  v-for="action in palaceRoom.actions"
                  :key="action.id"
                  type="button"
                  class="dyn-palace-action"
                  :disabled="busy || actionPoints < action.cost || (action.special === 'token' && palace?.gatePass)"
                  @click="handlePalaceAction(action)"
                >
                  <span>
                    <b>{{ action.label }}</b>
                    <small>{{ action.desc }}</small>
                  </span>
                  <em>{{ action.special === 'token' && palace?.gatePass ? '已领' : `${action.cost} 行动点` }}</em>
                </button>
              </div>
            </div>
          </template>

          <div v-if="palaceEncounter" class="dyn-palace-encounter">
            <div class="dyn-palace-encounter-head">
              <div class="dyn-palace-encounter-face">
                <img v-if="avatarSrc(palaceActorCharacter)" :src="avatarSrc(palaceActorCharacter)" alt="" />
                <template v-else>{{ palaceEncounter.actor?.name?.slice(0, 1) }}</template>
              </div>
              <div>
                <h3>{{ palaceEncounter.title }}</h3>
                <div class="dyn-muted">
                  {{ palaceEncounter.roomName }} · {{ palaceEncounter.actionName }}
                  · {{ palaceEncounter.actor?.name }}（{{ palaceEncounter.actor?.label }}）
                </div>
              </div>
            </div>
            <p class="dyn-palace-text">{{ palaceEncounter.text }}</p>
            <div class="dyn-palace-choices">
              <button
                v-for="choice in palaceEncounter.choices"
                :key="choice.id"
                type="button"
                :disabled="busy"
                @click="handlePalaceChoice(choice)"
              >
                <b>{{ choice.text }}</b>
                <small>{{ choice.hint }}</small>
              </button>
            </div>
            <button type="button" class="dyn-mini-btn" @click="handlePalaceCancel">先不处置</button>
          </div>
          <div v-else-if="palaceResult" class="dyn-result">{{ palaceResult }}</div>

          <p v-if="message" class="dyn-message">{{ message }}</p>
        </template>

        <!-- 事件池 -->
        <template v-else-if="view === 'event-pool'">
          <div class="dyn-section">事件池 · {{ visibleEventDefs.length }}</div>
          <p class="dyn-note">
            手动停用不想再看到的事件；只影响之后的抽取，不影响已经生成的奏折。
          </p>
          <div v-for="def in visibleEventDefs" :key="def.id" class="dyn-list-item">
            <div class="dyn-list-main">
              <div class="dyn-list-title">
                {{ def.title }}
                <span class="dyn-chip">{{ def.source }}</span>
                <span v-if="!isEventEnabled(def.id)" class="dyn-chip is-red">已停用</span>
              </div>
              <div class="dyn-list-sub">权重 {{ def.weight }} · 冷却 {{ def.cooldown }} 月</div>
            </div>
            <button
              type="button"
              class="dyn-mini-btn"
              @click="handleToggleEvent(def)"
            >{{ isEventEnabled(def.id) ? '停用' : '启用' }}</button>
          </div>
          <p v-if="message" class="dyn-message">{{ message }}</p>
        </template>

        <!-- 王朝名号 -->
        <template v-else-if="view === 'names'">
          <div class="dyn-section">王朝名号</div>
          <label class="dyn-field">
            <span>国号</span>
            <input v-model="dynastyNameDraft" type="text" maxlength="8" />
          </label>
          <label class="dyn-field">
            <span>年号</span>
            <input v-model="eraNameDraft" type="text" maxlength="6" />
          </label>
          <label class="dyn-field">
            <span>君主名</span>
            <input v-model="rulerNameDraft" type="text" maxlength="12" />
          </label>
          <button type="button" class="dyn-btn is-primary is-block" :disabled="busy" @click="handleSaveNames">
            保 存
          </button>
          <p class="dyn-note">
            国号最多 8 字，年号最多 6 字，人名最多 12 字。改名不会改写已经写下的历史记录。
          </p>
          <p v-if="message" class="dyn-message">{{ message }}</p>
        </template>

        <!-- 密报 -->
        <template v-else-if="view === 'intel'">
          <div class="dyn-section">密报 · {{ rumors.length }}</div>
          <p v-if="rumors.length === 0" class="dyn-empty">
            暂无密报。圣听越高，越容易发现暗处的人。
          </p>
          <button
            v-for="rumor in rumors"
            :key="rumor.id"
            type="button"
            class="dyn-list-item"
            :class="{ 'is-clickable': rumor.characterId }"
            @click="rumor.characterId && openPersonById(rumor.characterId)"
          >
            <div class="dyn-list-main">
              <div class="dyn-list-title">
                <span class="dyn-chip" :class="rumor.revealed ? 'is-red' : 'is-gold'">
                  {{ rumor.revealed ? '已查实' : '风闻' }}
                </span>
                {{ rumor.year }}年{{ rumor.month }}月
              </div>
              <div class="dyn-list-sub">{{ rumor.text }}</div>
            </div>
          </button>
          <p class="dyn-note">
            「风闻」不会点名，只是线索；「已查实」的人会出现在人物详情里，可以下狱。
          </p>
        </template>

        <!-- 月度总结 -->
        <template v-else-if="view === 'summary' && summary">
          <div class="dyn-section">月度总结 · {{ summary.year }}年{{ summary.month }}月</div>

          <div class="dyn-summary-grid">
            <div class="dyn-summary-card">
              <span>税入</span>
              <b class="is-plus">+{{ summary.finance.tax }}</b>
            </div>
            <div class="dyn-summary-card">
              <span>官俸</span>
              <b class="is-minus">-{{ summary.finance.salary }}</b>
            </div>
            <div class="dyn-summary-card">
              <span>后宫</span>
              <b class="is-minus">-{{ summary.finance.harem }}</b>
            </div>
            <div class="dyn-summary-card">
              <span>行政</span>
              <b class="is-minus">-{{ summary.finance.adminCost || 0 }}</b>
            </div>
            <div class="dyn-summary-card">
              <span>军饷</span>
              <b class="is-minus">-{{ summary.finance.armyUpkeep || 0 }}</b>
            </div>
            <div class="dyn-summary-card">
              <span>净额</span>
              <b :class="summary.finance.net >= 0 ? 'is-plus' : 'is-minus'">
                {{ summary.finance.net >= 0 ? '+' : '' }}{{ summary.finance.net }}
              </b>
            </div>
          </div>

          <div class="dyn-kv">
            <span>国库</span>
            <b>
              {{ formatResource('treasury', summary.treasuryBefore) }}
              →
              {{ formatResource('treasury', summary.treasuryAfter) }}
            </b>
          </div>

          <div class="dyn-section">上月做了</div>
          <p v-if="!summary.activities.length" class="dyn-empty">没有留下处置记录。</p>
          <div v-for="activity in summary.activities" :key="activity.id" class="dyn-log">
            <div class="dyn-log-title">{{ activity.text }}</div>
          </div>

          <div class="dyn-section">本月发生</div>
          <div v-if="summary.deaths.length" class="dyn-log">
            <div class="dyn-log-title">亡故</div>
            <div class="dyn-log-desc">
              <span v-for="(death, index) in summary.deaths" :key="death.name">
                {{ index ? '、' : '' }}{{ death.name }}（{{ getDeathCauseLabel(death.cause) }}）
              </span>
            </div>
          </div>
          <div v-if="summary.newCharacters.length" class="dyn-log">
            <div class="dyn-log-title">新人物</div>
            <div class="dyn-log-desc">
              <span v-for="(person, index) in summary.newCharacters" :key="person.name">
                {{ index ? '、' : '' }}{{ person.name }}<span v-if="person.office">（{{ person.office }}）</span>
              </span>
            </div>
          </div>
          <div v-if="summary.newEvents.length" class="dyn-log">
            <div class="dyn-log-title">待批</div>
            <div class="dyn-log-desc">{{ summary.newEvents.join('、') }}</div>
          </div>
          <p
            v-if="!summary.deaths.length && !summary.newCharacters.length && !summary.newEvents.length"
            class="dyn-empty"
          >本月暂无异常。</p>

          <button type="button" class="dyn-btn is-primary is-block" @click="handleSummaryContinue">
            继 续
          </button>
        </template>

        <!-- 国库 -->
        <template v-else-if="view === 'treasury'">
          <div class="dyn-treasury">
            <div class="dyn-big">{{ formatResource('treasury', activeRun.resources.treasury) }}</div>
            <span>贯</span>
          </div>
          <div class="dyn-kv"><span>全国人口</span><b>{{ formatPopulation(totalPopulation) }}</b></div>
          <div class="dyn-kv"><span>人口税</span><b class="is-plus">+{{ income.regionalTax }}</b></div>
          <div class="dyn-kv"><span>盐铁与杂税</span><b class="is-plus">+{{ income.tax - income.regionalTax }}</b></div>
          <div class="dyn-kv"><span>税入合计</span><b class="is-plus">+{{ income.tax }}</b></div>
          <div class="dyn-kv"><span>百官俸禄</span><b class="is-minus">-{{ income.salary }}</b></div>
          <div class="dyn-kv"><span>后宫用度</span><b class="is-minus">-{{ income.harem }}</b></div>
          <div class="dyn-kv"><span>地方行政</span><b class="is-minus">-{{ income.adminCost }}</b></div>
          <div class="dyn-kv"><span>军饷</span><b class="is-minus">-{{ income.armyUpkeep }}</b></div>
          <div class="dyn-kv"><span>本月净</span><b :class="income.net >= 0 ? 'is-plus' : 'is-minus'">{{ income.net >= 0 ? '+' : '' }}{{ income.net }}</b></div>
          <p class="dyn-note">国库低于 2,000 贯时，民心每月 -2，军饷与俸禄开始拖欠。</p>
        </template>

        <!-- 编年史 -->
        <template v-else-if="view === 'chronicle'">
          <div class="dyn-section">编年史 · {{ recentLogs.length }} 条</div>
          <p v-if="recentLogs.length === 0" class="dyn-empty">还没有可记的事。</p>
          <div class="dyn-timeline">
            <div
              v-for="log in recentLogs.slice(0, 80)"
              :key="log.id"
              class="dyn-tl"
              :class="logTypeClass(log.type)"
            >
              <div class="dyn-tl-date">{{ log.year }}年{{ log.month }}月</div>
              <div class="dyn-tl-title">{{ log.title }}</div>
              <div v-if="log.desc" class="dyn-tl-desc">{{ log.desc }}</div>
            </div>
          </div>
        </template>
      </div>

      <nav v-if="showSideNav" class="dyn-nav">
        <button
          v-for="item in NAV_ITEMS"
          :key="item.key"
          type="button"
          class="dyn-nav-item"
          :class="{ active: navActive === item.key }"
          @click="go(item.key)"
        >
          <b>{{ item.char }}</b>{{ item.label }}
        </button>
      </nav>
    </template>
  </div>
</template>

<style scoped src="./DynastyScreen.css"></style>
