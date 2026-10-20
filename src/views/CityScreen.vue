<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import {
  CITY_DISTRICTS,
  NIGHT_ROLE_OPTIONS,
  NIGHT_VENUES,
  getNightPerformers,
  recruitNightPerformer,
  nightPerformerAction,
  resolveCityChoice,
  resolveCityImpeachment,
  selectCityDistrict,
  selectNightVenue,
  setCityMode,
  startCityAction,
  startNightAction,
  getBurdenSummary,
} from '../game-core/empire/index.js'

const props = defineProps({
  run: { type: Object, required: true },
})
const emit = defineEmits(['back', 'update'])

const workingRun = ref(props.run)
const view = ref('city')
const busy = ref(false)
const error = ref('')
const selectedPerformerId = ref('')
const roleOpenFor = ref('')
const showBurden = ref(false)

watch(() => props.run, (next) => {
  if (next) workingRun.value = next
})

const city = computed(() => workingRun.value.city || {})
const district = computed(() => (
  CITY_DISTRICTS.find((item) => item.id === city.value.districtId) || CITY_DISTRICTS[0]
))
const venues = computed(() => NIGHT_VENUES)
const venue = computed(() => (
  NIGHT_VENUES.find((item) => item.id === city.value.nightVenueId) || NIGHT_VENUES[0]
))
const nightPerformers = computed(() => (
  getNightPerformers(workingRun.value).filter((item) => item.venue === venue.value.id)
))
const selectedPerformer = computed(() => (
  getNightPerformers(workingRun.value).find((item) => item.id === selectedPerformerId.value)
  || null
))
const roleOptions = computed(() => NIGHT_ROLE_OPTIONS)
const canAct = computed(() => (workingRun.value.actionPoints || 0) > 0 && !busy.value)
const cityLog = computed(() => (city.value.log || []).slice(0, 5))
const burden = computed(() => getBurdenSummary(workingRun.value))

const apply = (result) => {
  if (!result.success) {
    error.value = result.message
    return false
  }
  workingRun.value = result.state
  emit('update', result.state)
  error.value = ''
  return true
}

const setMode = (mode) => {
  if (busy.value) return
  apply(setCityMode(workingRun.value, mode))
}

const chooseDistrict = (id) => {
  if (busy.value) return
  apply(selectCityDistrict(workingRun.value, id))
  view.value = 'city'
}

