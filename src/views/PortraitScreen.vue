<script setup>
import { computed, onMounted, ref } from 'vue'
import { portraitUrl } from '../game/portraits.js'
import { splitSheet } from '../game/sliceSheet.js'
import {
  assignPortrait,
  assignmentsForRun,
  autoAssignPortraits,
  clearRunAssignments,
  loadPortraitLibrary,
  portraitIdFor,
  portraitState,
  removePortrait,
  updatePortraitMeta,
  uploadPortraitSlices,
} from '../game/portraitStore.js'
import PortraitLightbox from './PortraitLightbox.vue'

const props = defineProps({
  run: { type: Object, default: null },
  targetId: { type: String, default: '' },
})

const emit = defineEmits(['back', 'picked'])

const portraits = computed(() => portraitState.portraits)
const loading = computed(() => portraitState.loading)
const characterById = (id) => {
  if (!id || !props.run) return null
  if (props.run.ruler?.id === id) return props.run.ruler
  return props.run.characters?.find((person) => person.id === id) || null
}
const target = computed(() => characterById(props.targetId))
const targetPortraitId = computed(() => portraitIdFor(props.run?.id, props.targetId))
const targetPortrait = computed(() => (
  portraits.value.find((item) => item.id === targetPortraitId.value) || null
))
const assignedCount = computed(() => (
  new Set(Object.values(assignmentsForRun(props.run?.id))).size
))
const genderCounts = computed(() => {
  const counts = { male: 0, female: 0, all: 0 }
  for (const portrait of portraits.value) {
    counts[portrait.gender] = (counts[portrait.gender] || 0) + 1
  }
  return counts
})
const assignedNames = computed(() => {
  const result = {}
  if (!props.run) return result
  const map = assignmentsForRun(props.run.id)
  for (const [characterId, portraitId] of Object.entries(map)) {
    const person = characterById(characterId)
    if (person) result[portraitId] = person.name
  }
  return result
})

const notice = ref('')
const error = ref('')
const assigning = ref(false)
const brokenIds = ref([])
const genderFilter = ref('all')
const confirmClear = ref(false)
let confirmClearTimer = null

const FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
  { value: 'general', label: '通用' },
]

const visiblePortraits = computed(() => {
  if (genderFilter.value === 'all') return portraits.value
  if (genderFilter.value === 'general') {
    return portraits.value.filter((item) => item.gender === 'all')
  }
  return portraits.value.filter((item) => item.gender === genderFilter.value)
})

const importOpen = ref(false)
const sheetFiles = ref([])
const rows = ref(2)
const cols = ref(5)
const gender = ref('male')
const prefix = ref('立绘')
const slices = ref([])
const picked = ref([])
const slicing = ref(false)
const saving = ref(false)
const progress = ref({ done: 0, total: 0 })

const activePortrait = ref(null)
const renaming = ref(false)
const nameDraft = ref('')
const renamingSaving = ref(false)
const confirmDelete = ref(false)
let confirmTimer = null

const pickedCount = computed(() => picked.value.filter(Boolean).length)
const activeSubtitle = computed(() => {
  if (!activePortrait.value) return ''
  const size = `${activePortrait.value.width}×${activePortrait.value.height}`
  const owner = assignedNames.value[activePortrait.value.id]
  return [genderLabel(activePortrait.value.gender), size, owner ? `已给 ${owner}` : '']
    .filter(Boolean)
    .join(' · ')
})

const genderLabel = (value) => ({ male: '男', female: '女', all: '通用' }[value] || '男')
const markBroken = (id) => {
  if (!brokenIds.value.includes(id)) brokenIds.value = [...brokenIds.value, id]
}

onMounted(() => {
  void loadPortraitLibrary(true)
})

const openImport = () => {
  importOpen.value = true
  error.value = ''
  notice.value = ''
}

const closeImport = () => {
  importOpen.value = false
  sheetFiles.value = []
  slices.value = []
  picked.value = []
  progress.value = { done: 0, total: 0 }
}

const onFiles = async (event) => {
  const files = [...(event.target.files || [])].filter((file) => file.type.startsWith('image/'))
  event.target.value = ''
  if (!files.length) return
  sheetFiles.value = files
  await buildSlices()
}

