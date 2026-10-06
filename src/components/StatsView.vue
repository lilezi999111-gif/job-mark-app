<script setup>
import { computed } from 'vue'
import { store } from '../store'
import { STATUS_MAP, FUNNEL } from '../constants'
import { fmtDate, isStale } from '../utils'

const apps = computed(() => store.applications)

const summary = computed(() => {
  const weekAgo = fmtDate(Date.now() - 7 * 86400000)
  const today = fmtDate(Date.now())
  const active = apps.value.filter((a) => (STATUS_MAP[a.status] || {}).type === 'active')
  return {
    total: apps.value.length,
    active: active.length,
    offer: apps.value.filter((a) => a.status === 'offer').length,
    closed: apps.value.filter((a) => a.status === 'closed').length,
    week: apps.value.filter((a) => a.appliedDate >= weekAgo).length,
    stale: active.filter((a) => isStale(a, store.settings.followUpDays)).length,
  }
})

const trend = computed(() => {
  const days = []
  for (let i = 13; i >= 0; i--) {
    const date = fmtDate(Date.now() - i * 86400000)
    days.push({
      date,
      label: date.slice(5),
      count: apps.value.filter((a) => a.appliedDate === date).length,
    })
  }
  return days
})
const maxTrend = computed(() => Math.max(1, ...trend.value.map((d) => d.count)))

// 各环节到达情况：状态流转历史里出现过的次数
const funnel = computed(() =>
  FUNNEL.map((key) => ({
    ...STATUS_MAP[key],
    count: apps.value.filter((a) => (a.statusHistory || []).some((h) => h.status === key)).length,
  }))
)
const funnelBase = computed(() => funnel.value[0].count)

const channels = computed(() => {
  const map = new Map()
  for (const a of apps.value) {
    const key = a.channel || '未填写'
    if (!map.has(key)) map.set(key, { name: key, total: 0, offer: 0 })
    const c = map.get(key)
    c.total++
    if (a.status === 'offer') c.offer++
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
})
const maxChannel = computed(() => Math.max(1, ...channels.value.map((c) => c.total)))
</script>

<template>
  <div class="stats">
    <div class="stat-grid">
      <div class="stat-card"><b>{{ summary.total }}</b><span>累计投递</span></div>
      <div class="stat-card"><b>{{ summary.active }}</b><span>进行中</span></div>
      <div class="stat-card good"><b>{{ summary.offer }}</b><span>Offer</span></div>
      <div class="stat-card"><b>{{ summary.closed }}</b><span>流程结束</span></div>
      <div class="stat-card"><b>{{ summary.week }}</b><span>近 7 天投递</span></div>
      <div class="stat-card" :class="summary.stale ? 'warn' : ''">
        <b>{{ summary.stale }}</b><span>需跟进（≥{{ store.settings.followUpDays }} 天无进展）</span>
      </div>
    </div>

    <div class="stats-row">
      <div class="panel">
        <h3>近 14 天投递趋势</h3>
        <div v-if="apps.length" class="trend">
          <div v-for="d in trend" :key="d.date" class="trend-col" :title="d.date + ' 投递 ' + d.count + ' 个'">
            <div class="trend-bar-area">
              <div class="trend-bar" :style="{ height: (d.count / maxTrend) * 100 + '%' }">
                <span v-if="d.count">{{ d.count }}</span>
              </div>
            </div>
            <span class="trend-label">{{ d.label }}</span>
          </div>
        </div>
        <p v-else class="empty-mini">暂无数据</p>
      </div>

      <div class="panel">
        <h3>各环节到达情况（相对已投递）</h3>
        <div class="funnel">
          <div v-for="(s, i) in funnel" :key="s.key" class="funnel-row">
            <span class="funnel-label">{{ s.label }}</span>
            <div class="funnel-track">
              <div
                class="funnel-bar"
                :class="s.type"
                :style="{ width: (funnelBase ? (s.count / funnelBase) * 100 : 0) + '%' }"
              ></div>
            </div>
            <span class="funnel-num">
              {{ s.count }}<small v-if="funnelBase && i > 0"> · {{ Math.round((s.count / funnelBase) * 100) }}%</small>
            </span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="channels.length" class="panel">
      <h3>渠道效果</h3>
      <div v-for="c in channels" :key="c.name" class="channel-row">
        <span class="channel-name">{{ c.name }}</span>
        <div class="channel-track">
          <div class="channel-bar" :style="{ width: (c.total / maxChannel) * 100 + '%' }"></div>
        </div>
        <span class="channel-num">{{ c.total }} 个 · {{ c.offer }} 个 Offer</span>
      </div>
    </div>
  </div>
</template>