const runDistrictAction = (action) => {
  if (!canAct.value) return
  const result = startCityAction(workingRun.value, district.value.id, action.id)
  if (apply(result)) {
    nextTick(() => document.querySelector('.encounter-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
}

const chooseCityOption = (choice) => {
  if (busy.value) return
  apply(resolveCityChoice(workingRun.value, choice.id))
}

const chooseVenue = (id) => {
  if (busy.value) return
  apply(selectNightVenue(workingRun.value, id))
  selectedPerformerId.value = ''
  roleOpenFor.value = ''
}

const openPerformer = (person) => {
  selectedPerformerId.value = person.id
  roleOpenFor.value = ''
}

const runExtra = (extra) => {
  if (!canAct.value) return
  apply(startNightAction(workingRun.value, venue.value.id, extra.id))
}

const runPerformerAction = (action) => {
  if (!canAct.value || !selectedPerformer.value) return
  apply(nightPerformerAction(workingRun.value, selectedPerformer.value.id, action))
}

const openRoles = () => {
  roleOpenFor.value = selectedPerformer.value?.id || ''
}

const chooseRole = (roleKey) => {
  if (!selectedPerformer.value) return
  if (apply(recruitNightPerformer(workingRun.value, selectedPerformer.value.id, roleKey))) {
    roleOpenFor.value = ''
  }
}

const resolveImpeach = (action) => {
  if (busy.value) return
  apply(resolveCityImpeachment(workingRun.value, action))
}

const back = () => emit('back')
</script>

<template>
  <div class="city-screen">
    <header class="city-head">
      <button type="button" class="icon-btn" aria-label="返回" @click="back">‹</button>
      <div class="city-head-main">
        <h1>{{ view === 'night' ? '灯市' : '京城' }}</h1>
        <p>{{ view === 'night' ? '教坊 · 画舫 · 酒楼 · 后巷' : '坊市 · 百姓 · 消息' }}</p>
      </div>
      <button type="button" class="btn btn-sm btn-ghost" @click="view = view === 'night' ? 'city' : 'night'">
        {{ view === 'night' ? '回京' : '入夜' }}
      </button>
    </header>

    <div class="city-hud">
      <span class="chip chip-gold">行动 {{ workingRun.actionPoints ?? 0 }}</span>
      <span class="chip">帑 {{ workingRun.resources?.treasury ?? 0 }}</span>
      <span class="chip">民心 {{ workingRun.resources?.popularity ?? 0 }}</span>
      <span class="chip">威望 {{ workingRun.resources?.prestige ?? 0 }}</span>
      <span class="chip">治安 {{ city.order ?? 0 }}</span>
      <span class="chip" :class="{ 'chip-red': (workingRun.ruler?.health ?? 0) < 40 }">健康 {{ workingRun.ruler?.health ?? 0 }}</span>
      <span class="chip" :class="{ 'chip-red': burden.stress >= 70 }">压力 {{ burden.stress }}</span>
      <span class="chip chip-red">风闻 {{ city.scandal ?? 0 }}</span>
    </div>

    <button type="button" class="burden-strip" @click="showBurden = !showBurden">
      <span class="burden-title">君主状态</span>
      <span v-for="trait in burden.traits" :key="trait.id" class="chip chip-gold">{{ trait.label }}</span>
      <span v-for="debuff in burden.debuffs" :key="debuff.id" class="chip chip-red">{{ debuff.label }}</span>
      <span v-if="!burden.traits.length && !burden.debuffs.length" class="chip">暂无负面状态</span>
      <span class="burden-more">{{ showBurden ? '收起' : '详情' }}</span>
    </button>

    <div v-if="showBurden" class="burden-panel">
      <div class="kv"><span>压力</span><b>{{ burden.stress }} / 100</b></div>
      <div class="bar bar-red"><i :style="{ width: `${burden.stress}%` }"></i></div>
      <div class="kv"><span>暴政</span><b>{{ burden.tyranny }}</b></div>
      <div class="kv"><span>恐惧</span><b>{{ burden.dread }}</b></div>
      <p v-for="trait in burden.traits" :key="trait.id"><b>{{ trait.label }}</b> · {{ trait.desc }}</p>
      <p v-for="debuff in burden.debuffs" :key="debuff.id"><b>{{ debuff.label }}</b> · {{ debuff.desc }}</p>
      <p class="burden-warn">压力到 100，或健康归零，会直接进入驾崩。</p>
    </div>

    <div class="city-tabs">
      <button type="button" :class="{ 'is-active': view === 'city' }" @click="view = 'city'">京城</button>
      <button type="button" :class="{ 'is-active': view === 'night' }" @click="view = 'night'">灯市</button>
      <span class="city-tabs-note">{{ view === 'night' ? '夜行 · 易生风闻' : '出宫 · 可见民情' }}</span>
    </div>

    <div class="city-scroll">
      <!-- ===== 京城 ===== -->
      <template v-if="view === 'city'">
        <div class="mode-switch">
          <button type="button" :class="{ 'is-active': city.mode === 'incognito' }" @click="setMode('incognito')">微服</button>
          <button type="button" :class="{ 'is-active': city.mode === 'formal' }" @click="setMode('formal')">仪仗</button>
        </div>
        <p class="note">
          {{ city.mode === 'formal'
            ? '仪仗：内帑 -50、威望 +1；百姓会被提前清走，很多事看不到。'
            : '微服：能看见真话；每次行动健康 -1，威望收益低。' }}
        </p>

        <div class="section"><span>坊市</span><span class="section-note">{{ CITY_DISTRICTS.length }} 处</span></div>
        <div class="ward-grid">
          <button
            v-for="item in CITY_DISTRICTS"
            :key="item.id"
            type="button"
            class="ward"
            :class="{ 'is-active': item.id === city.districtId }"
            @click="chooseDistrict(item.id)"
          >
            <span class="ward-name">{{ item.name }}</span>
            <span class="ward-sub">{{ item.subtitle }}</span>
            <span class="ward-risk" :class="{ 'is-high': item.risk >= 2 }">
              {{ '●'.repeat(item.risk) }}{{ '○'.repeat(3 - item.risk) }}
            </span>
          </button>
        </div>

        <section class="district-panel">
          <div class="district-head">
            <h2>{{ district.name }}</h2>
            <span class="chip">风险 {{ '●'.repeat(district.risk) }}{{ '○'.repeat(3 - district.risk) }}</span>
          </div>
          <p>{{ district.desc }}</p>
          <div class="action-list">
            <button
              v-for="action in district.actions"
              :key="action.id"
              type="button"
              class="action-row"
              :disabled="!canAct"
              @click="runDistrictAction(action)"
            >
              <span class="action-main">
                <b>{{ action.label }}</b>
                <small>{{ action.desc }}</small>
              </span>
              <span class="action-cost">{{ canAct ? '1 行动' : '行动不足' }}</span>
            </button>
          </div>
        </section>

        <div v-if="city.encounter" class="encounter-card">
          <div class="encounter-head">
            <div class="avatar avatar-sm">{{ city.encounter.actor?.slice(0, 1) }}</div>
            <div>
              <h3>{{ city.encounter.title }}</h3>
              <p class="row-sub">
                {{ city.encounter.actor }} · {{ city.encounter.role }}<template v-if="city.encounter.actorOffice && city.encounter.actorOffice !== city.encounter.role"> · {{ city.encounter.actorOffice }}</template>
                · {{ city.encounter.districtName }}
              </p>
            </div>
            <span v-if="city.encounter.formal" class="chip chip-gold">仪仗所见</span>
          </div>
          <p class="encounter-text">{{ city.encounter.text }}</p>
          <div class="choice-list">
            <button
              v-for="choice in city.encounter.choices"
              :key="choice.id"
              type="button"
              class="choice"
              :disabled="busy"
              @click="chooseCityOption(choice)"
            >
              <span class="choice-title">{{ choice.text }}</span>
              <span class="choice-hint">{{ choice.hint }}</span>
            </button>
          </div>
        </div>
        <div v-else-if="city.result" class="result-panel"><p>{{ city.result }}</p></div>
        <p v-if="error" class="city-error">{{ error }}</p>

        <div class="section"><span>出宫记事</span></div>
        <p v-if="cityLog.length === 0" class="empty empty-sm">还没有出宫。</p>
        <div v-else class="log-list">
          <div v-for="item in cityLog" :key="item.id" class="log-row">
            <b>{{ item.title }}</b>
            <span>{{ item.desc }}</span>
          </div>
        </div>
      </template>

      <!-- ===== 灯市 ===== -->
      <template v-else>
        <div class="venue-grid">
          <button
            v-for="item in venues"
            :key="item.id"
            type="button"
            class="venue"
            :class="{ 'is-active': item.id === venue.id }"
            @click="chooseVenue(item.id)"
          >
            <b>{{ item.name }}</b>
            <small>{{ item.subtitle }}</small>
          </button>
        </div>

        <section class="district-panel">
          <div class="district-head">
            <h2>{{ venue.name }}</h2>
            <span class="chip">行动点 {{ workingRun.actionPoints ?? 0 }}</span>
          </div>

          <div class="performer-grid">
            <button
              v-for="person in nightPerformers"
              :key="person.id"
              type="button"
              class="performer"
              :class="{ 'is-active': person.id === selectedPerformerId }"
              @click="openPerformer(person)"
            >
              <div class="avatar avatar-sm">{{ person.name.slice(0, 1) }}</div>
              <div class="performer-main">
                <b>{{ person.name }}</b>
                <small>{{ person.art }} · 才艺 {{ person.talent }} · 好感 {{ person.favor }}</small>
              </div>
            </button>
            <p v-if="nightPerformers.length === 0" class="empty empty-sm">此处暂时无人。</p>
          </div>

          <div v-if="selectedPerformer" class="performer-detail">
            <div class="performer-head">
              <b>{{ selectedPerformer.name }}</b>
              <span class="chip">{{ selectedPerformer.gender }} · {{ selectedPerformer.age }} 岁 · {{ selectedPerformer.art }}</span>
            </div>
            <p>{{ selectedPerformer.background }}</p>
            <div class="chips">
              <span v-for="tag in selectedPerformer.tags" :key="tag" class="chip">{{ tag }}</span>
            </div>

            <div v-if="!selectedPerformer.recruited" class="action-list performer-actions">
              <button type="button" class="action-row" :disabled="!canAct" @click="runPerformerAction('listen')">
                <span class="action-main"><b>听一曲</b><small>内帑 -50 · 好感 +8</small></span>
                <span class="action-cost">1 行动</span>
              </button>
              <button type="button" class="action-row" :disabled="!canAct" @click="runPerformerAction('talk')">
                <span class="action-main"><b>清谈</b><small>好感 +10 · 圣听 +1</small></span>
                <span class="action-cost">1 行动</span>
              </button>
              <button type="button" class="action-row" :disabled="!canAct" @click="runPerformerAction('gift')">
                <span class="action-main"><b>赠礼</b><small>内帑 -300 · 好感 +15</small></span>
                <span class="action-cost">1 行动</span>
              </button>
              <button type="button" class="action-row" :disabled="!canAct" @click="runPerformerAction('probe')">
                <span class="action-main"><b>问底细</b><small>圣听 +2 · 好感 -2 · 可能翻出秘密</small></span>
                <span class="action-cost">1 行动</span>
              </button>
              <button type="button" class="action-row" :disabled="!canAct" @click="openRoles">
                <span class="action-main"><b>延请入宫</b><small>需要足够好感；名分不同，后果不同</small></span>
                <span class="action-cost">1 行动</span>
              </button>
            </div>
            <p v-else class="result-panel">此人已经入宫。</p>

            <div v-if="roleOpenFor === selectedPerformer.id && !selectedPerformer.recruited" class="role-grid">
              <button
                v-for="(role, key) in roleOptions"
                :key="key"
                type="button"
                class="role"
                :disabled="!selectedPerformer.willing.includes(key) || selectedPerformer.favor < role.favor || !canAct"
                @click="chooseRole(key)"
              >
                <b>{{ role.label }}</b>
                <small>{{ role.desc }}</small>
                <em v-if="!selectedPerformer.willing.includes(key)">对方不愿</em>
                <em v-else-if="selectedPerformer.favor < role.favor">好感需 {{ role.favor }}</em>
              </button>
            </div>
          </div>

          <div class="section"><span>夜行杂事</span></div>
          <div class="action-list">
            <button
              v-for="extra in venue.extras"
              :key="extra.id"
              type="button"
              class="action-row"
              :disabled="!canAct || workingRun.resources.treasury < extra.cost"
              @click="runExtra(extra)"
            >
              <span class="action-main"><b>{{ extra.label }}</b><small>{{ extra.desc }}</small></span>
              <span class="action-cost">1 行动</span>
            </button>
          </div>
        </section>

        <div v-if="city.result" class="result-panel"><p>{{ city.result }}</p></div>
        <p v-if="error" class="city-error">{{ error }}</p>

        <div v-if="city.impeachment" class="impeach">
          <h3>御史弹劾</h3>
          <p>御史递折，说陛下夜宿灯市，延请来历不明之人入宫。折子没有点名，但每个人都看得懂。</p>
          <div class="action-list">
            <button type="button" class="action-row" @click="resolveImpeach('admit')">
              <span class="action-main"><b>认下</b><small>内帑 -500 · 风评 +2 · 后宫张力 +2</small></span>
            </button>
            <button type="button" class="action-row" @click="resolveImpeach('deny')">
              <span class="action-main"><b>否认</b><small>风评 -3 · 风闻 +5</small></span>
            </button>
            <button type="button" class="action-row" @click="resolveImpeach('dismiss')">
              <span class="action-main"><b>送出宫一人</b><small>风评 +1 · 后宫张力 -5 · 风闻 -10</small></span>
            </button>
          </div>
        </div>

        <div class="section"><span>已带回宫 · {{ city.roster?.length || 0 }}</span></div>
        <p v-if="!city.roster?.length" class="empty empty-sm">还没有人跟你回宫。</p>
        <div v-else class="row-list">
          <div v-for="item in city.roster" :key="item.id" class="row">
            <div class="row-main">
              <div class="row-title">{{ item.name }}</div>
              <div class="row-sub">{{ item.roleLabel }} · 好感 {{ item.favor }}</div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.city-screen {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-top: var(--safe-top);
  background:
    radial-gradient(circle at 50% 0, rgba(154, 138, 192, 0.07), transparent 34%),
    var(--ink);
  overflow: hidden;
}

.city-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  background: rgba(12, 10, 8, 0.9);
}

.city-head-main {
  flex: 1;
  min-width: 0;
}

.city-head-main h1 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 1.05rem;
  font-weight: 500;
  letter-spacing: 0.16em;
  color: var(--gold-bright);
}

.city-head-main p {
  margin: 2px 0 0;
  font-family: var(--font-sans);
  font-size: 0.66rem;
  color: var(--dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.city-hud {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 9px 12px 2px;
}

.burden-strip {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  margin: 6px 12px 0;
  padding: 7px 9px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: rgba(0, 0, 0, 0.18);
  color: var(--muted);
  text-align: left;
}

.burden-title {
  flex: 0 0 auto;
  font-family: var(--font-sans);
  font-size: 0.64rem;
  letter-spacing: 0.14em;
  color: var(--gold);
}

.burden-more {
  margin-left: auto;
  flex: 0 0 auto;
  font-family: var(--font-sans);
  font-size: 0.64rem;
  color: var(--dim);
}

.burden-panel {
  flex: 0 0 auto;
  margin: 6px 12px 0;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--panel);
  font-family: var(--font-sans);
  font-size: 0.72rem;
}

.burden-panel p {
  margin: 7px 0 0;
  line-height: 1.75;
  color: var(--dim);
}

.burden-panel p b {
  color: var(--text);
  font-weight: 500;
}

.burden-panel .burden-warn {
  color: #d69b94;
}

.city-tabs {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 10px 12px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
}

.city-tabs button {
  padding: 6px 12px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--dim);
  font-family: var(--font-sans);
  font-size: 0.72rem;
}

.city-tabs button.is-active {
  border-color: var(--gold-line);
  background: rgba(201, 162, 39, 0.1);
  color: var(--gold-bright);
}

.city-tabs-note {
  margin-left: auto;
  font-family: var(--font-sans);
  font-size: 0.64rem;
  color: var(--dim);
}

.city-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 12px 30px;
}