const buildSlices = async () => {
  if (!sheetFiles.value.length || slicing.value) return
  slicing.value = true
  error.value = ''
  notice.value = ''
  slices.value = []
  picked.value = []
  const total = sheetFiles.value.length * rows.value * cols.value
  progress.value = { done: 0, total }

  try {
    const collected = []
    for (const file of sheetFiles.value) {
      const base = collected.length
      const result = await splitSheet(file, {
        rows: rows.value,
        cols: cols.value,
        onProgress: (done) => {
          progress.value = { done: base + done, total }
        },
      })
      collected.push(...result)
    }
    slices.value = collected
    picked.value = collected.map(() => true)
    notice.value = `已切出 ${collected.length} 张，确认后导入`
  } catch (err) {
    slices.value = []
    picked.value = []
    error.value = err?.message || '切图失败'
  } finally {
    slicing.value = false
  }
}

const toggleSlice = (index) => {
  picked.value[index] = !picked.value[index]
}

const toggleAll = (value) => {
  picked.value = slices.value.map(() => value)
}

const importSelected = async () => {
  if (!pickedCount.value || saving.value) return
  const items = slices.value
    .filter((_, index) => picked.value[index])
    .map((slice, index) => ({
      dataUrl: slice.dataUrl,
      width: slice.width,
      height: slice.height,
      name: `${prefix.value.trim() || '立绘'} ${String(portraits.value.length + index + 1).padStart(2, '0')}`,
      gender: gender.value,
    }))

  saving.value = true
  error.value = ''
  progress.value = { done: 0, total: items.length }

  try {
    const result = await uploadPortraitSlices(items, (done, total) => {
      progress.value = { done, total }
    })
    notice.value = `已导入 ${result.added.length} 张立绘`
      + (result.errors.length ? `，${result.errors.length} 张失败` : '')
    if (result.errors.length) error.value = result.errors[0]
    if (result.added.length) closeImport()
  } catch (err) {
    error.value = err?.message || '导入失败'
  } finally {
    saving.value = false
  }
}

const onCard = async (portrait) => {
  if (target.value && props.run) {
    await useForTarget(portrait)
    return
  }
  activePortrait.value = portrait
  nameDraft.value = portrait.name
  renaming.value = false
  confirmDelete.value = false
}

const useForTarget = async (portrait) => {
  if (!props.run || !target.value) return
  try {
    await assignPortrait(props.run.id, target.value.id, portrait.id)
    emit('picked', portrait)
  } catch (err) {
    error.value = err?.message || '分配失败'
  }
}

const clearTarget = async () => {
  if (!props.run || !target.value) return
  try {
    await assignPortrait(props.run.id, target.value.id, '')
    notice.value = '已取消这张立绘'
  } catch (err) {
    error.value = err?.message || '操作失败'
  }
}

const handleAutoAssign = async () => {
  if (!props.run || assigning.value) return
  assigning.value = true
  error.value = ''
  notice.value = ''
  try {
    const count = await autoAssignPortraits(props.run)
    notice.value = count
      ? `已为 ${count} 人分配立绘`
      : '没有可补的空位（人物都已分配，或性别不匹配）'
  } catch (err) {
    error.value = err?.message || '自动分配失败'
  } finally {
    assigning.value = false
  }
}

const closeLightbox = () => {
  activePortrait.value = null
  renaming.value = false
  confirmDelete.value = false
}

const startRename = () => {
  if (!activePortrait.value) return
  renaming.value = true
  nameDraft.value = activePortrait.value.name
}

const saveRename = async () => {
  if (!activePortrait.value || renamingSaving.value) return
  const name = nameDraft.value.trim()
  if (!name) {
    error.value = '名称不能为空'
    return
  }
  renamingSaving.value = true
  try {
    const updated = await updatePortraitMeta(activePortrait.value.id, { name })
    activePortrait.value = updated
    renaming.value = false
    notice.value = '已改名'
  } catch (err) {
    error.value = err?.message || '改名失败'
  } finally {
    renamingSaving.value = false
  }
}

