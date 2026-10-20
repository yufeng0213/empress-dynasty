<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
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
const feedRef = ref(null)

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

const FILTERS = [
  { label: '全部', role: '' },
  { label: '朝臣', role: 'minister' },
  { label: '宗室', role: 'clan' },
  { label: '后宫', role: 'consort' },
  { label: '内侍', role: 'servant' },
  { label: '子嗣', role: 'child' },
]

const filteredContacts = computed(() => {
  const item = FILTERS.find((entry) => entry.label === filter.value)
  if (!item?.role) return contacts.value
  return contacts.value.filter((contact) => contact.role === item.role)
})

const roleClass = (contact) => {
  if (contact?.role === 'consort') return 'avatar-consort'
  if (contact?.role === 'servant') return 'avatar-inner'
  return ''
}

const MODE_LABELS = {
  chat: '闲谈',
  audience: '御前奏对',
  letter: '密折',
}

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

const scrollFeed = () => {
  nextTick(() => {
    const node = feedRef.value
    if (node) node.scrollTop = node.scrollHeight
  })
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
  scrollFeed()
}

const appendTo = (contactId, from, text) => {
  if (!messages.value[contactId]) messages.value[contactId] = []
  messages.value[contactId].push({ from, text, time: '此刻' })
  scrollFeed()
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
    <!-- ===== 名单 ===== -->
    <template v-if="mode === 'list' || mode === 'duty'">
      <header class="chat-head">
        <button type="button" class="icon-btn" aria-label="返回" @click="emit('back')">‹</button>
        <div class="chat-head-main">
          <h1>{{ mode === 'duty' ? '值房' : '召见' }}</h1>
          <p>
            {{ mode === 'duty' ? '今日当值的人' : `${contacts.length} 人可召` }}
            · 行动点 {{ run.actionPoints ?? 0 }}
          </p>
        </div>
        <button
          type="button"
          class="btn btn-sm btn-ghost"
          @click="mode = mode === 'duty' ? 'list' : 'duty'"
        >{{ mode === 'duty' ? '名单' : '值房' }}</button>
      </header>

      <div v-if="mode === 'list'" class="chat-filters">
        <button
          v-for="item in FILTERS"
          :key="item.label"
          type="button"
          class="chat-filter"
          :class="{ 'is-active': filter === item.label }"
          @click="filter = item.label"
        >{{ item.label }}</button>
      </div>

      <div class="chat-scroll" :class="{ 'is-grid': mode === 'duty' }">
        <template v-if="mode === 'list'">
          <button
            v-for="contact in filteredContacts"
            :key="contact.id"
            type="button"
            class="contact"
            @click="selectContact(contact.id, 'chat')"
          >
            <div class="avatar avatar-sm" :class="roleClass(contact)">{{ contact.name.slice(0, 1) }}</div>
            <div class="contact-main">
              <div class="contact-name">
                {{ contact.name }}
                <span class="chip">{{ contact.roleLabel }}</span>
              </div>
              <div class="contact-meta">{{ contact.office }} · {{ contact.attitude }} · 忠 {{ contact.loyalty }}</div>
              <div class="contact-preview">{{ memoryPreview(contact) }}</div>
            </div>
            <span class="contact-go">›</span>
          </button>
          <p v-if="!filteredContacts.length" class="empty">这一类暂时没有人。</p>
        </template>

        <template v-else>
          <button
            v-for="contact in contacts"
            :key="contact.id"
            type="button"
            class="duty-card"
            @click="selectContact(contact.id, 'chat')"
          >
            <div class="duty-head">
              <div class="avatar avatar-sm" :class="roleClass(contact)">{{ contact.name.slice(0, 1) }}</div>
              <div>
                <div class="contact-name">{{ contact.name }}</div>
                <div class="contact-meta">{{ contact.office }}</div>
              </div>
            </div>
            <div class="duty-meta">{{ contact.attitude }} · 忠 {{ contact.loyalty }} · 野 {{ contact.ambition }}</div>
          </button>
          <p v-if="!contacts.length" class="empty">今日无人当值。</p>
        </template>

        <p v-if="error" class="chat-alert">{{ error }}</p>
      </div>
    </template>

    <!-- ===== 对话 ===== -->
    <template v-else-if="active">
      <header class="chat-head">
        <button type="button" class="icon-btn" aria-label="返回" @click="back">‹</button>
        <div class="avatar avatar-sm" :class="roleClass(active)">{{ active.name.slice(0, 1) }}</div>
        <div class="chat-head-main">
          <h1>{{ active.name }}</h1>
          <p>{{ active.office }} · {{ active.attitude }} · {{ MODE_LABELS[mode] }}</p>
        </div>
        <button type="button" class="icon-btn" aria-label="详情" @click="detailOpen = true">⋯</button>
      </header>

      <div class="chat-modes">
        <button type="button" :class="{ 'is-active': mode === 'chat' }" @click="switchMode('chat')">闲谈</button>
        <button type="button" :class="{ 'is-active': mode === 'audience' }" @click="switchMode('audience')">御前奏对</button>
        <button type="button" :class="{ 'is-active': mode === 'letter' }" @click="switchMode('letter')">密折</button>
        <button type="button" class="chat-switch" @click="contactOpen = true">换人</button>
      </div>

      <div v-if="mode === 'letter'" class="letter">
        <div class="letter-title">与{{ active.name }}书</div>
        <div class="letter-meta">{{ active.office }} · {{ active.factionName || active.roleLabel }} · 亲启</div>
        <div
          v-for="(msg, index) in currentMessages"
          :key="index"
          class="letter-line"
          :class="{ 'is-me': msg.from === 'me' }"
        >
          {{ msg.from === 'me' ? '朱批：' : '' }}{{ msg.text }}
        </div>
        <div class="letter-seal">御览</div>
      </div>

      <div v-else ref="feedRef" class="chat-feed" :class="{ 'is-audience': mode === 'audience' }">
        <div
          v-for="(msg, index) in currentMessages"
          :key="index"
          class="msg"
          :class="{ 'is-me': msg.from === 'me' }"
        >
          <div class="avatar avatar-sm" :class="roleClass(active)">
            {{ msg.from === 'me' ? '帝' : active.name.slice(0, 1) }}
          </div>
          <div class="msg-body">
            <div class="bubble">{{ msg.text }}</div>
            <small>{{ msg.from === 'me' ? '你' : active.name }} · {{ msg.time }}</small>
          </div>
        </div>
        <div v-if="busy" class="typing">对方正在斟酌……</div>
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
      <p v-if="error" class="chat-alert">{{ error }}</p>

      <div class="composer">
        <input
          v-model="draft"
          type="text"
          :placeholder="`对${active.name}说……`"
          :disabled="busy"
          @keydown.enter.prevent="sendDraft"
        />
        <button type="button" class="btn btn-primary" :disabled="busy || !draft.trim()" @click="sendDraft">发送</button>
      </div>
    </template>

    <!-- ===== 关系抽屉 ===== -->
    <div v-if="detailOpen && active" class="mask" @click.self="detailOpen = false">
      <div class="sheet">
        <div class="sheet-head">
          <h3>{{ active.name }}</h3>
          <button type="button" class="icon-btn" @click="detailOpen = false">×</button>
        </div>
        <div class="detail-person">
          <div class="avatar" :class="roleClass(active)">{{ active.name.slice(0, 1) }}</div>
          <div>
            <div class="contact-name">{{ active.office }} · {{ active.factionName || active.roleLabel }}</div>
            <div class="contact-meta">{{ active.attitude }}</div>
          </div>
        </div>
        <div class="kv"><span>忠诚</span><b>{{ active.loyalty }}</b></div>
        <div class="bar bar-jade"><i :style="{ width: `${active.loyalty}%` }"></i></div>
        <div class="kv detail-kv"><span>野心</span><b>{{ active.ambition }}</b></div>
        <div class="bar bar-red"><i :style="{ width: `${active.ambition}%` }"></i></div>
        <div class="kv detail-kv"><span>把柄</span><b>{{ active.note }}</b></div>
        <div class="kv"><span>召见</span><b>{{ activeMemory?.chats || 0 }} 次</b></div>
        <div class="kv">
          <span>上次话题</span>
          <b>{{ activeMemory?.lastTopic ? (topics.find((item) => item.id === activeMemory.lastTopic)?.label || activeMemory.lastTopic) : '无' }}</b>
        </div>
        <div class="effect-box">
          <span>本轮结果</span>
          {{ lastEffect || '尚未开口。' }}
        </div>
      </div>
    </div>

    <!-- ===== 换人抽屉 ===== -->
    <div v-if="contactOpen" class="mask" @click.self="contactOpen = false">
      <div class="sheet">
        <div class="sheet-head">
          <h3>换一个人</h3>
          <button type="button" class="icon-btn" @click="contactOpen = false">×</button>
        </div>
        <div class="sheet-contacts">
          <button
            v-for="contact in contacts"
            :key="contact.id"
            type="button"
            class="contact"
            @click="selectContact(contact.id, mode === 'letter' ? 'letter' : (mode === 'audience' ? 'audience' : 'chat'))"
          >
            <div class="avatar avatar-sm" :class="roleClass(contact)">{{ contact.name.slice(0, 1) }}</div>
            <div class="contact-main">
              <div class="contact-name">{{ contact.name }}</div>
              <div class="contact-meta">{{ contact.office }} · {{ contact.attitude }}</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-screen {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-top: var(--safe-top);
  background:
    radial-gradient(circle at 50% 0, rgba(201, 162, 39, 0.05), transparent 34%),
    var(--ink);
  overflow: hidden;
}

.chat-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  background: rgba(12, 10, 8, 0.9);
}