.city-scroll .mode-switch {
  margin-bottom: 2px;
}

.ward-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.ward {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: linear-gradient(180deg, var(--panel-2), var(--panel));
  color: var(--text);
  text-align: left;
}

.ward:hover {
  border-color: var(--gold-line);
}

.ward.is-active {
  border-color: var(--gold-line);
  background:
    radial-gradient(circle at 100% 0, rgba(201, 162, 39, 0.14), transparent 70%),
    var(--panel);
}

.ward-name {
  font-size: 0.94rem;
  letter-spacing: 0.1em;
}

.ward-sub {
  font-family: var(--font-sans);
  font-size: 0.66rem;
  color: var(--dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ward-risk {
  margin-top: 5px;
  font-size: 0.6rem;
  letter-spacing: 0.16em;
  color: var(--jade);
}

.ward-risk.is-high {
  color: var(--red);
}

.district-panel {
  margin-top: 12px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--panel);
}

.district-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}

.district-head h2 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 1.1rem;
  font-weight: 500;
  letter-spacing: 0.12em;
  color: var(--gold-bright);
}

.district-panel > p {
  margin: 0 0 12px;
  font-size: 0.8rem;
  line-height: 1.9;
  color: var(--muted);
}

.action-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.action-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--panel-2);
  color: var(--text);
  text-align: left;
}