const cycleGenderOf = async (portrait) => {
  if (!portrait) return
  const order = ['male', 'female', 'all']
  const current = portrait.gender || 'male'
  const next = order[(order.indexOf(current) + 1) % order.length]
  try {
    const updated = await updatePortraitMeta(portrait.id, { gender: next })
    if (activePortrait.value?.id === updated.id) activePortrait.value = updated
    notice.value = `${updated.name} 已标记为${genderLabel(next)}`
  } catch (err) {
    error.value = err?.message || '修改失败'
  }
}

const clearAssignments = async () => {
  if (!props.run) return
  if (!confirmClear.value) {
    confirmClear.value = true
    window.clearTimeout(confirmClearTimer)
    confirmClearTimer = window.setTimeout(() => { confirmClear.value = false }, 3000)
    return
  }
  try {
    await clearRunAssignments(props.run.id)
    notice.value = '已清空当前存档的立绘分配'
    confirmClear.value = false
  } catch (err) {
    error.value = err?.message || '清空失败'
  }
}

const cycleGender = async () => {
  if (!activePortrait.value) return
  const order = ['male', 'female', 'all']
  const current = activePortrait.value.gender || 'male'
  const next = order[(order.indexOf(current) + 1) % order.length]
  try {
    const updated = await updatePortraitMeta(activePortrait.value.id, { gender: next })
    activePortrait.value = updated
    notice.value = `已标记为${genderLabel(next)}`
  } catch (err) {
    error.value = err?.message || '修改失败'
  }
}

const removeActive = async () => {
  if (!activePortrait.value) return
  if (!confirmDelete.value) {
    confirmDelete.value = true
    clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => { confirmDelete.value = false }, 3000)
    return
  }
  try {
    await removePortrait(activePortrait.value.id)
    notice.value = '已删除这张立绘'
    closeLightbox()
  } catch (err) {
    error.value = err?.message || '删除失败'
  }
}
</script>

