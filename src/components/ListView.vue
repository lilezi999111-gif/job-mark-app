<script setup>
import { computed } from 'vue'
import { STATUS_MAP } from '../constants'
import { store, removeApplication } from '../store'
import { appConfirm } from '../ui'
import { daysSince, lastChangeAt, isStale } from '../utils'

const props = defineProps({ apps: { type: Array, required: true } })
defineEmits(['edit'])

const sorted = computed(() =>
  [...props.apps].sort(
    (a, b) => (b.appliedDate || '').localeCompare(a.appliedDate || '') || (b.updatedAt || 0) - (a.updatedAt || 0)
  )
)

function statusLabel(key) {
  return (STATUS_MAP[key] || {}).label || key
}
function statusType(key) {
  return (STATUS_MAP[key] || {}).type || 'active'
}
async function onDelete(a) {
  const ok = await appConfirm(`确定删除「${a.company} - ${a.position}」吗？删除后不可恢复。`)
  if (ok) removeApplication(a.id)
}
</script>

<template>
  <div class="panel list-panel">
    <div class="table-wrap">
      <table class="app-table">
        <thead>
          <tr>
            <th>公司 / 岗位</th>
            <th>渠道</th>
            <th>城市</th>
            <th>薪资</th>
            <th>投递日期</th>
            <th>状态</th>
            <th>停留</th>
            <th>备注</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in sorted" :key="a.id" @click="$emit('edit', a)">
            <td>
              <div class="cell-company">{{ a.company }}</div>
              <div class="cell-sub">{{ a.position }}</div>
            </td>
            <td>{{ a.channel || '—' }}</td>
            <td>{{ a.city || '—' }}</td>
            <td>{{ a.salary || '—' }}</td>
            <td>{{ a.appliedDate }}</td>
            <td>
              <span class="badge" :class="statusType(a.status)">{{ statusLabel(a.status) }}</span>
            </td>
            <td>
              <span v-if="statusType(a.status) === 'active'" :class="{ warn: isStale(a, store.settings.followUpDays) }">
                {{ daysSince(lastChangeAt(a)) }} 天
              </span>
              <span v-else-if="a.status === 'closed'" class="muted">{{ a.endReason || '—' }}</span>
              <span v-else class="muted">—</span>
            </td>
            <td class="cell-notes" :title="a.notes">{{ a.notes || '—' }}</td>
            <td>
              <button class="btn tiny danger-ghost" @click.stop="onDelete(a)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!sorted.length" class="empty-mini">没有匹配的记录，试试调整筛选条件</div>
    </div>
  </div>
</template>