.action-row:hover:not(:disabled) {
  border-color: var(--gold-line);
}

.action-row:disabled {
  opacity: 0.4;
}

.action-main {
  flex: 1;
  min-width: 0;
}

.action-main b {
  display: block;
  font-size: 0.88rem;
  font-weight: 500;
  letter-spacing: 0.04em;
}

.action-main small {
  display: block;
  margin-top: 2px;
  font-family: var(--font-sans);
  font-size: 0.68rem;
  line-height: 1.65;
  color: var(--dim);
}

.action-cost {
  flex: 0 0 auto;
  font-family: var(--font-sans);
  font-size: 0.66rem;
  color: var(--gold);
}

.encounter-card {
  margin-top: 12px;
  padding: 14px;
  border: 1px solid var(--gold-line);
  border-radius: var(--r-md);
  background:
    radial-gradient(circle at 100% 0, rgba(201, 162, 39, 0.1), transparent 60%),
    var(--panel);
}

.encounter-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 9px;
}

.encounter-head h3 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 1rem;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--gold-bright);
}

.encounter-text {
  margin: 0 0 12px;
  font-size: 0.84rem;
  line-height: 1.95;
  color: #d8cdba;
  white-space: pre-wrap;
}

.city-error {
  margin: 10px 0 0;
  padding: 9px 11px;
  border: 1px solid rgba(189, 92, 82, 0.45);
  border-radius: var(--r-sm);
  background: rgba(189, 92, 82, 0.08);
  color: #e0a9a2;
  font-family: var(--font-sans);
  font-size: 0.72rem;
  line-height: 1.7;
}