<template>
  <div class="page portrait-page">
    <header class="page-head">
      <div>
        <p class="eyebrow">资源包</p>
        <h1>立绘库</h1>
        <p class="page-sub">
          {{ portraits.length }} 张立绘 · 男 {{ genderCounts.male }} / 女 {{ genderCounts.female }} / 通用 {{ genderCounts.all }}
          <template v-if="run"> · 当前存档 {{ assignedCount }} 人已分配</template>
        </p>
      </div>
      <div class="head-actions">
        <button
          v-if="run && !target && assignedCount"
          type="button"
          class="btn btn-ghost"
          @click="clearAssignments"
        >
          {{ confirmClear ? '确认清空' : '清空分配' }}
        </button>
        <button
          v-if="run && !target"
          type="button"
          class="btn btn-ghost"
          :disabled="assigning || !portraits.length"
          @click="handleAutoAssign"
        >
          {{ assigning ? '分配中…' : '自动分配' }}
        </button>
        <button type="button" class="btn btn-primary" @click="openImport">导入整图</button>
      </div>
    </header>

    <p v-if="run" class="note portrait-tip">
      立绘按性别自动匹配；女性角色（包括君主）需要「女」或「通用」立绘。点卡片左下角可直接改性别。
    </p>

    <div v-if="target" class="target-banner">
      <div class="target-main">
        <span class="eyebrow">正在选择</span>
        <b>{{ target.name }}</b>
        <span class="target-sub">{{ target.office || target.roleLabel || (target.id === run?.ruler?.id ? '君主' : '') }}</span>
        <span v-if="targetPortrait" class="target-current">当前：{{ targetPortrait.name }}</span>
      </div>
      <div class="target-actions">
        <button v-if="targetPortrait" type="button" class="link-btn" @click="clearTarget">
          取消当前立绘
        </button>
        <button type="button" class="link-btn" @click="emit('back')">返回</button>
      </div>
    </div>

    <div v-if="portraits.length" class="gender-filter">
      <button
        v-for="item in FILTERS"
        :key="item.value"
        type="button"
        :class="{ 'is-active': genderFilter === item.value }"
        @click="genderFilter = item.value"
      >
        {{ item.label }}
        <span>{{ item.value === 'all' ? portraits.length : (item.value === 'general' ? genderCounts.all : genderCounts[item.value]) }}</span>
      </button>
    </div>

    <p v-if="notice" class="notice">{{ notice }}</p>
    <p v-if="error" class="error-text">{{ error }}</p>

    <section v-if="importOpen" class="card import-panel">
      <div class="import-head">
        <div>
          <h2>导入整图</h2>
          <p class="note">
            支持 5×2 这类多格拼图。按等分网格切开后入库，图片保存在服务器 data/portraits，不会写进存档。
          </p>
        </div>
        <button type="button" class="icon-btn" aria-label="收起" @click="closeImport">×</button>
      </div>

      <div class="import-row">
        <label class="file-pick btn btn-ghost">
          选择图片
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            @change="onFiles"
          />
        </label>

        <label class="imp-field">
          列数
          <select v-model.number="cols" class="input">
            <option v-for="n in 8" :key="`c${n}`" :value="n">{{ n }}</option>
          </select>
        </label>
        <label class="imp-field">
          行数
          <select v-model.number="rows" class="input">
            <option v-for="n in 8" :key="`r${n}`" :value="n">{{ n }}</option>
          </select>
        </label>
        <label class="imp-field">
          性别
          <select v-model="gender" class="input">
            <option value="male">男</option>
            <option value="female">女</option>
            <option value="all">通用</option>
          </select>
        </label>
        <label class="imp-field imp-prefix">
          命名
          <input v-model="prefix" class="input" maxlength="12" />
        </label>
        <button
          type="button"
          class="btn btn-ghost"
          :disabled="!sheetFiles.length || slicing"
          @click="buildSlices"
        >
          {{ slicing ? `切分中 ${progress.done}/${progress.total}` : '重新切分' }}
        </button>
      </div>

      <p v-if="sheetFiles.length" class="note">
        {{ sheetFiles.length }} 张拼图 · {{ slices.length }} 张切片
      </p>

      <div v-if="slices.length" class="slice-grid">
        <label
          v-for="(slice, index) in slices"
          :key="`${slice.row}-${slice.col}-${index}`"
          class="slice"
          :class="{ 'is-picked': picked[index] }"
        >
          <img :src="slice.dataUrl" alt="" />
          <input type="checkbox" :checked="picked[index]" @change="toggleSlice(index)" />
          <span class="slice-index">{{ index + 1 }}</span>
        </label>
      </div>

      <div v-if="slices.length" class="import-foot">
        <div class="import-pick">
          <button type="button" class="link-btn" @click="toggleAll(true)">全选</button>
          <button type="button" class="link-btn" @click="toggleAll(false)">全不选</button>
          <span class="note">已选 {{ pickedCount }} 张</span>
        </div>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="!pickedCount || saving"
          @click="importSelected"
        >
          {{ saving ? `导入中 ${progress.done}/${progress.total}` : `导入 ${pickedCount} 张` }}
        </button>
      </div>
    </section>

    <p v-if="loading && !portraits.length" class="empty">正在读取立绘库…</p>

    <div v-else-if="!portraits.length" class="empty portrait-empty">
      <p>还没有立绘。</p>
      <p class="note">导入一张多格拼图，切成单张后就能给人物分配，也能随时点开看大图。</p>
      <button type="button" class="btn btn-primary" @click="openImport">导入第一张</button>
    </div>

    <p v-else-if="!visiblePortraits.length" class="empty">这个分类下还没有立绘。</p>

    <div v-else class="portrait-grid">
      <div
        v-for="portrait in visiblePortraits"
        :key="portrait.id"
        class="p-card"
        :class="{ 'is-target': target }"
        role="button"
        tabindex="0"
        @click="onCard(portrait)"
        @keydown.enter="onCard(portrait)"
      >
        <div class="p-card-art">
          <img
            v-if="!brokenIds.includes(portrait.id)"
            :src="portraitUrl(portrait.id)"
            :alt="portrait.name"
            loading="lazy"
            @error="markBroken(portrait.id)"
          />
          <span v-else class="p-fallback">{{ portrait.name.slice(0, 2) }}</span>
          <button
            type="button"
            class="p-gender"
            :class="`is-${portrait.gender}`"
            title="点击切换性别"
            @click.stop="cycleGenderOf(portrait)"
          >{{ genderLabel(portrait.gender) }}</button>
          <span v-if="assignedNames[portrait.id]" class="p-assigned">{{ assignedNames[portrait.id] }}</span>
          <span v-if="target" class="p-use">使用</span>
        </div>
        <div class="p-card-foot">
          <span class="p-name">{{ portrait.name }}</span>
          <span class="p-size">{{ portrait.width }}×{{ portrait.height }}</span>
        </div>
      </div>
    </div>

    <PortraitLightbox
      v-if="activePortrait"
      :url="portraitUrl(activePortrait.id)"
      :name="activePortrait.name"
      :subtitle="activeSubtitle"
      @close="closeLightbox"
    >
      <template #actions>
        <template v-if="renaming">
          <input
            v-model="nameDraft"
            class="input rename-input"
            maxlength="40"
            @keydown.enter="saveRename"
          />
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="renamingSaving"
            @click="saveRename"
          >
            保存
          </button>
          <button type="button" class="btn btn-ghost btn-sm" @click="renaming = false">取消</button>
        </template>
        <template v-else>
          <button type="button" class="btn btn-ghost btn-sm" @click="cycleGender">
            性别 · {{ genderLabel(activePortrait.gender) }}
          </button>
          <button type="button" class="btn btn-ghost btn-sm" @click="startRename">改名</button>
          <button type="button" class="btn btn-ghost btn-sm is-danger" @click="removeActive">
            {{ confirmDelete ? '确认删除' : '删除' }}
          </button>
        </template>
      </template>
    </PortraitLightbox>
  </div>
