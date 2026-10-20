<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import {
  appendChatTurn,
  askChatFree,
  askChatTopic,
  getChatContacts,
  getChatTopics,
  startChatSession,
} from '../game-core/empire/index.js'
import { generateChatReply } from '../game/llm.js'

const props = defineProps({
  run: { type: Object, required: true },
  initialMode: { type: String, default: 'list' },
  initialCharacterId: { type: String, default: '' },
})

const emit = defineEmits(['back', 'update'])

const mode = ref(props.initialMode || 'list')
const listMode = ref(props.initialMode === 'duty' ? 'duty' : 'list')
const activeId = ref(props.initialCharacterId || '')
const messages = ref({})
const busy = ref(false)
const error = ref('')
const lastEffect = ref('')
const detailOpen = ref(false)
const contactOpen = ref(false)
const filter = ref('全部')
const draft = ref('')
const workingRun = ref(props.run)

watch(() => props.run, (next) => {
  if (next) workingRun.value = next
})

const contacts = computed(() => getChatContacts(workingRun.value))
const active = computed(() => (
  contacts.value.find((item) => item.id === activeId.value) || null
))
const topics = computed(() => (
  active.value ? getChatTopics(workingRun.value, active.value.id) : []
))
const currentMessages = computed(() => messages.value[activeId.value] || [])
const activeMemory = computed(() => (
  active.value ? workingRun.value.chatMemory?.[active.value.id] || null : null
))

const filteredContacts = computed(() => {
  if (filter.value === '全部') return contacts.value
  const map = {
    朝臣: 'minister',
    宗室: 'clan',
    后宫: 'consort',
    内侍: 'servant',
    子嗣: 'child',
  }
  return contacts.value.filter((item) => item.role === map[filter.value])
})

const roleClass = (contact) => (
  contact?.role === 'consort' ? 'is-consort' : (contact?.role === 'servant' ? 'is-inner' : '')
)

const greetingFor = (role) => ({
  minister: '臣叩见陛下。',
  clan: '臣宗室末支，见过陛下。',
  consort: '臣妾给陛下请安。',
  servant: '奴才给陛下请安。',
  child: '儿臣见过母皇。',
}[role] || '臣见过陛下。')

const ensureMessages = (id) => {
  if (messages.value[id]) return
  const contact = contacts.value.find((item) => item.id === id)
  const memory = workingRun.value.chatMemory?.[id]
  if (Array.isArray(memory?.messages) && memory.messages.length > 0) {
    messages.value[id] = memory.messages.map((item) => ({ ...item }))
    return
  }
  messages.value[id] = [{
    from: 'them',
    text: greetingFor(contact?.role),
    time: '此刻',
  }]
}

const memoryPreview = (contact) => {
  const memory = workingRun.value.chatMemory?.[contact.id]
  const list = memory?.messages || []
  const last = [...list].reverse().find((item) => item.from === 'them')
  return last?.text || '还没有说过话'
}

const formatEffects = (effects = {}) => {
  const labels = {
    loyalty: '忠诚',
    ambition: '野心',
    intelligence: '圣听',
    prestige: '威望',
    popularity: '民心',
    civil: '文治',
    military: '武略',
    strategy: '智谋',
    charm: '魅力',
    finance: '理财',
    health: '健康',
  }
  const parts = Object.entries(effects)
    .filter(([, value]) => Number(value) !== 0)
    .map(([key, value]) => `${labels[key] || key} ${value > 0 ? '+' : ''}${value}`)
  return parts.length ? parts.join(' · ') : '关系略有变化'
}

const selectContact = (id, nextMode = 'chat') => {
  if (!id || busy.value) return
  const result = startChatSession(workingRun.value, id)
  if (!result.success) {
    error.value = result.message
    mode.value = 'list'
    listMode.value = 'list'
    return
  }
  workingRun.value = result.state
  emit('update', result.state)
  activeId.value = id
  ensureMessages(id)
  mode.value = nextMode
  contactOpen.value = false
  error.value = ''
  lastEffect.value = ''
  draft.value = ''
}

const appendTo = (contactId, from, text) => {
  if (!messages.value[contactId]) messages.value[contactId] = []
  messages.value[contactId].push({ from, text, time: '此刻' })
}