.log-row b {
  display: block;
  font-size: 0.82rem;
  font-weight: 400;
  color: var(--muted);
}

.log-row span {
  display: block;
  margin-top: 2px;
  font-family: var(--font-sans);
  font-size: 0.68rem;
  color: var(--dim);
}

.venue-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.venue {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--panel);
  color: var(--text);
  text-align: left;
}

.venue.is-active {
  border-color: var(--violet);
  background:
    radial-gradient(circle at 100% 0, rgba(154, 138, 192, 0.14), transparent 70%),
    var(--panel);
}

.venue b {
  font-size: 0.92rem;
  font-weight: 500;
  letter-spacing: 0.1em;
}

.venue small {
  font-family: var(--font-sans);
  font-size: 0.66rem;
  color: var(--dim);
}

.performer-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}

.performer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: rgba(0, 0, 0, 0.16);
  color: var(--text);
  text-align: left;
}

.performer.is-active {
  border-color: var(--gold-line);
  background: rgba(201, 162, 39, 0.07);
}

.performer-main {
  min-width: 0;
}

.performer-main b {
  display: block;
  font-size: 0.86rem;
  font-weight: 400;
}

.performer-main small {
  display: block;
  font-family: var(--font-sans);
  font-size: 0.64rem;
  color: var(--dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.performer-detail {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--line);
}

.performer-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 6px;
}

