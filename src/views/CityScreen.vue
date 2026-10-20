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
    nextTick(() => document.querySelector('.city-encounter')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
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
    <header class="city-top">
      <button type="button" class="city-icon" @click="back">‹</button>
      <div class="city-title">
        <b>{{ view === 'night' ? '灯市 · 夜行' : '京城 · 出宫' }}</b>
        <span>{{ view === 'night' ? '教坊 / 画舫 / 酒楼 / 后巷' : '坊市 / 百姓 / 消息' }}</span>
      </div>
      <button type="button" class="city-icon" @click="view = view === 'night' ? 'city' : 'night'">
        {{ view === 'night' ? '回京' : '入夜' }}
      </button>
    </header>

    <div class="city-hud">
      <span class="is-gold">行动 {{ workingRun.actionPoints ?? 0 }}</span>
      <span>内帑 {{ workingRun.resources?.treasury ?? 0 }}</span>
      <span>民心 {{ workingRun.resources?.popularity ?? 0 }}</span>
      <span>威望 {{ workingRun.resources?.prestige ?? 0 }}</span>
      <span>治安 {{ city.order ?? 0 }}</span>
      <span :class="{ 'is-red': (workingRun.ruler?.health ?? 0) < 40 }">健康 {{ workingRun.ruler?.health ?? 0 }}</span>
      <span :class="{ 'is-red': burden.stress >= 70 }">压力 {{ burden.stress }}</span>
      <span class="is-red">风闻 {{ city.scandal ?? 0 }}</span>
    </div>

    <button type="button" class="city-burden-strip" @click="showBurden = !showBurden">
      <span class="city-burden-title">君主状态</span>
      <span v-for="trait in burden.traits" :key="trait.id" class="city-burden-chip is-trait">{{ trait.label }}</span>
      <span v-for="debuff in burden.debuffs" :key="debuff.id" class="city-burden-chip is-debuff">{{ debuff.label }}</span>
      <span v-if="!burden.traits.length && !burden.debuffs.length" class="city-burden-empty">暂无负面状态</span>
      <span class="city-burden-more">{{ showBurden ? '收起' : '详情' }}</span>
    </button>
    <div v-if="showBurden" class="city-burden-panel">
      <div class="city-burden-line"><span>压力</span><b>{{ burden.stress }} / 100</b></div>
      <div class="city-burden-meter"><i :style="{ width: `${burden.stress}%` }"></i></div>
      <div class="city-burden-line"><span>暴政</span><b>{{ burden.tyranny }}</b></div>
      <div class="city-burden-line"><span>恐惧</span><b>{{ burden.dread }}</b></div>
      <p v-for="trait in burden.traits" :key="trait.id"><b>{{ trait.label }}</b> · {{ trait.desc }}</p>
      <p v-for="debuff in burden.debuffs" :key="debuff.id"><b>{{ debuff.label }}</b> · {{ debuff.desc }}</p>
      <p class="city-burden-warn">压力到 100，或健康归零，会直接进入驾崩。</p>
    </div>

    <div class="city-tabs">
      <button type="button" :class="{ 'is-active': view === 'city' }" @click="view = 'city'">京城</button>
      <button type="button" :class="{ 'is-active': view === 'night' }" @click="view = 'night'">灯市</button>
    </div>

    <div class="city-scroll">
      <template v-if="view === 'city'">
        <div class="city-mode">
          <button type="button" :class="{ 'is-active': city.mode === 'incognito' }" @click="setMode('incognito')">微服</button>
          <button type="button" :class="{ 'is-active': city.mode === 'formal' }" @click="setMode('formal')">仪仗</button>
        </div>
        <p class="city-note">
          {{ city.mode === 'formal'
            ? '仪仗：内帑 -50 · 威望 +1；百姓会被提前清走，很多事看不到。'
            : '微服：能看见真话；每次行动健康 -1，威望收益低。' }}
        </p>

        <div class="city-map">
          <button
            v-for="item in CITY_DISTRICTS"
            :key="item.id"
            type="button"
            class="city-ward"
            :class="{ 'is-active': item.id === city.districtId }"
            @click="chooseDistrict(item.id)"
          >
            <b>{{ item.name }}</b>
            <small>{{ item.subtitle }}</small>
            <em>{{ '●'.repeat(item.risk) }}{{ '○'.repeat(3 - item.risk) }}</em>
          </button>
        </div>

        <div class="city-panel">
          <h3>{{ district.name }}</h3>
          <p>{{ district.desc }}</p>
          <div class="city-actions">
            <button
              v-for="action in district.actions"
              :key="action.id"
              type="button"
              class="city-action"
              :disabled="!canAct"
              @click="runDistrictAction(action)"
            >
              <span><b>{{ action.label }}</b><small>{{ action.desc }}</small></span>
              <em>{{ canAct ? '1 行动' : '行动不足' }}</em>
            </button>
          </div>
        </div>

        <div v-if="city.encounter" class="city-encounter">
          <div class="city-actor">
            <div class="city-avatar">{{ city.encounter.actor?.slice(0, 1) }}</div>
            <div>
              <b>{{ city.encounter.actor }}</b>
              <span>
                {{ city.encounter.role }}<template v-if="city.encounter.actorOffice && city.encounter.actorOffice !== city.encounter.role"> · {{ city.encounter.actorOffice }}</template>
                · {{ city.encounter.districtName }}
              </span>
            </div>
            <span v-if="city.encounter.formal" class="city-tag">仪仗所见</span>
          </div>
          <h3>{{ city.encounter.title }}</h3>
          <p>{{ city.encounter.text }}</p>
          <div class="city-choices">
            <button
              v-for="choice in city.encounter.choices"
              :key="choice.id"
              type="button"
              :disabled="busy"
              @click="chooseCityOption(choice)"
            >
              <b>{{ choice.text }}</b>
              <small>{{ choice.hint }}</small>
            </button>
          </div>
        </div>

        <div v-else-if="city.result" class="city-result">{{ city.result }}</div>
        <p v-if="error" class="city-error">{{ error }}</p>

        <div class="city-log">
          <h3>出宫记事</h3>
          <div v-if="cityLog.length === 0" class="city-empty">还没有出宫。</div>
          <div v-for="item in cityLog" :key="item.id" class="city-log-item">
            <b>{{ item.title }}</b>
            <span>{{ item.desc }}</span>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="city-night-venues">
          <button
            v-for="item in venues"
            :key="item.id"
            type="button"
            class="city-venue"
            :class="{ 'is-active': item.id === venue.id }"
            @click="chooseVenue(item.id)"
          >
            <b>{{ item.name }}</b>
            <small>{{ item.subtitle }}</small>
          </button>
        </div>

        <div class="city-panel">
          <h3>{{ venue.name }}</h3>
          <div class="city-performers">
            <button
              v-for="person in nightPerformers"
              :key="person.id"
              type="button"
              class="city-performer"
              :class="{ 'is-active': person.id === selectedPerformerId }"
              @click="openPerformer(person)"
            >
              <div class="city-avatar">{{ person.name.slice(0, 1) }}</div>
              <div>
                <b>{{ person.name }}</b>
                <small>{{ person.art }} · 才艺 {{ person.talent }} · 好感 {{ person.favor }}</small>
              </div>
            </button>
          </div>

          <div v-if="selectedPerformer" class="city-performer-detail">
            <div class="city-performer-head">
              <b>{{ selectedPerformer.name }}</b>
              <span>{{ selectedPerformer.gender }} · {{ selectedPerformer.age }} 岁 · {{ selectedPerformer.art }}</span>
            </div>
            <p>{{ selectedPerformer.background }}</p>
            <div class="city-tags">
              <span v-for="tag in selectedPerformer.tags" :key="tag" class="city-tag">{{ tag }}</span>
            </div>
            <div v-if="!selectedPerformer.recruited" class="city-actions">
              <button type="button" class="city-action" :disabled="!canAct" @click="runPerformerAction('listen')">
                <span><b>听一曲</b><small>内帑 -50 · 好感 +8</small></span><em>1 行动</em>
              </button>
              <button type="button" class="city-action" :disabled="!canAct" @click="runPerformerAction('talk')">
                <span><b>清谈</b><small>好感 +10 · 圣听 +1</small></span><em>1 行动</em>
              </button>
              <button type="button" class="city-action" :disabled="!canAct" @click="runPerformerAction('gift')">
                <span><b>赠礼</b><small>内帑 -300 · 好感 +15</small></span><em>1 行动</em>
              </button>
              <button type="button" class="city-action" :disabled="!canAct" @click="runPerformerAction('probe')">
                <span><b>问底细</b><small>圣听 +2 · 好感 -2 · 可能翻出秘密</small></span><em>1 行动</em>
              </button>
              <button type="button" class="city-action" :disabled="!canAct" @click="openRoles">
                <span><b>延请入宫</b><small>需要足够好感；名分不同，后果不同</small></span><em>1 行动</em>
              </button>
            </div>

            <div v-else class="city-result">此人已经入宫。</div>

            <div v-if="roleOpenFor === selectedPerformer.id && !selectedPerformer.recruited" class="city-roles">
              <button
                v-for="(role, key) in roleOptions"
                :key="key"
                type="button"
                class="city-role"
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

          <div class="city-extra-title">夜行杂事</div>
          <div class="city-actions">
            <button
              v-for="extra in venue.extras"
              :key="extra.id"
              type="button"
              class="city-action"
              :disabled="!canAct || workingRun.resources.treasury < extra.cost"
              @click="runExtra(extra)"
            >
              <span><b>{{ extra.label }}</b><small>{{ extra.desc }}</small></span>
              <em>1 行动</em>
            </button>
          </div>
        </div>

        <div v-if="city.result" class="city-result">{{ city.result }}</div>
        <p v-if="error" class="city-error">{{ error }}</p>

        <div v-if="city.impeachment" class="city-impeach">
          <h3>御史弹劾</h3>
          <p>御史递折，说陛下夜宿灯市，延请来历不明之人入宫。折子没有点名，但每个人都看得懂。</p>
          <div class="city-actions">
            <button type="button" class="city-action" @click="resolveImpeach('admit')"><span><b>认下</b><small>内帑 -500 · 风评 +2 · 后宫张力 +2</small></span></button>
            <button type="button" class="city-action" @click="resolveImpeach('deny')"><span><b>否认</b><small>风评 -3 · 风闻 +5</small></span></button>
            <button type="button" class="city-action" @click="resolveImpeach('dismiss')"><span><b>送出宫一人</b><small>风评 +1 · 后宫张力 -5 · 风闻 -10</small></span></button>
          </div>
        </div>

        <div class="city-roster">
          <h3>已带回宫 · {{ city.roster?.length || 0 }}</h3>
          <div v-if="!city.roster?.length" class="city-empty">还没有人跟你回宫。</div>
          <div v-for="item in city.roster" :key="item.id" class="city-roster-item">
            <b>{{ item.name }}</b>
            <span>{{ item.roleLabel }} · 好感 {{ item.favor }}</span>
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
  padding-top: env(safe-area-inset-top);
  background:
    radial-gradient(circle at 50% 0%, rgba(139, 123, 176, 0.07), transparent 32%),
    var(--dyn-ink);
  overflow: hidden;
}