const ask = async (kind, value, label = value) => {
  if (!active.value || busy.value) return
  const contact = active.value
  busy.value = true
  error.value = ''

  appendTo(contact.id, 'me', label)

  const result = kind === 'topic'
    ? askChatTopic(workingRun.value, contact.id, value)
    : askChatFree(workingRun.value, contact.id, value)

  if (!result.success) {
    error.value = result.message
    busy.value = false
    return
  }

  workingRun.value = result.state
  emit('update', result.state)
  lastEffect.value = `${formatEffects(result.effects)}${result.note ? ` · ${result.note}` : ''}`

  const character = result.state.characters.find((item) => item.id === contact.id)
  const history = (messages.value[contact.id] || []).slice(-8)
  let reply = result.reply
  try {
    const llm = await generateChatReply({
      state: result.state,
      character,
      topicLabel: kind === 'topic' ? label : '自由对话',
      message: label,
      history,
      localReply: result.reply,
    })
    if (llm.success && llm.text) reply = llm.text
  } catch {
    // 模型失败时保留本地回话
  }

  appendTo(contact.id, 'them', reply)
  const saved = appendChatTurn(workingRun.value, contact.id, label, reply)
  if (saved.success) {
    workingRun.value = saved.state
    emit('update', saved.state)
  }
  busy.value = false
}

const sendTopic = (topic) => ask('topic', topic.id, topic.label)
const sendDraft = () => {
  const value = draft.value.trim()
  if (!value) return
  ask('free', value)
  draft.value = ''
}

const back = () => {
  if (mode.value === 'list' || mode.value === 'duty') {
    emit('back')
    return
  }
  mode.value = listMode.value
}

const switchMode = (next) => {
  mode.value = next
}

onMounted(() => {
  if (props.initialCharacterId) {
    selectContact(
      props.initialCharacterId,
      props.initialMode === 'audience' ? 'audience' : (props.initialMode === 'letter' ? 'letter' : 'chat'),
    )
  }
})
</script>

