<script setup>
import { reactive, ref, computed, watch } from 'vue'
import { store, saveState, fsState, connectDataFile, exportJSON, exportCSV, importJSON, clearAllData } from './store'
import { appConfirm, notify, toastState } from './ui'
import ConfirmDialog from './components/ConfirmDialog.vue'
import { STATUSES, CHANNELS } from './constants'
import { fmtDate, fmtTime, isStale } from './utils'
import KanbanView from './components/KanbanView.vue'
import ListView from './components/ListView.vue'
import StatsView from './components/StatsView.vue'
import ApplicationModal from './components/ApplicationModal.vue'

const view = ref('board')
const filters = reactive({ q: '', channel: '', status: '', staleOnly: false })

function matchFilters(a) {
  const q = filters.q.trim().toLowerCase()
  if (q) {
    const hay = [a.company, a.position, a.channel, a.city, a.notes].filter(Boolean).join(' ').toLowerCase()
    if (!hay.includes(q)) return false
  }
  if (filters.channel && a.channel !== filters.channel) return false
  if (filters.status && a.status !== filters.status) return false
  if (filters.staleOnly && !isStale(a, store.settings.followUpDays)) return false
  return true
}

const filtered = computed(() => store.applications.filter(matchFilters))

const todayCount = computed(() => store.applications.filter((a) => a.appliedDate === fmtDate(Date.now())).length)
const weekCount = computed(() =>
  store.applications.filter((a) => a.appliedDate >= fmtDate(Date.now() - 7 * 86400000)).length
)
const staleCount = computed(() => store.applications.filter((a) => isStale(a, store.settings.followUpDays)).length)

const channelOptions = computed(() => {
  const set = new Set(CHANNELS)
  for (const a of store.applications) if (a.channel) set.add(a.channel)
  return [...set]
})

function clampDays() {
  const v = Number(store.settings.followUpDays)
  if (!Number.isFinite(v) || v < 1) store.settings.followUpDays = 7
  else if (v > 365) store.settings.followUpDays = 365
  else store.settings.followUpDays = Math.round(v)
}

const modal = ref(null) // null 关闭；{ app: Object|null } 打开

// 超过 7 天未备份且有数据时提醒
const needBackup = computed(() => {
  if (fsState.isElectron) return false // 桌面版数据文件本身就是持续备份
  const last = store.settings.lastBackupAt
  return store.applications.length > 0 && (!last || Date.now() - last > 7 * 86400000)
})

function openCreate() {
  modal.value = { app: null }
}
function openEdit(app) {
  modal.value = { app }
}
function closeModal() {
  modal.value = null
}

async function clearAll() {
  const n = store.applications.length
  if (!n) return
  const ok = await appConfirm(`确定清空全部 ${n} 条投递记录吗？此操作不可恢复，重要数据请先「导出 JSON」备份。`)
  if (ok) {
    clearAllData()
    notify('已清空全部记录')
  }
}

function doExportJSON() {
  exportJSON()
  notify('已导出 JSON 备份到下载目录')
}

function doExportCSV() {
  exportCSV()
  notify('已导出 CSV 备份到下载目录')
}

