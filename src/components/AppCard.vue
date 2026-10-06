<script setup>
import { computed } from 'vue'
import { STATUS_MAP } from '../constants'
import { store } from '../store'
import { fmtDate, daysSince, lastChangeAt, isStale } from '../utils'

const props = defineProps({ app: { type: Object, required: true } })
defineEmits(['edit'])

const meta = computed(() => STATUS_MAP[props.app.status] || { label: props.app.status, type: 'active' })
const days = computed(() => daysSince(lastChangeAt(props.app)))
const stale = computed(() => isStale(props.app, store.settings.followUpDays))

function onDragStart(e) {
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', props.app.id)
}
</script>

<template>
  <article
    class="card"
    :class="meta.type"
    draggable="true"
    :title="'点击编辑：' + app.company"
    @dragstart="onDragStart"
    @click="$emit('edit', app)"
  >
    <div class="card-top">
      <span class="company">{{ app.company }}</span>
      <span v-if="stale" class="stale-dot" :title="'已 ' + days + ' 天无进展，建议跟进'"></span>
    </div>
    <div class="position">{{ app.position }}</div>
    <div v-if="app.channel || app.city || app.branch || app.department || app.salary || (app.companyTypes && app.companyTypes.length)" class="tags">
      <span v-for="t in app.companyTypes || []" :key="t" class="tag ctype">{{ t }}</span>
      <span v-if="app.channel" class="tag">{{ app.channel }}</span>
      <span v-if="app.city" class="tag">{{ app.city }}</span>
      <span v-if="app.branch" class="tag">{{ app.branch }}</span>
      <span v-if="app.department" class="tag">{{ app.department }}</span>
      <span v-if="app.salary" class="tag salary">{{ app.salary }}</span>
    </div>
    <p v-if="app.notes" class="notes">{{ app.notes }}</p>
    <div class="card-foot">
      <span>{{ app.appliedDate }}</span>
      <span v-if="meta.type === 'active'" class="days" :class="{ warn: stale }">停留 {{ days }} 天</span>
      <span v-else-if="app.status === 'closed' && app.endReason" class="days">{{ app.endReason }}</span>
      <a v-if="app.interviewUrl" class="jd" :href="app.interviewUrl" target="_blank" rel="noopener" @click.stop>面试 ↗</a>
      <a v-if="app.url" class="jd" :href="app.url" target="_blank" rel="noopener" @click.stop>JD ↗</a>
    </div>
  </article>
</template>