<template>
  <div class="chat-screen">
    <!-- 联系人列表 A -->
    <template v-if="mode === 'list'">
      <header class="chat-list-head">
        <div>
          <h2>召见</h2>
          <p>{{ contacts.length }} 人可召 · 行动点 {{ run.actionPoints ?? 0 }}</p>
        </div>
        <button type="button" class="chat-ghost" @click="mode = 'duty'">值房</button>
      </header>

      <div class="chat-filters">
        <button
          v-for="item in ['全部', '朝臣', '宗室', '后宫', '内侍', '子嗣']"
          :key="item"
          type="button"
          :class="{ 'is-active': filter === item }"
          @click="filter = item"
        >{{ item }}</button>
      </div>

      <div class="chat-scroll">
        <button
          v-for="contact in filteredContacts"
          :key="contact.id"
          type="button"
          class="chat-contact"
          @click="selectContact(contact.id, 'chat')"
        >
          <div class="chat-avatar" :class="roleClass(contact)">{{ contact.name.slice(0, 1) }}</div>
          <div class="chat-contact-main">
            <div class="chat-contact-name">
              {{ contact.name }}
              <span class="chat-tag">{{ contact.roleLabel }}</span>
            </div>
            <div class="chat-contact-sub">{{ contact.office }} · {{ contact.attitude }} · 忠 {{ contact.loyalty }}</div>
            <div class="chat-contact-preview">{{ memoryPreview(contact) }}</div>
          </div>
        </button>
        <p v-if="error" class="chat-error">{{ error }}</p>
        <p v-if="!filteredContacts.length" class="chat-empty">这一类暂时没有人。</p>
      </div>
    </template>

    <!-- 值房 D -->
    <template v-else-if="mode === 'duty'">
      <header class="chat-list-head">
        <div>
          <h2>值房</h2>
          <p>今日谁在 · 行动点 {{ run.actionPoints ?? 0 }}</p>
        </div>
        <button type="button" class="chat-ghost" @click="mode = 'list'">名单</button>
      </header>
      <div class="chat-scroll">
        <div class="chat-duty-grid">
          <button
            v-for="contact in contacts"
            :key="contact.id"
            type="button"
            class="chat-duty-card"
            @click="selectContact(contact.id, 'chat')"
          >
            <div class="chat-duty-head">
              <div class="chat-avatar" :class="roleClass(contact)">{{ contact.name.slice(0, 1) }}</div>
              <div>
                <div class="chat-contact-name">{{ contact.name }}</div>
                <div class="chat-contact-sub">{{ contact.office }}</div>
              </div>
            </div>
            <div class="chat-duty-meta">{{ contact.attitude }} · 忠 {{ contact.loyalty }} · 野 {{ contact.ambition }}</div>
          </button>
        </div>
        <p v-if="error" class="chat-error">{{ error }}</p>
      </div>
    </template>

    <!-- 聊天 / 奏对 / 密折 -->
    <template v-else-if="active">
      <header class="chat-top">
        <button type="button" class="chat-icon" @click="back">‹</button>
        <div class="chat-avatar" :class="roleClass(active)">{{ active.name.slice(0, 1) }}</div>
        <div class="chat-top-main">
          <div class="chat-name">{{ active.name }}</div>
          <div class="chat-sub">{{ active.office }} · {{ active.attitude }}</div>
        </div>
        <button type="button" class="chat-icon" @click="detailOpen = true">⋯</button>
      </header>

      <div class="chat-mode-row">
        <button type="button" :class="{ 'is-active': mode === 'chat' }" @click="switchMode('chat')">聊天</button>
        <button type="button" :class="{ 'is-active': mode === 'audience' }" @click="switchMode('audience')">御前奏对</button>
        <button type="button" :class="{ 'is-active': mode === 'letter' }" @click="switchMode('letter')">密折</button>
        <button type="button" @click="contactOpen = true">换人</button>
      </div>

      <div v-if="mode === 'letter'" class="chat-letter">
        <div class="chat-letter-title">与{{ active.name }}书</div>
        <div class="chat-letter-meta">{{ active.office }} · {{ active.factionName || active.roleLabel }} · 亲启</div>
        <div v-for="(msg, index) in currentMessages" :key="index" class="chat-letter-line" :class="{ 'is-me': msg.from === 'me' }">
          {{ msg.from === 'me' ? '朱批：' : '' }}{{ msg.text }}
        </div>
        <div class="chat-seal">御览</div>
      </div>

      <div v-else class="chat-feed" :class="{ 'is-audience': mode === 'audience' }">
        <div
          v-for="(msg, index) in currentMessages"
          :key="index"
          class="chat-msg"
          :class="{ 'is-me': msg.from === 'me' }"
        >
          <div class="chat-avatar small" :class="roleClass(active)">
            {{ msg.from === 'me' ? '帝' : active.name.slice(0, 1) }}
          </div>
          <div>
            <div class="chat-bubble">{{ msg.text }}</div>
            <small>{{ msg.from === 'me' ? '你' : active.name }} · {{ msg.time }}</small>
          </div>
        </div>
        <div v-if="busy" class="chat-typing">对方正在斟酌……</div>
      </div>

      <div class="chat-topics">
        <button
          v-for="topic in topics"
          :key="topic.id"
          type="button"
          class="chat-topic"
          :disabled="busy"
          @click="sendTopic(topic)"
        >{{ topic.label }}</button>
      </div>

      <p v-if="lastEffect" class="chat-effect">{{ lastEffect }}</p>
      <p v-if="error" class="chat-error">{{ error }}</p>

      <div class="chat-composer">
        <input
          v-model="draft"
          type="text"
          :placeholder="`对${active.name}说……`"
          :disabled="busy"
          @keydown.enter.prevent="sendDraft"
        />
        <button type="button" class="chat-send" :disabled="busy" @click="sendDraft">发送</button>
      </div>
    </template>

    <!-- 关系抽屉 -->
    <div v-if="detailOpen && active" class="chat-mask" @click.self="detailOpen = false">
      <div class="chat-sheet">
        <div class="chat-sheet-head">
          <h3>{{ active.name }}</h3>
          <button type="button" class="chat-icon" @click="detailOpen = false">×</button>
        </div>
        <div class="chat-person">
          <div class="chat-avatar" :class="roleClass(active)">{{ active.name.slice(0, 1) }}</div>
          <div>
            <div class="chat-contact-name">{{ active.office }} · {{ active.factionName || active.roleLabel }}</div>
            <div class="chat-contact-sub">{{ active.attitude }}</div>
          </div>
        </div>
        <div class="chat-kv"><span>忠诚</span><b>{{ active.loyalty }}</b></div>
        <div class="chat-meter"><i :style="{ width: `${active.loyalty}%` }"></i></div>
        <div class="chat-kv"><span>野心</span><b>{{ active.ambition }}</b></div>
        <div class="chat-meter"><i :style="{ width: `${active.ambition}%`, background: 'var(--dyn-red)' }"></i></div>
        <div class="chat-kv"><span>把柄</span><b>{{ active.note }}</b></div>
        <div class="chat-kv"><span>召见</span><b>{{ activeMemory?.chats || 0 }} 次</b></div>
        <div class="chat-kv">
          <span>上次话题</span>
          <b>{{ activeMemory?.lastTopic ? (topics.find((item) => item.id === activeMemory.lastTopic)?.label || activeMemory.lastTopic) : '无' }}</b>
        </div>
        <div class="chat-effect-box">
          <div class="chat-contact-sub">本轮预计</div>
          {{ lastEffect || '尚未开口。' }}
        </div>
      </div>
    </div>

    <!-- 换人抽屉 -->
    <div v-if="contactOpen" class="chat-mask" @click.self="contactOpen = false">
      <div class="chat-sheet">
        <div class="chat-sheet-head">
          <h3>换一个人</h3>
          <button type="button" class="chat-icon" @click="contactOpen = false">×</button>
        </div>
        <button
          v-for="contact in contacts"
          :key="contact.id"
          type="button"
          class="chat-contact"
          @click="selectContact(contact.id, mode === 'letter' ? 'letter' : (mode === 'audience' ? 'audience' : 'chat'))"
        >
          <div class="chat-avatar" :class="roleClass(contact)">{{ contact.name.slice(0, 1) }}</div>
          <div class="chat-contact-main">
            <div class="chat-contact-name">{{ contact.name }}</div>
            <div class="chat-contact-sub">{{ contact.office }} · {{ contact.attitude }}</div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-screen {
  flex: 1;
  min-width: 0;
  min-height: 0;
  width: 100%;
  max-width: 100vw;
  padding-top: env(safe-area-inset-top);
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at 50% 0%, rgba(201, 162, 39, 0.05), transparent 32%),
    var(--dyn-ink);
  overflow: hidden;
}

