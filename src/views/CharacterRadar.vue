<template>
  <div class="radar" :style="{ width: `${size}px` }">
    <svg :viewBox="`0 0 ${size} ${size}`" role="img" aria-label="人物能力雷达图">
      <polygon
        v-for="(ring, index) in rings"
        :key="`ring-${index}`"
        :points="ring"
        class="ring"
      />
      <line
        v-for="axis in axes"
        :key="`axis-${axis.key}`"
        :x1="center"
        :y1="center"
        :x2="axis.x"
        :y2="axis.y"
        class="axis"
      />
      <polygon :points="dataPoints" class="area" />
      <circle
        v-for="axis in axes"
        :key="`node-${axis.key}`"
        :cx="axis.px"
        :cy="axis.py"
        r="2.6"
        class="node"
      />
      <g v-for="axis in axes" :key="`label-${axis.key}`">
        <text :x="axis.lx" :y="axis.ly" class="label">{{ axis.label }}</text>
        <text :x="axis.lx" :y="axis.ly + 13" class="value">{{ axis.value }}</text>
      </g>
    </svg>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  getAbilityStats,
} from '../game-core/empire/index.js'

const props = defineProps({
  person: { type: Object, required: true },
  size: { type: Number, default: 240 },
})

const center = computed(() => props.size / 2)
const radius = computed(() => props.size * 0.31)
const labelRadius = computed(() => props.size * 0.43)

const stats = computed(() => getAbilityStats(props.person))

const axes = computed(() => ABILITY_KEYS.map((key, index) => {
  const angle = (-90 + index * 72) * (Math.PI / 180)
  const value = Number(stats.value[key]) || 0
  const ratio = Math.max(0.04, Math.min(1, value / 100))
  return {
    key,
    label: ABILITY_LABELS[key],
    value,
    x: center.value + Math.cos(angle) * radius.value,
    y: center.value + Math.sin(angle) * radius.value,
    px: center.value + Math.cos(angle) * radius.value * ratio,
    py: center.value + Math.sin(angle) * radius.value * ratio,
    lx: center.value + Math.cos(angle) * labelRadius.value,
    ly: center.value + Math.sin(angle) * labelRadius.value,
  }
}))

const dataPoints = computed(() => axes.value.map((axis) => `${axis.px},${axis.py}`).join(' '))

const rings = computed(() => [0.2, 0.4, 0.6, 0.8, 1].map((ratio) => (
  ABILITY_KEYS.map((key, index) => {
    const angle = (-90 + index * 72) * (Math.PI / 180)
    return `${center.value + Math.cos(angle) * radius.value * ratio},${center.value + Math.sin(angle) * radius.value * ratio}`
  }).join(' ')
)))
</script>

<style scoped>
.radar {
  max-width: 100%;
  margin: 4px auto 2px;
}

.radar svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.ring {
  fill: none;
  stroke: rgba(201, 162, 39, 0.14);
  stroke-width: 0.8;
}

.axis {
  stroke: rgba(201, 162, 39, 0.16);
  stroke-width: 0.8;
}

.area {
  fill: rgba(201, 162, 39, 0.16);
  stroke: var(--gold, #c9a227);
  stroke-width: 1.3;
}

.node {
  fill: var(--gold-bright, #ecd596);
}

.label {
  fill: #a39681;
  font-size: 11px;
  font-family: var(--font-serif, serif);
  letter-spacing: 0.08em;
  text-anchor: middle;
  dominant-baseline: middle;
}

.value {
  fill: var(--gold-bright, #ecd596);
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  text-anchor: middle;
  dominant-baseline: middle;
}
</style>