</template>

<style scoped>
.portrait-page {
  width: 100%;
  max-width: 940px;
  margin: 0 auto;
  padding-bottom: 24px;
  animation: portrait-page-in 0.2s ease;
}

@keyframes portrait-page-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}

.page-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin: 2px 0 18px;
}

.page-head h1 {
  margin: 4px 0 0;
  font-family: var(--font-serif);
  font-size: 1.6rem;
  font-weight: 500;
  letter-spacing: 0.14em;
  color: var(--text);
}

.page-sub {
  margin: 6px 0 0;
  font-family: var(--font-sans);
  font-size: 0.76rem;
  letter-spacing: 0.02em;
  color: var(--dim);
}

.head-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.link-btn {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--gold);
  font-family: var(--font-sans);
  font-size: 0.74rem;
  letter-spacing: 0.06em;
  text-decoration: none;
  cursor: pointer;
}

.link-btn:hover {
  color: var(--gold-bright);
}

.notice {
  margin: 0 0 14px;
  padding: 9px 12px;
  border: 1px solid rgba(122, 168, 156, 0.32);
  border-left: 2px solid var(--jade);
  border-radius: var(--r-sm);
  background: rgba(122, 168, 156, 0.08);
  color: var(--jade);
  font-family: var(--font-sans);
  font-size: 0.76rem;
  letter-spacing: 0.02em;
}

.error-text {
  margin: 0 0 14px;
  color: var(--red);
  font-family: var(--font-sans);
  font-size: 0.76rem;
}

.portrait-tip {
  margin: -6px 0 16px;
}

.gender-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 14px;
}

.gender-filter button {
  padding: 5px 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-family: var(--font-sans);
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.gender-filter button span {
  margin-left: 5px;
  color: var(--dim);
}

.gender-filter button.is-active {
  border-color: var(--gold-line);
  background: rgba(201, 162, 39, 0.14);
  color: var(--gold-bright);
}

.gender-filter button.is-active span {
  color: var(--gold);
}

.target-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 16px;
  padding: 12px 14px;
  border: 1px solid var(--gold-line);
  border-radius: var(--r-md);
  background:
    linear-gradient(90deg, rgba(201, 162, 39, 0.12), rgba(201, 162, 39, 0.02));
}

.target-main {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.target-main b {
  font-family: var(--font-serif);
  font-size: 1.08rem;
  font-weight: 500;
  letter-spacing: 0.1em;
  color: var(--gold-bright);
}

.target-sub,
.target-current {
  font-family: var(--font-sans);
  font-size: 0.7rem;
  color: var(--muted);
}

.target-current {
  color: var(--dim);
}

.target-actions {
  display: flex;
  gap: 14px;
}

.import-panel {
  margin-bottom: 18px;
  padding: 16px;
}

.import-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.import-head h2 {
  margin: 0 0 4px;
  font-family: var(--font-serif);
  font-size: 1.05rem;
  font-weight: 500;
  letter-spacing: 0.08em;
}

.import-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
  margin-top: 14px;
}