.city-top {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--dyn-line-soft);
  background: rgba(20, 17, 14, 0.96);
}

.city-icon {
  min-width: 40px;
  min-height: 40px;
  border: 1px solid var(--dyn-line-soft);
  background: transparent;
  color: var(--dyn-muted);
  font-size: 0.66rem;
}

.city-title { flex: 1; min-width: 0; }
.city-title b { display: block; font-size: 0.78rem; font-weight: 500; color: var(--dyn-gold-bright); }
.city-title span { display: block; margin-top: 1px; font-size: 0.5rem; color: var(--dyn-dim); }

.city-hud {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  padding: 6px 9px;
  border-bottom: 1px solid var(--dyn-line-soft);
}

.city-hud span {
  padding: 1px 5px;
  border: 1px solid var(--dyn-line-soft);
  color: var(--dyn-muted);
  font-size: 0.52rem;
}
.city-hud .is-gold { border-color: rgba(201, 162, 39, 0.45); color: var(--dyn-gold); }
.city-hud .is-red { border-color: rgba(176, 68, 60, 0.45); color: #d7857e; }

.city-tabs {
  flex-shrink: 0;
  display: flex;
  gap: 4px;
  padding: 5px 9px;
  border-bottom: 1px solid var(--dyn-line-soft);
}

.city-tabs button {
  flex: 1;
  min-height: 34px;
  border: 1px solid var(--dyn-line-soft);
  background: transparent;
  color: var(--dyn-dim);
  font-size: 0.6rem;
}

.city-tabs button.is-active {
  border-color: var(--dyn-gold);
  background: rgba(201, 162, 39, 0.08);
  color: var(--dyn-gold-bright);
}

.city-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 8px 10px calc(20px + env(safe-area-inset-bottom));
}

