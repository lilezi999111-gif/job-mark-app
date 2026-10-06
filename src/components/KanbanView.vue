<script setup>
import { ref, computed } from 'vue'
import { STATUSES } from '../constants'
import { setStatus, store } from '../store'
import AppCard from './AppCard.vue'

const props = defineProps({ apps: { type: Array, required: true } })
defineEmits(['edit', 'create'])

const grouped = computed(() => {
  const g = {}
  for (const s of STATUSES) g[s.key] = []
  for (const a of props.apps) if (g[a.status]) g[a.status].push(a)
  for (const s of STATUSES) g[s.key].sort((x, y) => (y.appliedDate || '').localeCompare(x.appliedDate || ''))
  return g
})

const dragOver = ref('')

function onDragLeave(key) {
  if (dragOver.value === key) dragOver.value = ''
}

function onDrop(statusKey, e) {
  dragOver.value = ''
  const id = e.dataTransfer.getData('text/plain')
  if (id) setStatus(id, statusKey)
}
</script>

<template>
  <div v-if="store.applications.length === 0" class="empty-state">
    <div class="empty-emoji">🗂️</div>
    <h2>还没有投递记录</h2>
    <p>记录每一次投递和面试进展，方便复盘和跟进</p>
    <div class="empty-actions">
      <button class="btn primary" @click="$emit('create')">＋ 添加投递</button>
    </div>
  </div>

  <div v-else class="kanban">
    <section
      v-for="s in STATUSES"
      :key="s.key"
      class="kcol"
      :class="[s.type, { over: dragOver === s.key }]"
      @dragover.prevent="dragOver = s.key"
      @dragleave="onDragLeave(s.key)"
      @drop.prevent="onDrop(s.key, $event)"
    >
      <header class="kcol-head">
        <span class="dot" :class="s.type"></span>
        <h3>{{ s.label }}</h3>
        <span class="kcol-count">{{ grouped[s.key].length }}</span>
      </header>
      <div class="kcol-body">
        <AppCard v-for="a in grouped[s.key]" :key="a.id" :app="a" @edit="$emit('edit', a)" />
        <div v-if="!grouped[s.key].length" class="kcol-empty">拖动卡片到这里</div>
      </div>
    </section>
  </div>
</template>