.chat-list-head {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 13px 8px;
}

.chat-list-head h2 {
  margin: 0;
  font-family: var(--font-heading, serif);
  font-size: 1.1rem;
  font-weight: 500;
  letter-spacing: 0.1em;
  color: var(--dyn-gold-bright);
}

.chat-list-head p {
  margin: 2px 0 0;
  font-size: 0.56rem;
  color: var(--dyn-dim);
}

.chat-ghost {
  padding: 5px 8px;
  border: 1px solid var(--dyn-line);
  background: transparent;
  color: var(--dyn-muted);
  font-family: inherit;
  font-size: 0.56rem;
}

.chat-filters {
  flex-shrink: 0;
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding: 0 11px 8px;
  scrollbar-width: none;
}

.chat-filters::-webkit-scrollbar { display: none; }

.chat-filters button {
  flex: 0 0 auto;
  padding: 4px 8px;
  border: 1px solid var(--dyn-line-soft);
  background: transparent;
  color: var(--dyn-muted);
  font-family: inherit;
  font-size: 0.56rem;
}

.chat-filters button.is-active {
  border-color: var(--dyn-gold);
  color: var(--dyn-gold-bright);
}

.chat-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

.chat-contact {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 10px 13px;
  border: none;
  border-bottom: 1px solid var(--dyn-line-soft);
  background: transparent;
  color: var(--dyn-muted);
  text-align: left;
}

.chat-contact:active { background: rgba(201, 162, 39, 0.07); }