.chat-head-main {
  flex: 1;
  min-width: 0;
}

.chat-head-main h1 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 1.05rem;
  font-weight: 500;
  letter-spacing: 0.16em;
  color: var(--gold-bright);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-head-main p {
  margin: 2px 0 0;
  font-family: var(--font-sans);
  font-size: 0.68rem;
  color: var(--dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-filters {
  flex: 0 0 auto;
  display: flex;
  gap: 5px;
  padding: 10px 12px;
  overflow-x: auto;
  scrollbar-width: none;
}

.chat-filters::-webkit-scrollbar {
  display: none;
}

.chat-filter {
  flex: 0 0 auto;
  padding: 5px 11px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--dim);
  font-family: var(--font-sans);
  font-size: 0.7rem;
}

.chat-filter.is-active {
  border-color: var(--gold-line);
  background: rgba(201, 162, 39, 0.1);
  color: var(--gold-bright);
}

.chat-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 12px 24px;
}

.chat-scroll.is-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  gap: 8px;
}

.contact {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 11px 4px;
  border: none;
  border-bottom: 1px solid var(--line);
  background: transparent;
  color: var(--text);
  text-align: left;
}

.contact:hover {
  background: rgba(201, 162, 39, 0.04);
}

.contact-main {
  flex: 1;
  min-width: 0;
}

