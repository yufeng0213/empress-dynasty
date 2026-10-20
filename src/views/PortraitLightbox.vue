<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  url: { type: String, default: '' },
  name: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  initial: { type: String, default: '' },
})

const emit = defineEmits(['close'])
const failed = ref(false)

const onKeydown = (event) => {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  document.body.style.overflow = 'hidden'
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div class="portrait-lightbox" @click.self="emit('close')">
      <button type="button" class="lightbox-close" aria-label="关闭" @click="emit('close')">
        ×
      </button>

      <figure class="lightbox-figure">
        <div class="lightbox-art">
          <img
            v-if="url && !failed"
            :src="url"
            :alt="name"
            @error="failed = true"
          />
          <span v-else class="lightbox-fallback">{{ (name || '立').slice(0, 1) }}</span>
        </div>
        <figcaption class="lightbox-caption">
          <div class="lightbox-title">
            <b>{{ name || '未命名' }}</b>
            <span v-if="subtitle">{{ subtitle }}</span>
          </div>
          <div class="lightbox-actions">
            <slot name="actions" />
            <button type="button" class="btn btn-ghost btn-sm" @click="emit('close')">关闭</button>
          </div>
        </figcaption>
      </figure>
    </div>
  </Teleport>
</template>

<style scoped>
.portrait-lightbox {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  background: rgba(4, 3, 3, 0.9);
  backdrop-filter: blur(10px);
  animation: lightbox-in 0.18s ease;
}

.lightbox-figure {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: min(560px, 100%);
  max-height: calc(100vh - 56px);
  margin: 0;
}

.lightbox-art {
  position: relative;
  display: grid;
  place-items: center;
  flex: 1;
  min-height: 0;
  border: 1px solid var(--gold-line);
  border-radius: var(--r-lg);
  background:
    radial-gradient(circle at 50% 30%, rgba(201, 162, 39, 0.16), transparent 62%),
    #0d0b09;
  overflow: hidden;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.7);
}

.lightbox-art img {
  display: block;
  width: 100%;
  height: 100%;
  max-height: calc(100vh - 180px);
  object-fit: contain;
}

.lightbox-fallback {
  padding: 80px 0;
  color: rgba(201, 162, 39, 0.36);
  font-family: var(--font-serif);
  font-size: 5rem;
}

.lightbox-caption {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 2px;
}

.lightbox-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.lightbox-title b {
  font-family: var(--font-serif);
  font-size: 1.25rem;
  font-weight: 500;
  letter-spacing: 0.12em;
  color: var(--gold-bright);
}

.lightbox-title span {
  font-family: var(--font-sans);
  font-size: 0.72rem;
  color: var(--muted);
}

.lightbox-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.lightbox-close {
  position: fixed;
  top: max(16px, env(safe-area-inset-top));
  right: 18px;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  background: rgba(12, 10, 8, 0.8);
  color: var(--text);
  font-size: 1.4rem;
  line-height: 1;
}

.lightbox-close:hover {
  border-color: var(--gold-line);
  color: var(--gold-bright);
}

@keyframes lightbox-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (max-width: 560px) {
  .portrait-lightbox {
    padding: 14px;
  }

  .lightbox-figure {
    width: 100%;
    max-height: calc(100vh - 28px);
  }

  .lightbox-art img {
    max-height: calc(100vh - 150px);
  }
}
</style>