const fileInput = ref(null)
async function onImportFile(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file) return
  try {
    const { added, updated } = importJSON(await file.text())
    notify(`导入完成：新增 ${added} 条，更新 ${updated} 条`)
  } catch (err) {
    notify('导入失败：' + (err && err.message ? err.message : err), 'err')
  }
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="logo">💼</span>
        <div>
          <h1>JobMark</h1>
          <p>求职投递记录 · 流程跟踪</p>
        </div>
      </div>
      <div class="topbar-right">
        <button
          v-if="fsState.supported && !fsState.connected"
          class="btn ghost file-btn"
          title="点击会弹出文件选择框：首次选择保存位置新建文件；重连时自动定位到数据文件所在目录，选中它即可恢复。数据按双向合并读写，不会覆盖丢失"
          @click="connectDataFile"
        >
          📂 连接数据文件
        </button>
        <div
          class="chip ok"
          :title="
            fsState.connected
              ? '数据实时写入文件 ' + fsState.fileName + '（浏览器内同时保留一份备份）'
              : '数据实时保存在本浏览器的 localStorage 中'
          "
        >
          {{ fsState.connected ? '📄 ' + fsState.fileName : '已保存' }}
          <b>{{ store.applications.length }}</b> 条<template v-if="saveState.at"> · {{ fmtTime(saveState.at) }}</template>
        </div>
        <div v-if="fsState.error" class="chip danger" :title="fsState.error">⚠ 文件写入失败</div>
        <button v-if="needBackup" class="chip warn chip-btn" title="点击立即导出 JSON 备份" @click="exportJSON">
          ⚠ 已 7 天未备份，点击导出
        </button>
        <div class="chip" title="今天投递数">今日 <b>{{ todayCount }}</b></div>
        <div class="chip" title="最近 7 天投递数">本周 <b>{{ weekCount }}</b></div>
        <div v-if="staleCount" class="chip warn" title="超过 7 天没有状态变化，建议跟进一下">
          需跟进 <b>{{ staleCount }}</b>
        </div>
        <div
          v-if="!store.storageOk"
          class="chip danger"
          title="当前环境禁止本地存储，新增和修改不会保存。请换一个浏览器打开，或改用 http://localhost:5173 访问开发版"
        >
          ⚠ 无法保存数据
        </div>
        <span class="divider"></span>
        <button class="btn ghost" @click="doExportJSON">导出 JSON</button>
        <button class="btn ghost" @click="doExportCSV">导出 CSV</button>
        <button class="btn ghost" @click="fileInput.click()">导入</button>
        <button class="btn ghost danger-ghost" title="删除全部投递记录，不可恢复" @click="clearAll">清空</button>
        <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onImportFile" />
        <button class="btn primary" @click="openCreate">＋ 添加投递</button>
      </div>
    </header>

    <div class="toolbar">
      <div class="tabs">
        <button :class="{ active: view === 'board' }" @click="view = 'board'">看板</button>
        <button :class="{ active: view === 'list' }" @click="view = 'list'">列表</button>
        <button :class="{ active: view === 'stats' }" @click="view = 'stats'">统计</button>
      </div>
      <template v-if="view !== 'stats'">
        <input v-model.trim="filters.q" class="search" type="search" placeholder="搜索公司 / 岗位 / 备注…" />
        <select v-model="filters.channel">
          <option value="">全部渠道</option>
          <option v-for="c in channelOptions" :key="c" :value="c">{{ c }}</option>
        </select>
        <select v-model="filters.status">
          <option value="">全部状态</option>
          <option v-for="s in STATUSES" :key="s.key" :value="s.key">{{ s.label }}</option>
        </select>
        <label class="check" title="勾选后只显示超过 N 天没有状态变化的进行中记录">
          <input v-model="filters.staleOnly" type="checkbox" /> 只看需跟进
        </label>
        <label class="check" title="投递后多少天没有任何状态变化，就标记为「需跟进」">
          <input
            v-model.number="store.settings.followUpDays"
            @change="clampDays"
            type="number"
            min="1"
            max="365"
            class="days-input"
          />
          天无进展算需跟进
        </label>
        <span class="count">{{ filtered.length }} 条记录</span>
      </template>
    </div>

    <main :class="{ 'main-board': view === 'board' }">
      <KanbanView v-if="view === 'board'" :apps="filtered" @edit="openEdit" @create="openCreate" />
      <ListView v-else-if="view === 'list'" :apps="filtered" @edit="openEdit" />
      <StatsView v-else />
    </main>

    <ApplicationModal v-if="modal" :app="modal.app" @close="closeModal" />

    <ConfirmDialog />
    <transition name="toast">
      <div v-if="toastState.visible" class="toast" :class="toastState.kind">{{ toastState.message }}</div>
    </transition>
  </div>
</template>