.contact-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.92rem;
  letter-spacing: 0.04em;
}

.contact-meta {
  margin-top: 1px;
  font-family: var(--font-sans);
  font-size: 0.68rem;
  color: var(--dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.contact-preview {
  margin-top: 3px;
  font-family: var(--font-sans);
  font-size: 0.7rem;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.contact-go {
  color: var(--dim);
  font-size: 1.05rem;
}

.duty-card {
  padding: 11px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--panel);
  color: var(--text);
  text-align: left;
}

.duty-card:hover {
  border-color: var(--gold-line);
}

.duty-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.duty-meta {
  margin-top: 6px;
  font-family: var(--font-sans);
  font-size: 0.66rem;
  color: var(--dim);
}

.chat-modes {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--line);
  overflow-x: auto;
  scrollbar-width: none;
}

.chat-modes::-webkit-scrollbar {
  display: none;
}

.chat-modes button {
  flex: 0 0 auto;
  padding: 6px 11px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--dim);
  font-family: var(--font-sans);
  font-size: 0.7rem;
}

.chat-modes button.is-active {
  border-color: var(--gold-line);
  background: rgba(201, 162, 39, 0.09);
  color: var(--gold-bright);
}

.chat-switch {
  margin-left: auto;
  border-color: var(--line) !important;
}

