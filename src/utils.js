import { STATUS_MAP } from './constants'

export function fmtDate(ts) {
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function todayStr() {
  return fmtDate(Date.now())
}

// HH:MM 时间显示
export function fmtTime(ts) {
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

// 距离某个时间点过了多少天
export function daysSince(ts) {
  return Math.max(0, Math.floor((Date.now() - ts) / 86400000))
}

// 最后一次状态变化的时间
export function lastChangeAt(app) {
  const h = app.statusHistory
  return h && h.length ? h[h.length - 1].at : app.createdAt
}

// 是否“需跟进”：还在进行中的流程，超过 N 天没有状态变化
export function isStale(app, followUpDays) {
  const meta = STATUS_MAP[app.status]
  if (!meta || meta.type !== 'active') return false
  return daysSince(lastChangeAt(app)) >= followUpDays
}

export function uid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function download(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