.chat-avatar {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 1px solid var(--dyn-line);
  background: radial-gradient(circle at 35% 30%, #3a2d1c, #171310 70%);
  color: var(--dyn-gold-bright);
  font-size: 1rem;
}

.chat-avatar.is-consort { border-color: rgba(139, 123, 176, 0.65); }
.chat-avatar.is-inner { border-color: rgba(111, 157, 146, 0.65); }
.chat-avatar.small { width: 28px; height: 28px; font-size: 0.68rem; }

.chat-contact-main { flex: 1; min-width: 0; }
.chat-contact-name { font-size: 0.74rem; color: var(--dyn-text); }
.chat-contact-sub { margin-top: 1px; font-size: 0.54rem; color: var(--dyn-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chat-contact-preview { margin-top: 2px; font-size: 0.56rem; color: var(--dyn-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.chat-tag {
  margin-left: 4px;
  padding: 0 4px;
  border: 1px solid var(--dyn-line);
  color: var(--dyn-muted);
  font-size: 0.48rem;
}

.chat-duty-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  padding: 10px 11px;
}

.chat-duty-card {
  padding: 9px;
  border: 1px solid var(--dyn-line-soft);
  background: var(--dyn-panel);
  color: var(--dyn-muted);
  text-align: left;
}

.chat-duty-card:active { border-color: var(--dyn-gold); }
.chat-duty-head { display: flex; align-items: center; gap: 7px; }
.chat-duty-head .chat-avatar { width: 32px; height: 32px; font-size: 0.75rem; }
.chat-duty-meta { margin-top: 5px; font-size: 0.52rem; color: var(--dyn-dim); line-height: 1.5; }

.chat-top {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--dyn-line-soft);
  background: rgba(20, 17, 14, 0.96);
}

.chat-icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 1px solid var(--dyn-line-soft);
  background: transparent;
  color: var(--dyn-muted);
  font-size: 1rem;
  line-height: 1;
}

.chat-top-main { flex: 1; min-width: 0; }
.chat-name { font-size: 0.74rem; color: var(--dyn-text); }
.chat-sub { margin-top: 1px; font-size: 0.52rem; color: var(--dyn-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.chat-mode-row {
  flex-shrink: 0;
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding: 6px 10px;
  border-bottom: 1px solid var(--dyn-line-soft);
  scrollbar-width: none;
}

.chat-mode-row::-webkit-scrollbar { display: none; }

.chat-mode-row button {
  flex: 0 0 auto;
  padding: 6px 9px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--dyn-dim);
  font-family: inherit;
  font-size: 0.58rem;
  min-height: 34px;
}

.chat-mode-row button.is-active {
  border-color: var(--dyn-gold);
  color: var(--dyn-gold-bright);
}

.chat-feed {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 11px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-feed.is-audience {
  padding: 16px 13px;
  background: radial-gradient(circle at 50% 0%, rgba(201, 162, 39, 0.04), transparent 35%);
}

.chat-msg {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  max-width: 90%;
}

.chat-msg.is-me {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.chat-bubble {
  padding: 8px 10px;
  border: 1px solid var(--dyn-line-soft);
  background: var(--dyn-panel-2);
  color: #d8ccb9;
  font-size: 0.7rem;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-msg.is-me .chat-bubble {
  border-color: rgba(201, 162, 39, 0.35);
  background: rgba(201, 162, 39, 0.09);
  color: var(--dyn-text);
}

.chat-msg small {
  display: block;
  margin-top: 2px;
  color: var(--dyn-dim);
  font-size: 0.48rem;
}

.chat-feed.is-audience .chat-msg {
  max-width: 100%;
  display: block;
  border-left: 2px solid var(--dyn-line);
  padding-left: 10px;
}

.chat-feed.is-audience .chat-msg.is-me {
  border-left-color: var(--dyn-gold);
}

.chat-feed.is-audience .chat-msg .chat-avatar {
  display: none;
}

.chat-feed.is-audience .chat-bubble {
  padding: 0;
  border: none;
  background: transparent;
  font-size: 0.78rem;
  line-height: 1.95;
}

.chat-typing {
  padding: 3px 6px;
  color: var(--dyn-dim);
  font-size: 0.55rem;
}

.chat-topics {
  flex-shrink: 0;
  display: flex;
  gap: 5px;
  overflow-x: auto;
  padding: 7px 10px;
  border-top: 1px solid var(--dyn-line-soft);
  scrollbar-width: none;
}

.chat-topics::-webkit-scrollbar { display: none; }

.chat-topic {
  flex: 0 0 auto;
  min-height: 34px;
  padding: 7px 9px;
  border: 1px solid var(--dyn-line-soft);
  background: var(--dyn-panel-2);
  color: var(--dyn-muted);
  font-family: inherit;
  font-size: 0.6rem;
}

.chat-topic:disabled { opacity: 0.4; }

.chat-composer {
  flex-shrink: 0;
  display: flex;
  gap: 6px;
  padding: 8px 10px calc(9px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--dyn-line-soft);
  background: #100d0a;
}

.chat-composer input {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  padding: 9px 10px;
  border: 1px solid var(--dyn-line);
  background: rgba(0, 0, 0, 0.25);
  color: var(--dyn-text);
  font-family: inherit;
  /* iOS 低于 16px 会在聚焦时自动放大页面 */
  font-size: 16px;
}

.chat-composer input:focus { outline: none; border-color: var(--dyn-gold); }

.chat-send {
  flex: 0 0 auto;
  min-width: 52px;
  border: 1px solid var(--dyn-gold);
  background: rgba(201, 162, 39, 0.12);
  color: var(--dyn-gold-bright);
  font-family: inherit;
  font-size: 0.72rem;
}

.chat-effect {
  flex-shrink: 0;
  max-width: 100%;
  margin: 0;
  padding: 4px 10px 2px;
  overflow: hidden;
  color: var(--dyn-gold);
  font-size: 0.54rem;
  text-align: right;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.chat-error {
  margin: 0;
  padding: 0 10px 6px;
  color: #d7857e;
  font-size: 0.56rem;
}

.chat-empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--dyn-dim);
  font-size: 0.6rem;
}

.chat-letter {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 9px 10px;
  padding: 15px;
  border: 1px solid #4a3b2a;
  background:
    linear-gradient(180deg, rgba(201, 162, 39, 0.06), transparent 28%),
    #17130e;
}

.chat-letter-title {
  text-align: center;
  font-family: var(--font-heading, serif);
  font-size: 0.98rem;
  letter-spacing: 0.16em;
  color: var(--dyn-gold-bright);
}

.chat-letter-meta {
  margin-top: 4px;
  text-align: center;
  color: var(--dyn-dim);
  font-size: 0.52rem;
}

.chat-letter-line {
  margin-top: 12px;
  color: #d8ccb9;
  font-size: 0.72rem;
  line-height: 2;
}

.chat-letter-line.is-me {
  padding-left: 9px;
  border-left: 2px solid var(--dyn-gold);
  color: var(--dyn-text);
}

.chat-seal {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  margin-top: 12px;
  border: 1px solid var(--dyn-red);
  color: var(--dyn-red);
  font-size: 0.54rem;
  transform: rotate(-4deg);
}

.chat-mask {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.62);
}

.chat-sheet {
  width: 100%;
  max-width: min(480px, 100vw);
  max-height: 82dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 13px 13px calc(18px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--dyn-gold);
  border-radius: 10px 10px 0 0;
  background: var(--dyn-panel);
}

.chat-sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.chat-sheet-head h3 {
  margin: 0;
  font-family: var(--font-heading, serif);
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--dyn-gold-bright);
}

.chat-person {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 8px;
}

.chat-kv {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--dyn-line-soft);
  color: var(--dyn-muted);
  font-size: 0.6rem;
}

.chat-kv b { color: var(--dyn-text); font-weight: 400; text-align: right; }

.chat-meter {
  height: 6px;
  margin: 3px 0 7px;
  border: 1px solid var(--dyn-line-soft);
  background: #0d0b09;
}

.chat-meter i { display: block; height: 100%; background: var(--dyn-gold); }

.chat-effect-box {
  margin-top: 8px;
  padding: 8px;
  border: 1px dashed var(--dyn-line);
  background: rgba(201, 162, 39, 0.04);
  color: #d8ccb9;
  font-size: 0.58rem;
  line-height: 1.8;
}

@media (max-width: 380px) {
  .chat-duty-grid { grid-template-columns: 1fr; }
  .chat-topics { gap: 4px; }
  .chat-topic { padding: 5px 6px; }
}

/* ===== 桌面端：联系人改为多列，对话限宽 ===== */

@media (min-width: 1024px) {
  .chat-list-head { padding: 20px 18px 10px; }
  .chat-filters { padding: 0 18px 12px; }

  .chat-scroll {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    align-content: start;
    gap: 8px;
    padding: 0 18px 22px;
  }

  .chat-contact {
    border: 1px solid var(--dyn-line-soft);
    border-radius: 2px;
    padding: 12px 14px;
  }

  .chat-contact:hover { background: rgba(201, 162, 39, 0.06); }

  .chat-feed,
  .chat-composer {
    width: 100%;
    max-width: 840px;
    margin: 0 auto;
  }

  .chat-feed { padding: 16px 18px; }

  .chat-top { padding: 12px 18px; }

  .chat-msg { max-width: 68%; }
}
</style>