.chat-feed {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.msg {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  max-width: 92%;
}

.msg.is-me {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.msg-body {
  min-width: 0;
}

.bubble {
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: 2px 10px 10px 10px;
  background: var(--panel-2);
  color: #ddd2bf;
  font-size: 0.86rem;
  line-height: 1.9;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.msg.is-me .bubble {
  border-color: rgba(201, 162, 39, 0.35);
  border-radius: 10px 2px 10px 10px;
  background: rgba(201, 162, 39, 0.1);
  color: #f0e6d4;
}

.msg small {
  display: block;
  margin-top: 3px;
  font-family: var(--font-sans);
  font-size: 0.6rem;
  color: var(--dim);
}

.msg.is-me small {
  text-align: right;
}

.chat-feed.is-audience {
  padding: 18px 16px;
}

.chat-feed.is-audience .msg {
  display: block;
  max-width: 100%;
  padding-left: 12px;
  border-left: 2px solid var(--line);
}

.chat-feed.is-audience .msg.is-me {
  border-left-color: var(--gold);
}

.chat-feed.is-audience .msg .avatar {
  display: none;
}

.chat-feed.is-audience .bubble {
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  font-size: 0.94rem;
  line-height: 2.05;
}

.typing {
  padding: 2px 4px;
  font-family: var(--font-sans);
  font-size: 0.66rem;
  color: var(--dim);
  animation: breathe 1.6s ease-in-out infinite;
}

.chat-topics {
  flex: 0 0 auto;
  display: flex;
  gap: 5px;
  padding: 8px 12px;
  border-top: 1px solid var(--line);
  overflow-x: auto;
  scrollbar-width: none;
}

.chat-topics::-webkit-scrollbar {
  display: none;
}

.chat-topic {
  flex: 0 0 auto;
  min-height: 32px;
  padding: 6px 11px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--panel-2);
  color: var(--muted);
  font-family: var(--font-sans);
  font-size: 0.7rem;
}

.chat-topic:hover:not(:disabled) {
  border-color: var(--gold-line);
  color: var(--gold-bright);
}

.chat-topic:disabled {
  opacity: 0.4;
}

.chat-effect {
  flex: 0 0 auto;
  margin: 0;
  padding: 3px 14px 2px;
  overflow: hidden;
  color: var(--gold);
  font-family: var(--font-sans);
  font-size: 0.66rem;
  text-align: right;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.chat-alert {
  margin: 6px 0;
  padding: 8px 10px;
  border: 1px solid rgba(189, 92, 82, 0.45);
  border-radius: var(--r-sm);
  background: rgba(189, 92, 82, 0.08);
  color: #e0a9a2;
  font-family: var(--font-sans);
  font-size: 0.72rem;
  line-height: 1.7;
}

.composer {
  flex: 0 0 auto;
  display: flex;
  gap: 8px;
  padding: 9px 12px calc(10px + var(--safe-bottom));
  border-top: 1px solid var(--line);
  background: #0d0b09;
}

.composer input {
  flex: 1;
  min-width: 0;
  min-height: 42px;
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: rgba(0, 0, 0, 0.3);
  color: var(--text);
  font-size: 16px;
}

.composer input:focus {
  outline: none;
  border-color: var(--gold-line);
}

.composer .btn {
  flex: 0 0 auto;
  min-width: 64px;
  padding: 0 14px;
}

/* 密折 */

.letter {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 12px;
  padding: 18px 16px;
  border: 1px solid #473a2a;
  border-radius: var(--r-sm);
  background:
    linear-gradient(180deg, rgba(201, 162, 39, 0.06), transparent 26%),
    #17130e;
}

.letter-title {
  text-align: center;
  font-family: var(--font-serif);
  font-size: 1.05rem;
  letter-spacing: 0.18em;
  color: var(--gold-bright);
}

.letter-meta {
  margin-top: 4px;
  text-align: center;
  font-family: var(--font-sans);
  font-size: 0.66rem;
  color: var(--dim);
}

.letter-line {
  margin-top: 14px;
  color: #ddd2bf;
  font-size: 0.86rem;
  line-height: 2.05;
}

.letter-line.is-me {
  padding-left: 10px;
  border-left: 2px solid var(--gold);
  color: #f0e6d4;
}

.letter-seal {
  display: inline-grid;
  place-items: center;
  width: 38px;
  height: 38px;
  margin-top: 16px;
  border: 1px solid var(--red);
  color: var(--red);
  font-size: 0.6rem;
  transform: rotate(-4deg);
}

/* 抽屉 */

.detail-person {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-bottom: 10px;
}

.detail-kv {
  margin-top: 8px;
}

.bar + .kv {
  margin-top: 8px;
}

.effect-box {
  margin-top: 14px;
  padding: 11px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--r-sm);
  background: rgba(201, 162, 39, 0.05);
  color: #ddd2bf;
  font-family: var(--font-sans);
  font-size: 0.74rem;
  line-height: 1.8;
}

.effect-box span {
  display: block;
  margin-bottom: 3px;
  color: var(--gold);
  font-size: 0.64rem;
  letter-spacing: 0.14em;
}

.sheet-contacts {
  display: flex;
  flex-direction: column;
}

@media (min-width: 560px) {
  .chat-scroll {
    padding: 0 18px 28px;
  }

  .contact {
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    padding: 11px 12px;
    margin-bottom: 7px;
    background: var(--panel);
  }

  .chat-filters {
    padding: 12px 18px;
  }

  .chat-head {
    padding: 12px 18px;
  }

  .chat-feed {
    padding: 16px 18px;
  }
}

@media (min-width: 900px) {
  .chat-scroll:not(.is-grid) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-content: start;
    gap: 7px;
  }

  .chat-scroll.is-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .chat-feed,
  .composer,
  .chat-topics,
  .chat-effect,
  .chat-alert,
  .letter {
    width: 100%;
    max-width: 820px;
    margin-left: auto;
    margin-right: auto;
  }

  .chat-feed,
  .composer {
    padding-left: 20px;
    padding-right: 20px;
  }

  .chat-topics {
    padding-left: 20px;
    padding-right: 20px;
  }

  .msg {
    max-width: 74%;
  }

  .letter {
    max-width: 720px;
    margin-top: 18px;
    padding: 26px;
  }
}
</style>