.city-mode { display: flex; gap: 5px; }
.city-mode button {
  flex: 1;
  min-height: 38px;
  border: 1px solid var(--dyn-line-soft);
  background: var(--dyn-panel);
  color: var(--dyn-muted);
  font-size: 0.6rem;
}
.city-mode button.is-active { border-color: var(--dyn-gold); color: var(--dyn-gold-bright); }

.city-note {
  margin: 5px 0 0;
  color: var(--dyn-dim);
  font-size: 0.54rem;
  line-height: 1.7;
}

.city-map {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
  margin-top: 8px;
  padding: 6px;
  border: 1px solid var(--dyn-line);
  background:
    linear-gradient(rgba(201, 162, 39, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(201, 162, 39, 0.03) 1px, transparent 1px),
    #0d0b09;
  background-size: 20px 20px;
}

.city-ward {
  min-width: 0;
  min-height: 68px;
  padding: 6px 5px;
  border: 1px solid var(--dyn-line-soft);
  background: rgba(20, 17, 14, 0.92);
  color: var(--dyn-muted);
  text-align: left;
  white-space: normal;
}

.city-ward.is-active { border-color: var(--dyn-gold); background: rgba(201, 162, 39, 0.1); }
.city-ward b { display: block; font-size: 0.62rem; font-weight: 500; color: var(--dyn-text); }
.city-ward small { display: block; margin-top: 1px; font-size: 0.48rem; line-height: 1.4; color: var(--dyn-dim); }
.city-ward em { display: block; margin-top: 3px; color: var(--dyn-red); font-size: 0.46rem; font-style: normal; letter-spacing: 0.1em; }

.city-panel,
.city-encounter,
.city-result,
.city-impeach,
.city-roster,
.city-log {
  margin-top: 8px;
  padding: 10px;
  border: 1px solid var(--dyn-line);
  background: var(--dyn-panel);
}

.city-panel h3,
.city-encounter h3,
.city-impeach h3,
.city-roster h3,
.city-log h3 {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--dyn-gold-bright);
}