.performer-head b {
  font-family: var(--font-serif);
  font-size: 1rem;
  font-weight: 500;
  letter-spacing: 0.1em;
}

.performer-detail > p {
  margin: 0 0 8px;
  font-size: 0.8rem;
  line-height: 1.9;
  color: var(--muted);
}

.performer-actions {
  margin-top: 10px;
}

.role-grid {
  display: grid;
  gap: 7px;
  margin-top: 9px;
}

.role {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 11px;
  border: 1px solid var(--violet);
  border-radius: var(--r-sm);
  background: rgba(154, 138, 192, 0.07);
  color: var(--text);
  text-align: left;
}

.role:disabled {
  opacity: 0.4;
  border-color: var(--line);
}

.role b {
  font-size: 0.86rem;
  font-weight: 500;
}

.role small {
  font-family: var(--font-sans);
  font-size: 0.68rem;
  color: var(--dim);
}

.role em {
  font-family: var(--font-sans);
  font-size: 0.64rem;
  font-style: normal;
  color: var(--red);
}

.impeach {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid rgba(189, 92, 82, 0.5);
  border-radius: var(--r-md);
  background: rgba(189, 92, 82, 0.06);
}

.impeach h3 {
  margin: 0 0 6px;
  font-family: var(--font-serif);
  font-size: 1rem;
  font-weight: 500;
  letter-spacing: 0.1em;
  color: #e0a9a2;
}

.impeach > p {
  margin: 0 0 10px;
  font-size: 0.8rem;
  line-height: 1.9;
  color: var(--muted);
}

.result-panel {
  margin-top: 12px;
}

@media (min-width: 560px) {
  .city-scroll {
    padding: 16px 18px 32px;
  }

  .city-head {
    padding: 12px 18px;
  }

  .city-hud,
  .city-tabs,
  .burden-strip,
  .burden-panel {
    margin-left: 18px;
    margin-right: 18px;
  }

  .ward-grid,
  .venue-grid,
  .performer-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 900px) {
  .city-scroll {
    width: 100%;
    max-width: 940px;
    margin: 0 auto;
    padding: 20px 24px 40px;
  }

  .city-hud,
  .city-tabs,
  .burden-strip,
  .burden-panel {
    width: 100%;
    max-width: 892px;
    margin-left: auto;
    margin-right: auto;
  }

  .ward-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .performer-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .role-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
