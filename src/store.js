import { reactive, watch } from 'vue'
import { FOLLOW_UP_DAYS, STATUS_MAP, COMPANY_TYPES } from './constants'
import { uid, download, todayStr } from './utils'

const STORAGE_KEY = 'job-mark-data-v2' // v2：与旧版本页面完全隔离的存储空间

// 示例数据黑名单：任何来源里出现这些 id 都直接剔除
const SAMPLE_IDS = new Set([
  '6c56bbe6-44f6-4df8-9dcb-f66bd84344c3',
  'f191a51f-4d12-4322-8d50-c37b192109ce',
  '8870a226-a27f-45be-bbd6-8cb5fa6b7fff',
  '18bb4e7e-cba2-4fb1-82c6-9e4a7f4178c3',
  'af644369-7d03-4380-9a04-64c7ff61cf10',
  '22c853e6-14d7-41f3-ac6d-f33c8e4fbd62',
  'ac5161c3-833a-49e7-b903-5a4a91f21a9b',
  'aa14c989-a343-4c52-b51c-7c4242044359',
])

function stripSamples(list) {
  return (list || []).filter((a) => !SAMPLE_IDS.has(a.id))
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      if (data && Array.isArray(data.applications)) {
        return {
          applications: stripSamples(data.applications),
          settings: { followUpDays: FOLLOW_UP_DAYS, ...(data.settings || {}) },
        }
      }
    }
  } catch (err) {
    console.warn('本地数据读取失败，已重新开始：', err)
  }
  return { applications: [], settings: { followUpDays: FOLLOW_UP_DAYS } }
}

// 探测 localStorage 是否可用（file:// 下个别环境或隐私模式可能禁用）
function storageAvailable() {
  try {
    localStorage.setItem('__job_mark_probe__', '1')
    localStorage.removeItem('__job_mark_probe__')
    return true
  } catch {
    return false
  }
}

export const store = reactive({ ...load(), storageOk: storageAvailable() })

// 保存状态（仅内存态，不参与持久化，供界面显示“已保存”指示）
export const saveState = reactive({ at: 0, count: 0 })

// ---- 数据文件模式 ----
// 桌面版（Electron）：主进程直接读写「文档」目录下的数据文件，零点击零授权
// 浏览器版：File System Access API，需首次授权选择文件
const electronAPI = window.electronAPI || null

export const fsState = reactive({
  supported: typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function' && !electronAPI,
  isElectron: !!electronAPI,
  connected: false,
  hasHandle: false,
  fileName: '',
  dataFile: '',
  error: '',
})
let fsHandle = null

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('job-mark-fs', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('kv')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbGet(key) {
  return idbOpen().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction('kv').objectStore('kv').get(key)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
  )
}

function idbSet(key, val) {
  return idbOpen().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite')
        tx.objectStore('kv').put(val, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
  )
}

// 按 id 合并文件与本地记录：取并集，同一记录以 updatedAt 较新者为准——
// 连接/重连时绝不让任何一方的记录凭空消失
function mergeApplications(fileApps) {
  const byId = new Map()
  const put = (a) => {
    if (!a || !a.id || SAMPLE_IDS.has(a.id)) return
    const prev = byId.get(a.id)
    if (!prev || (a.updatedAt || 0) >= (prev.updatedAt || 0)) byId.set(a.id, a)
  }
  for (const a of fileApps) put(a)
  for (const a of store.applications) put(a)
  return [...byId.values()]
}

// 启动加载：桌面版直接读数据文件；浏览器版检查授权句柄静默重连
;(async () => {
  if (electronAPI) {
    try {
      const { dataFile, data } = await electronAPI.loadData()
      fsState.dataFile = dataFile
      fsState.fileName = 'jobmark-data.json'
      const fileApps = data && Array.isArray(data.applications) ? data.applications : []
      const merged = mergeApplications(fileApps)
      store.applications.splice(0, store.applications.length, ...merged)
      fsState.connected = true
      persistNow()
    } catch (err) {
      fsState.error = '数据文件加载失败：' + ((err && err.message) || err)
    }
    return
  }
  try {
    const h = await idbGet('handle')
    if (!h) return
    fsHandle = h
    fsState.hasHandle = true
    fsState.fileName = h.name || 'jobmark-data.json'
    const perm = await h.queryPermission({ mode: 'readwrite' })
    if (perm !== 'granted') return // 需要用户点一次「连接数据文件」完成授权
    const file = await h.getFile()
    let fileApps = []
    if (file.size > 0) {
      const parsed = JSON.parse(await file.text())
      if (parsed && Array.isArray(parsed.applications)) fileApps = parsed.applications
    }
    const merged = mergeApplications(fileApps)
    store.applications.splice(0, store.applications.length, ...merged)
    fsState.connected = true
    persistNow() // 让 localStorage 缓存与文件保持一致
  } catch (err) {
    fsState.error = '数据文件读取失败（可能被移动或删除），点击「连接数据文件」重新选择。' + ((err && err.message) || err)
  }
})()

