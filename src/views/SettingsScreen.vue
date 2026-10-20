<script setup>
import { computed, onMounted, ref } from 'vue'
import { llmConfigApi } from '../game/llmConfig.js'

const emit = defineEmits(['back', 'changed'])

const config = ref({ profiles: [], activeId: '', storagePath: '' })
const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const error = ref('')
const notice = ref('')
const showForm = ref(false)
const confirmId = ref('')
const busyId = ref('')

const emptyForm = () => ({
  id: '',
  name: '',
  apiBase: '',
  model: '',
  apiKey: '',
  extraParams: '',
})
const form = ref(emptyForm())

const PRESETS = [
  { label: 'OpenAI', apiBase: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  { label: 'DeepSeek', apiBase: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat' },
  { label: 'Kimi', apiBase: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k' },
  { label: '智谱', apiBase: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash' },
  { label: 'Ollama', apiBase: 'http://127.0.0.1:11434/v1/chat/completions', model: 'qwen2.5:7b' },
]

const active = computed(() => (
  config.value.profiles.find((item) => item.id === config.value.activeId) || null
))

const apply = (data) => {
  if (!data) return
  config.value = {
    profiles: Array.isArray(data.profiles) ? data.profiles : [],
    activeId: data.activeId || '',
    storagePath: data.storagePath || '',
  }
}

const load = async () => {
  loading.value = true
  error.value = ''
  try {
    apply(await llmConfigApi.load())
  } catch (err) {
    error.value = err?.message || '读取配置失败'
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  form.value = emptyForm()
  showForm.value = true
  error.value = ''
  notice.value = ''
}

const openEdit = (profile) => {
  form.value = {
    id: profile.id,
    name: profile.name,
    apiBase: profile.apiBase,
    model: profile.model,
    apiKey: '',
    extraParams: profile.extraParams || '',
  }
  showForm.value = true
  error.value = ''
  notice.value = ''
}

const usePreset = (preset) => {
  form.value.apiBase = preset.apiBase
  form.value.model = preset.model
  if (!form.value.name) form.value.name = preset.label
}

const closeForm = () => {
  showForm.value = false
  form.value = emptyForm()
  testing.value = false
  notice.value = ''
}

const submit = async () => {
  if (saving.value) return
  error.value = ''
  notice.value = ''
  if (!form.value.apiBase.trim() || !form.value.model.trim()) {
    error.value = '请填写接口地址与模型名'
    return
  }
  if (!form.value.id && !form.value.apiKey.trim()) {
    error.value = '新建配置必须填写 API Key'
    return
  }

  saving.value = true
  try {
    const payload = {
      name: form.value.name.trim() || '未命名配置',
      apiBase: form.value.apiBase.trim(),
      model: form.value.model.trim(),
      extraParams: form.value.extraParams.trim(),
    }
    if (form.value.apiKey.trim()) payload.apiKey = form.value.apiKey.trim()

    const isNew = !form.value.id
    const data = form.value.id
      ? await llmConfigApi.update(form.value.id, payload)
      : await llmConfigApi.create({ ...payload, apiKey: form.value.apiKey.trim(), activate: true })

    apply(data)
    if (isNew) {
      await llmConfigApi.activate(data.profile.id)
      apply(await llmConfigApi.load())
    }
    emit('changed')
    closeForm()
    notice.value = isNew ? '已保存，并设为当前使用' : '已保存修改，立即生效'
  } catch (err) {
    error.value = err?.message || '保存失败'
  } finally {
    saving.value = false
  }
}

const testDraft = async () => {
  if (testing.value) return
  error.value = ''
  notice.value = ''
  if (!form.value.apiBase.trim() || !form.value.model.trim()) {
    error.value = '请先填写接口地址与模型名'
    return
  }
  testing.value = true
  try {
    const result = await llmConfigApi.test({
      id: form.value.id,
      name: form.value.name,
      apiBase: form.value.apiBase,
      model: form.value.model,
      apiKey: form.value.apiKey,
      extraParams: form.value.extraParams,
    })
    if (result.success) {
      notice.value = `连接成功 · ${result.latency}ms · 回话：${result.data || '（空）'}`
    } else {
      error.value = result.error || '连接失败'
    }
  } catch (err) {
    error.value = err?.message || '连接失败'
  } finally {
    testing.value = false
  }
}

const testSaved = async (profile) => {
  if (busyId.value) return
  busyId.value = profile.id
  error.value = ''
  notice.value = ''
  try {
    const result = await llmConfigApi.test({ profileId: profile.id })
    if (result.success) {
      notice.value = `「${profile.name}」连接成功 · ${result.latency}ms`
    } else {
      error.value = `「${profile.name}」：${result.error || '连接失败'}`
    }
  } catch (err) {
    error.value = err?.message || '连接失败'
  } finally {
    busyId.value = ''
  }
}

const activate = async (profile) => {
  if (busyId.value) return
  busyId.value = profile.id
  error.value = ''
  notice.value = ''
  try {
    apply(await llmConfigApi.activate(profile.id))
    emit('changed')
    notice.value = `已切换到「${profile.name}」`
  } catch (err) {
    error.value = err?.message || '切换失败'
  } finally {
    busyId.value = ''
  }
}

const remove = async (profile) => {
  if (confirmId.value !== profile.id) {
    confirmId.value = profile.id
    return
  }
  confirmId.value = ''
  busyId.value = profile.id
  error.value = ''
  notice.value = ''
  try {
    apply(await llmConfigApi.remove(profile.id))
    emit('changed')
    notice.value = `已删除「${profile.name}」`
    if (form.value.id === profile.id) closeForm()
  } catch (err) {
    error.value = err?.message || '删除失败'
  } finally {
    busyId.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div class="settings">
    <header class="settings-head">
      <button type="button" class="icon-btn" aria-label="返回" @click="emit('back')">‹</button>
      <div class="settings-title">
        <h1>设置</h1>
        <p>AI 接口 · 可保存多套并随时切换</p>
      </div>
      <button type="button" class="btn btn-sm btn-ghost" @click="load">刷新</button>
    </header>

    <div class="settings-body">
      <section class="active-card" :class="{ 'is-off': !active }">
        <div class="active-main">
          <div class="eyebrow">当前使用</div>
          <h2>{{ active ? active.name : '尚未配置' }}</h2>
          <p v-if="active">
            <span class="mono">{{ active.model }}</span>
            <span class="dot">·</span>
            <span class="mono ellipsis">{{ active.apiBase }}</span>
          </p>
          <p v-else class="muted">未配置也能玩：人设、奏报会退回本地模板。配置后由模型撰写文字。</p>
        </div>
        <div class="active-side">
          <span class="chip" :class="active ? 'chip-jade' : 'chip-red'">{{ active ? '已启用' : '未启用' }}</span>
          <button
            v-if="active"
            type="button"
            class="btn btn-sm"
            :disabled="busyId === active.id"
            @click="testSaved(active)"
          >{{ busyId === active.id ? '测试中…' : '测试连接' }}</button>
        </div>
      </section>

      <p v-if="error" class="alert is-error">{{ error }}</p>
      <p v-if="notice" class="alert is-ok">{{ notice }}</p>

      <div class="section">
        <span>已保存的配置 · {{ config.profiles.length }}</span>
        <button type="button" class="btn btn-sm btn-primary" @click="openCreate">新增配置</button>
      </div>

      <p v-if="loading" class="note">正在读取配置…</p>
      <div v-else-if="config.profiles.length === 0" class="empty">
        还没有任何 AI 接口配置。新增一套后即可启用。
      </div>

      <ul v-else class="profile-list">
        <li
          v-for="profile in config.profiles"
          :key="profile.id"
          class="profile"
          :class="{ 'is-active': profile.id === config.activeId }"
        >
          <div class="profile-head">
            <div class="profile-name">
              <b>{{ profile.name }}</b>
              <span v-if="profile.id === config.activeId" class="chip chip-gold">当前</span>
              <span v-if="profile.readOnly" class="chip">只读 · 环境变量</span>
            </div>
            <span class="chip">{{ profile.keyHint || '未保存密钥' }}</span>
          </div>
          <div class="profile-meta">
            <span class="mono">{{ profile.model }}</span>
            <span class="ellipsis">{{ profile.source === 'env' ? '来自服务器 .env' : profile.apiBase }}</span>
          </div>
          <div v-if="profile.extraParams" class="profile-extra">
            额外参数 <code>{{ profile.extraParams }}</code>
          </div>
          <div class="profile-actions">
            <button
              v-if="profile.id !== config.activeId"
              type="button"
              class="btn btn-sm btn-primary"
              :disabled="busyId === profile.id"
              @click="activate(profile)"
            >启用</button>
            <span v-else class="chip chip-jade">正在使用</span>
            <button
              type="button"
              class="btn btn-sm btn-ghost"
              :disabled="busyId === profile.id"
              @click="testSaved(profile)"
            >测试</button>
            <button
              v-if="!profile.readOnly"
              type="button"
              class="btn btn-sm btn-ghost"
              @click="openEdit(profile)"
            >编辑</button>
            <button
              v-if="!profile.readOnly"
              type="button"
              class="btn btn-sm btn-ghost"
              :class="{ 'btn-danger': confirmId === profile.id }"
              :disabled="busyId === profile.id"
              @click="remove(profile)"
            >{{ confirmId === profile.id ? '确认删除' : '删除' }}</button>
          </div>
        </li>
      </ul>

      <p v-if="config.storagePath" class="note">
        配置保存在服务器 <code class="mono">{{ config.storagePath }}</code>，密钥不回传浏览器；切换后立即生效，无需重启。
      </p>

      <div v-if="showForm" class="mask" @click.self="closeForm">
        <form class="sheet" @submit.prevent="submit">
          <div class="sheet-head">
            <h3>{{ form.id ? '编辑配置' : '新增配置' }}</h3>
            <button type="button" class="icon-btn" @click="closeForm">×</button>
          </div>

          <div class="presets">
            <span>快速填入</span>
            <button
              v-for="preset in PRESETS"
              :key="preset.label"
              type="button"
              class="chip"
              @click="usePreset(preset)"
            >{{ preset.label }}</button>
          </div>

          <label class="field">
            <span>名称</span>
            <input v-model="form.name" type="text" maxlength="40" placeholder="例如：主力模型 / 备用" />
          </label>

          <label class="field">
            <span>接口地址</span>
            <input
              v-model="form.apiBase"
              type="text"
              placeholder="https://api.example.com/v1/chat/completions"
              autocomplete="off"
              spellcheck="false"
            />
            <small>OpenAI 兼容接口；只填到 /v1 也会自动补 /chat/completions。</small>
          </label>

          <label class="field">
            <span>模型名</span>
            <input v-model="form.model" type="text" placeholder="gpt-4o-mini / deepseek-chat" autocomplete="off" />
          </label>

          <label class="field">
            <span>API Key</span>
            <input
              v-model="form.apiKey"
              type="password"
              :placeholder="form.id ? '留空则沿用已保存的密钥' : 'sk-...'"
              autocomplete="new-password"
              spellcheck="false"
            />
            <small>只写入服务器配置文件；页面刷新后仅显示掩码。</small>
          </label>

          <label class="field">
            <span>额外参数（可选）</span>
            <textarea
              v-model="form.extraParams"
              rows="2"
              placeholder='{"top_p":0.95}'
              spellcheck="false"
            ></textarea>
            <small>JSON 对象，会并入请求体；留空即可。</small>
          </label>

          <p v-if="error" class="alert is-error">{{ error }}</p>
          <p v-if="notice" class="alert is-ok">{{ notice }}</p>

          <div class="btn-row">
            <button type="button" class="btn" :disabled="testing" @click="testDraft">
              {{ testing ? '测试中…' : '测试连接' }}
            </button>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? '保存中…' : (form.id ? '保存修改' : '保存并启用') }}
            </button>
          </div>
          <button type="button" class="btn btn-ghost btn-block form-cancel" @click="closeForm">取消</button>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings {
  flex: 1;
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.settings-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px max(16px, calc((100% - 860px) / 2 + 24px));
  padding-top: max(12px, var(--safe-top));
  border-bottom: 1px solid var(--line);
  background: rgba(10, 9, 8, 0.72);
}

.settings-title {
  flex: 1;
  min-width: 0;
}

.settings-title h1 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 1.1rem;
  font-weight: 500;
  letter-spacing: 0.18em;
  color: var(--gold-bright);
}

.settings-title p {
  margin: 2px 0 0;
  font-family: var(--font-sans);
  font-size: 0.7rem;
  color: var(--dim);
  letter-spacing: 0.06em;
}

.settings-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 16px 40px;
  width: 100%;
  max-width: 860px;
  margin: 0 auto;
}

.active-card {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--gold-line);
  border-radius: var(--r-lg);
  background:
    radial-gradient(circle at 100% 0, rgba(201, 162, 39, 0.14), transparent 62%),
    linear-gradient(180deg, #1d1812, #14110e);
}

.active-card.is-off {
  border-color: var(--line);
  background: linear-gradient(180deg, var(--panel-2), var(--panel));
}

.active-main {
  flex: 1 1 260px;
  min-width: 0;
}

.active-main h2 {
  margin: 6px 0 4px;
  font-family: var(--font-serif);
  font-size: 1.15rem;
  font-weight: 500;
  letter-spacing: 0.08em;
}

.active-main p {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 0.76rem;
  color: var(--muted);
  line-height: 1.8;
}

.active-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.74rem;
}

.ellipsis {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.dot {
  margin: 0 6px;
  color: var(--dim);
}

.alert {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: var(--r-sm);
  font-family: var(--font-sans);
  font-size: 0.78rem;
  line-height: 1.7;
  border: 1px solid var(--line);
}

.alert.is-error {
  border-color: rgba(189, 92, 82, 0.5);
  background: rgba(189, 92, 82, 0.08);
  color: #e3aaa3;
}

.alert.is-ok {
  border-color: rgba(122, 168, 156, 0.45);
  background: rgba(122, 168, 156, 0.08);
  color: #a8ccc2;
}

.profile-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.profile {
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--panel);
}

.profile.is-active {
  border-color: var(--gold-line);
  background: linear-gradient(180deg, rgba(201, 162, 39, 0.08), var(--panel));
}

.profile-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.profile-name {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.profile-name b {
  font-size: 0.95rem;
  font-weight: 500;
  letter-spacing: 0.04em;
}

.profile-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-top: 6px;
  font-family: var(--font-sans);
  font-size: 0.74rem;
  color: var(--dim);
}

.profile-extra {
  margin-top: 6px;
  font-family: var(--font-sans);
  font-size: 0.7rem;
  color: var(--dim);
}

.profile-extra code {
  color: var(--muted);
}

.profile-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.presets {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 14px;
  font-family: var(--font-sans);
  font-size: 0.7rem;
  color: var(--dim);
}

.presets .chip {
  cursor: pointer;
}

.presets .chip:hover {
  border-color: var(--gold-line);
  color: var(--gold-bright);
}

.form-cancel {
  margin-top: 8px;
}

.note code {
  color: var(--muted);
}

@media (min-width: 720px) {
  .settings-body {
    padding: 26px 24px 48px;
  }
}
</style>
