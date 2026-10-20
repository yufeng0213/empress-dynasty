<template>
  <div class="dyn-radar" :style="{ width: `${size}px` }">
    <svg :viewBox="`0 0 ${size} ${size}`" role="img" aria-label="人物能力雷达图">
      <polygon
        v-for="(ring, index) in rings"
        :key="`ring-${index}`"
        :points="ring"
        class="dyn-radar-ring"
      />
      <line
        v-for="axis in axes"
        :key="`axis-${axis.key}`"
        :x1="center"
        :y1="center"
        :x2="axis.x"
        :y2="axis.y"
        class="dyn-radar-axis"
      />
      <polygon :points="dataPoints" class="dyn-radar-area" />
      <circle
        v-for="axis in axes"
        :key="`node-${axis.key}`"
        :cx="axis.px"
        :cy="axis.py"
        r="2.6"
        class="dyn-radar-node"
      />
      <g v-for="axis in axes" :key="`label-${axis.key}`">
        <text :x="axis.lx" :y="axis.ly" class="dyn-radar-label">{{ axis.label }}</text>
        <text :x="axis.lx" :y="axis.ly + 13" class="dyn-radar-value">{{ axis.value }}</text>
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
const labelRadius = computed(() => props.size * 0.42)

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
.dyn-radar {
  max-width: 100%;
  margin: 6px auto 2px;
}

.dyn-radar svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.dyn-radar-ring {
  fill: none;
  stroke: rgba(201, 162, 39, 0.16);
  stroke-width: 0.8;
}

.dyn-radar-axis {
  stroke: rgba(201, 162, 39, 0.18);
  stroke-width: 0.8;
}

.dyn-radar-area {
  fill: rgba(201, 162, 39, 0.2);
  stroke: #c9a227;
  stroke-width: 1.4;
}

.dyn-radar-node {
  fill: #e6c96a;
}

.dyn-radar-label {
  fill: #cbbfae;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-anchor: middle;
  dominant-baseline: middle;
}

.dyn-radar-value {
  fill: #e6c96a;
  font-size: 10px;
  text-anchor: middle;
  dominant-baseline: middle;
}
</style>