let writing = false
let pendingWrite = false
async function writeDataFile(json) {
  if (writing) {
    pendingWrite = true
    return
  }
  writing = true
  try {
    const w = await fsHandle.createWritable()
    await w.write(json)
    await w.close()
    saveState.at = Date.now()
    saveState.count = store.applications.length
    fsState.error = ''
  } catch (err) {
    fsState.error = '写入数据文件失败：' + ((err && err.message) || err)
  } finally {
    writing = false
    if (pendingWrite) {
      pendingWrite = false
      writeDataFile(JSON.stringify(store))
    }
  }
}

let saveTimer = null
function persistNow() {
  clearTimeout(saveTimer)
  const json = JSON.stringify(store)
  try {
    localStorage.setItem(STORAGE_KEY, json)
    saveState.at = Date.now()
    saveState.count = store.applications.length
  } catch (err) {
    console.warn('本地数据保存失败：', err)
  }
  if (fsState.connected && fsHandle) writeDataFile(json)
  if (electronAPI) {
    electronAPI
      .saveData(json)
      .then(() => {
        saveState.at = Date.now()
        saveState.count = store.applications.length
        fsState.error = ''
      })
      .catch((err) => {
        fsState.error = '数据文件写入失败：' + ((err && err.message) || err)
      })
  }
}

watch(store, () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(persistNow, 200)
})

window.addEventListener('beforeunload', persistNow)

function normalize(form) {
  const normUrl = (u) => {
    u = (u || '').trim()
    return u && !/^https?:\/\//i.test(u) ? `https://${u}` : u
  }
  return {
    company: (form.company || '').trim(),
    position: (form.position || '').trim(),
    channel: (form.channel || '').trim(),
    city: (form.city || '').trim(),
    branch: (form.branch || '').trim(),
    department: (form.department || '').trim(),
    companyTypes: Array.isArray(form.companyTypes) ? form.companyTypes.filter((t) => COMPANY_TYPES.includes(t)) : [],
    salary: (form.salary || '').trim(),
    url: normUrl(form.url),
    interviewUrl: normUrl(form.interviewUrl),
    notes: (form.notes || '').trim(),
    appliedDate: form.appliedDate || todayStr(),
    status: form.status || 'applied',
    endReason: form.status === 'closed' ? form.endReason || '其他' : '',
  }
}

export function addApplication(form) {
  const now = Date.now()
  const data = normalize(form)
  const app = {
    id: uid(),
    ...data,
    statusHistory: [{ status: data.status, at: now }],
    createdAt: now,
    updatedAt: now,
  }
  store.applications.unshift(app)
  return app
}

export function updateApplication(id, form) {
  const app = store.applications.find((a) => a.id === id)
  if (!app) return
  const next = normalize(form)
  const statusChanged = next.status !== app.status
  Object.assign(app, next, { updatedAt: Date.now() })
  if (statusChanged) app.statusHistory.push({ status: next.status, at: Date.now() })
  return app
}

export function removeApplication(id) {
  const i = store.applications.findIndex((a) => a.id === id)
  if (i >= 0) store.applications.splice(i, 1)
}

// 清空全部投递记录（设置保留）
export function clearAllData() {
  store.applications.splice(0, store.applications.length)
}

// 看板拖拽改状态
export function setStatus(id, statusKey) {
  const app = store.applications.find((a) => a.id === id)
  if (!app || app.status === statusKey) return
  app.status = statusKey
  if (statusKey === 'closed' && !app.endReason) app.endReason = '无响应'
  app.statusHistory.push({ status: statusKey, at: Date.now() })
  app.updatedAt = Date.now()
}