.file-pick {
  position: relative;
  display: inline-flex;
  align-items: center;
  height: 40px;
  overflow: hidden;
  cursor: pointer;
}

.file-pick input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.imp-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: var(--font-sans);
  font-size: 0.66rem;
  letter-spacing: 0.08em;
  color: var(--muted);
}

.imp-field .input {
  width: 72px;
  min-height: 40px;
  padding: 6px 8px;
  font-size: 0.82rem;
}

.imp-prefix .input {
  width: 108px;
}

.slice-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(74px, 1fr));
  gap: 8px;
  max-height: 330px;
  margin-top: 12px;
  padding: 2px;
  overflow-y: auto;
}

.slice {
  position: relative;
  aspect-ratio: 3 / 4;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: #111;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s ease, opacity 0.15s ease;
  opacity: 0.55;
}

.slice.is-picked {
  border-color: var(--gold-line);
  box-shadow: 0 0 0 1px var(--gold-line);
  opacity: 1;
}

.slice img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.slice input {
  position: absolute;
  top: 5px;
  right: 5px;
  accent-color: var(--gold);
}

.slice-index {
  position: absolute;
  bottom: 4px;
  left: 4px;
  padding: 0 4px;
  border-radius: 2px;
  background: rgba(6, 5, 4, 0.72);
  color: var(--muted);
  font-family: var(--font-sans);
  font-size: 0.58rem;
}

.import-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.import-pick {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
}

.portrait-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
  gap: 10px;
}

.p-card {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--panel);
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.16s ease, transform 0.14s ease;
}

.p-card:hover,
.p-card:focus-visible {
  border-color: var(--gold-line);
  transform: translateY(-1px);
  outline: none;
}

.p-card-art {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 3 / 4;
  background: #0f0d0b;
  overflow: hidden;
}

.p-card-art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 16%;
  transition: transform 0.25s ease;
}

.p-card:hover .p-card-art img {
  transform: scale(1.025);
}

.p-fallback {
  color: rgba(201, 162, 39, 0.3);
  font-family: var(--font-serif);
  font-size: 1.8rem;
}

.p-gender {
  position: absolute;
  bottom: 7px;
  left: 7px;
  padding: 1px 6px;
  border: 1px solid var(--line-strong);
  border-radius: 2px;
  background: rgba(8, 7, 6, 0.7);
  color: var(--muted);
  font-family: var(--font-sans);
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.p-gender:hover {
  border-color: var(--gold-line);
  color: var(--gold-bright);
}

.p-assigned {
  position: absolute;
  top: 7px;
  right: 7px;
  max-width: calc(100% - 14px);
  padding: 1px 6px;
  border: 1px solid rgba(201, 162, 39, 0.4);
  border-radius: 2px;
  background: rgba(8, 7, 6, 0.78);
  color: var(--gold-bright);
  font-family: var(--font-sans);
  font-size: 0.6rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.p-use {
  position: absolute;
  right: 7px;
  bottom: 7px;
  padding: 1px 7px;
  border-radius: 2px;
  background: rgba(201, 162, 39, 0.16);
  color: var(--gold-bright);
  font-family: var(--font-sans);
  font-size: 0.6rem;
}

.p-card-foot {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  padding: 7px 9px 8px;
}

.p-name {
  min-width: 0;
  font-family: var(--font-serif);
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.p-size {
  flex: 0 0 auto;
  font-family: var(--font-sans);
  font-size: 0.58rem;
  color: var(--dim);
}

.portrait-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 54px 20px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--r-md);
  text-align: center;
}

.rename-input {
  width: 150px;
  min-height: 36px;
  padding: 6px 8px;
  font-size: 0.85rem;
}

.btn.is-danger {
  border-color: rgba(189, 92, 82, 0.4);
  color: #dcaea7;
}

@media (max-width: 560px) {
  .head-actions {
    width: 100%;
  }

  .head-actions .btn {
    flex: 1;
  }

  .import-panel {
    padding: 13px;
  }

  .imp-field .input {
    width: 64px;
  }

  .portrait-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