.city-panel p,
.city-encounter p,
.city-impeach p {
  margin: 5px 0 0;
  color: var(--dyn-muted);
  font-size: 0.62rem;
  line-height: 1.8;
  overflow-wrap: anywhere;
}

.city-actions { display: grid; gap: 5px; margin-top: 8px; }

.city-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
  width: 100%;
  min-height: 46px;
  padding: 7px 8px;
  border: 1px solid var(--dyn-line-soft);
  background: var(--dyn-panel-2);
  color: var(--dyn-text);
  text-align: left;
}
.city-action:disabled { opacity: 0.35; }
.city-action b { display: block; font-size: 0.64rem; font-weight: 500; }
.city-action small { display: block; margin-top: 1px; font-size: 0.5rem; color: var(--dyn-dim); }
.city-action em { flex-shrink: 0; color: var(--dyn-gold); font-size: 0.5rem; font-style: normal; }

.city-actor { display: flex; align-items: center; gap: 7px; }
.city-avatar {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border: 1px solid var(--dyn-gold);
  background: radial-gradient(circle at 35% 30%, #3a2d1c, #171310 70%);
  color: var(--dyn-gold-bright);
  font-size: 0.8rem;
}
.city-actor b { display: block; font-size: 0.66rem; color: var(--dyn-text); }
.city-actor span { display: block; margin-top: 1px; color: var(--dyn-dim); font-size: 0.5rem; }
.city-actor .city-tag { margin-left: auto; }

.city-tag {
  display: inline-flex;
  padding: 1px 5px;
  border: 1px solid var(--dyn-line);
  color: var(--dyn-muted);
  font-size: 0.48rem;
}
.city-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }

.city-choices { display: grid; gap: 5px; margin-top: 8px; }
.city-choices button {
  width: 100%;
  min-height: 48px;
  padding: 8px;
  border: 1px solid var(--dyn-line);
  border-left: 2px solid var(--dyn-gold);
  background: var(--dyn-panel-2);
  color: var(--dyn-text);
  text-align: left;
}
.city-choices b { display: block; font-size: 0.64rem; font-weight: 500; }
.city-choices small { display: block; margin-top: 1px; font-size: 0.5rem; color: var(--dyn-muted); }

.city-result {
  border-style: dashed;
  background: rgba(201, 162, 39, 0.04);
  color: #d8ccb9;
  font-size: 0.62rem;
  line-height: 1.8;
}

.city-error { margin: 6px 0 0; color: #d7857e; font-size: 0.56rem; }
.city-empty { padding: 12px 0; text-align: center; color: var(--dyn-dim); font-size: 0.56rem; }

.city-log-item {
  padding: 5px 0;
  border-bottom: 1px dashed var(--dyn-line-soft);
  font-size: 0.54rem;
  line-height: 1.6;
  color: var(--dyn-muted);
}
.city-log-item:last-child { border-bottom: none; }
.city-log-item b { display: block; color: var(--dyn-text); font-weight: 400; }
.city-log-item span { display: block; margin-top: 1px; }

.city-night-venues {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
}
.city-venue {
  min-width: 0;
  min-height: 62px;
  padding: 7px;
  border: 1px solid var(--dyn-line-soft);
  background: var(--dyn-panel);
  color: var(--dyn-muted);
  text-align: left;
}
.city-venue.is-active { border-color: var(--dyn-violet, #8b7bb0); background: rgba(139, 123, 176, 0.1); }
.city-venue b { display: block; font-size: 0.66rem; color: var(--dyn-text); font-weight: 500; }
.city-venue small { display: block; margin-top: 1px; font-size: 0.48rem; color: var(--dyn-dim); }

.city-performers { display: grid; gap: 5px; margin-top: 8px; }
.city-performer {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  min-width: 0;
  padding: 7px;
  border: 1px solid var(--dyn-line-soft);
  background: var(--dyn-panel-2);
  color: var(--dyn-muted);
  text-align: left;
}
.city-performer.is-active { border-color: #8b7bb0; }
.city-performer b { display: block; font-size: 0.64rem; color: var(--dyn-text); font-weight: 400; }
.city-performer small { display: block; margin-top: 1px; font-size: 0.5rem; color: var(--dyn-dim); }

.city-performer-detail {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--dyn-line-soft);
}
.city-performer-head b { display: block; font-size: 0.8rem; color: var(--dyn-gold-bright); font-weight: 500; }
.city-performer-head span { display: block; margin-top: 1px; font-size: 0.52rem; color: var(--dyn-dim); }
.city-performer-detail p { margin: 5px 0 0; font-size: 0.6rem; color: var(--dyn-muted); line-height: 1.8; }

.city-roles { display: grid; gap: 5px; margin-top: 6px; }
.city-role {
  width: 100%;
  min-height: 46px;
  padding: 7px 8px;
  border: 1px solid var(--dyn-line);
  border-left: 2px solid #8b7bb0;
  background: var(--dyn-panel-2);
  color: var(--dyn-text);
  text-align: left;
}
.city-role:disabled { opacity: 0.35; }
.city-role b { display: block; font-size: 0.62rem; font-weight: 500; }
.city-role small { display: block; margin-top: 1px; font-size: 0.5rem; color: var(--dyn-muted); }
.city-role em { display: block; margin-top: 1px; color: #d7857e; font-size: 0.5rem; font-style: normal; }

.city-extra-title {
  margin-top: 10px;
  padding-top: 7px;
  border-top: 1px dashed var(--dyn-line-soft);
  color: var(--dyn-gold);
  font-size: 0.58rem;
}

.city-impeach { border-color: var(--dyn-red); background: rgba(176, 68, 60, 0.08); }
.city-impeach h3 { color: #d7857e; }

.city-roster-item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px dashed var(--dyn-line-soft);
  font-size: 0.56rem;
  color: var(--dyn-muted);
}
.city-roster-item:last-child { border-bottom: none; }
.city-roster-item b { color: var(--dyn-text); font-weight: 400; }

.city-burden-strip {
  flex-shrink: 0;
  width: 100%;
  min-height: 34px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 3px;
  padding: 4px 9px;
  border: none;
  border-bottom: 1px solid var(--dyn-line-soft);
  background: #12100d;
  color: var(--dyn-muted);
  text-align: left;
}

.city-burden-title {
  color: var(--dyn-gold);
  font-size: 0.54rem;
  letter-spacing: 0.06em;
  margin-right: 2px;
}

.city-burden-chip {
  padding: 1px 5px;
  border: 1px solid var(--dyn-line);
  font-size: 0.5rem;
}

.city-burden-chip.is-trait {
  border-color: rgba(139, 123, 176, 0.55);
  color: #c3b6e0;
}

.city-burden-chip.is-debuff {
  border-color: rgba(176, 68, 60, 0.55);
  color: #d7857e;
}

.city-burden-empty { color: var(--dyn-dim); font-size: 0.5rem; }
.city-burden-more { margin-left: auto; color: var(--dyn-gold); font-size: 0.52rem; }

.city-burden-panel {
  flex-shrink: 0;
  padding: 8px 10px;
  border-bottom: 1px solid var(--dyn-line-soft);
  background: var(--dyn-panel);
}

.city-burden-line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.56rem;
  color: var(--dyn-muted);
}

.city-burden-line b { color: var(--dyn-text); font-weight: 400; }

.city-burden-meter {
  height: 5px;
  margin: 2px 0 5px;
  border: 1px solid var(--dyn-line-soft);
  background: #0d0b09;
}

.city-burden-meter i { display: block; height: 100%; background: var(--dyn-red); }
.city-burden-panel p { margin: 4px 0 0; font-size: 0.54rem; line-height: 1.6; color: var(--dyn-muted); }
.city-burden-panel p b { color: var(--dyn-red); font-weight: 400; }
.city-burden-warn { color: var(--dyn-gold) !important; }

@media (max-width: 520px) {
  .city-title b { font-size: 17px; }
  .city-title span { font-size: 12px; }
  .city-hud span { font-size: 12px; }
  .city-burden-title, .city-burden-more { font-size: 12px; }
  .city-burden-chip { font-size: 11px; padding: 2px 6px; }
  .city-burden-empty { font-size: 11px; }
  .city-burden-panel p, .city-burden-line { font-size: 12px; }
  .city-tabs button, .city-mode button { font-size: 13px; min-height: 42px; }
  .city-note { font-size: 12px; }
  .city-ward b { font-size: 14px; }
  .city-ward small { font-size: 11px; }
  .city-ward em { font-size: 10px; }
  .city-panel h3, .city-encounter h3, .city-impeach h3, .city-roster h3, .city-log h3 { font-size: 17px; }
  .city-panel p, .city-encounter p, .city-impeach p { font-size: 13px; }
  .city-action b { font-size: 14px; }
  .city-action small, .city-action em { font-size: 12px; }
  .city-action { min-height: 50px; }
  .city-actions button b, .city-choices b { font-size: 14px; }
  .city-choices small { font-size: 12px; }
  .city-venue b, .city-performer b { font-size: 14px; }
  .city-venue small, .city-performer small { font-size: 11px; }
  .city-performer-head b { font-size: 17px; }
  .city-performer-head span, .city-performer-detail p { font-size: 12px; }
  .city-role b { font-size: 14px; }
  .city-role small, .city-role em { font-size: 12px; }
  .city-roster-item, .city-log-item { font-size: 12px; }
}

@media (max-width: 360px) {
  .city-map { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .city-ward { min-height: 62px; }
}

/* ===== 桌面端：地图铺开成四列，正文限宽 ===== */

@media (min-width: 1024px) {
  .city-top { padding: 14px 20px; }

  .city-scroll {
    padding: 20px 24px 32px;
  }

  .city-scroll > * {
    width: 100%;
    max-width: 1100px;
    margin: 0 auto;
  }

  .city-map {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .city-ward { min-height: 96px; }

  .city-actions { gap: 8px; }

  .city-action:hover { background: rgba(201, 162, 39, 0.06); }
}
</style>