// 清除状态流转历史：只保留当前状态一条锚点（用于清理误拖/误操作留下的流转记录）
export function clearStatusHistory(id) {
  const app = store.applications.find((a) => a.id === id)
  if (!app) return
  const last = app.statusHistory && app.statusHistory.length ? app.statusHistory[app.statusHistory.length - 1].at : null
  app.statusHistory = [{ status: app.status, at: last || app.createdAt || Date.now() }]
  app.updatedAt = Date.now()
}

export function exportJSON() {
  store.settings.lastBackupAt = Date.now()
  download(
    `job-mark-backup-${todayStr()}.json`,
    JSON.stringify(
      { app: 'job-mark', version: 1, exportedAt: new Date().toISOString(), applications: store.applications },
      null,
      2
    ),
    'application/json'
  )
}

const CSV_HEADERS = ['公司', '岗位', '渠道', '城市', '分部', '部门', '企业属性', '薪资', '投递日期', '当前状态', '结束原因', 'JD链接', '面试链接', '备注']

export function exportCSV() {
  const esc = (v) => {
    v = String(v ?? '')
    return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  }
  const rows = store.applications.map((a) =>
    [
      a.company,
      a.position,
      a.channel,
      a.city,
      a.branch,
      a.department,
      (a.companyTypes || []).join('、'),
      a.salary,
      a.appliedDate,
      (STATUS_MAP[a.status] || {}).label || a.status,
      a.endReason,
      a.url,
      a.interviewUrl,
      a.notes,
    ]
      .map(esc)
      .join(',')
  )
  download(`job-mark-${todayStr()}.csv`, '\uFEFF' + [CSV_HEADERS.join(','), ...rows].join('\r\n'), 'text/csv;charset=utf-8')
}

// 导入：按 id 合并，已存在的更新、不存在的新增
export function importJSON(text) {
  const data = JSON.parse(text)
  const list = Array.isArray(data) ? data : data && data.applications
  if (!Array.isArray(list)) throw new Error('文件里找不到 applications 记录，请确认是本工具导出的 JSON')
  let added = 0
  let updated = 0
  for (const item of list) {
    if (!item || !item.company) continue
    const i = store.applications.findIndex((a) => a.id === item.id)
    if (i >= 0) {
      store.applications[i] = { ...store.applications[i], ...item }
      updated++
    } else {
      store.applications.unshift(item)
      added++
    }
  }
  return { added, updated }
}

// 连接数据文件：每次点击都弹出真实的文件选择框（可浏览任何路径）
// 首次 = 新建文件；重连 = 对话框自动定位到数据文件所在目录，选中它即可恢复连接
// 读写全程按 id 双向合并，不会覆盖丢失任何一方的记录
export async function connectDataFile() {
  if (!fsState.supported) return false
  fsState.error = ''
  try {
    const pickerOpts = (start) => {
      const o = {
        suggestedName: (fsHandle && fsState.fileName) || 'jobmark-data.json',
        types: [{ description: 'JobMark 数据文件', accept: { 'application/json': ['.json'] } }],
      }
      if (start) o.startIn = start
      return o
    }
    // 只有句柄权限已授予时才用它作为对话框起始目录（未授权句柄会让弹框直接抛错）
    let start = 'documents'
    if (fsHandle) {
      try {
        if ((await fsHandle.queryPermission({ mode: 'readwrite' })) === 'granted') start = fsHandle
      } catch {
        start = 'documents'
      }
    }
    let handle
    try {
      handle = await window.showSaveFilePicker(pickerOpts(start))
    } catch (e1) {
      if (e1 && e1.name === 'AbortError') throw e1 // 用户主动取消选择框
      handle = await window.showSaveFilePicker(pickerOpts()) // 起始目录异常时重试一次
    }
    fsHandle = handle
    await idbSet('handle', fsHandle)
    const file = await fsHandle.getFile()
    let fileApps = []
    if (file.size > 0) {
      try {
        const parsed = JSON.parse(await file.text())
        if (parsed && Array.isArray(parsed.applications)) fileApps = parsed.applications
      } catch {
        console.warn('数据文件内容无法解析，将与当前数据合并后整体覆盖')
      }
    }
    const merged = mergeApplications(fileApps)
    store.applications.splice(0, store.applications.length, ...merged)
    fsState.fileName = fsHandle.name || 'jobmark-data.json'
    fsState.hasHandle = true
    fsState.connected = true
    persistNow()
    return true
  } catch (err) {
    if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return false // 用户取消了选择框
    fsState.error = (err && err.message) || String(err)
    return false
  }
}

