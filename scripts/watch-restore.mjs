// 守护 v2：30 分钟内持续保护数据文件
// 1) 剔除示例记录（按 id 黑名单）
// 2) 与规范集（6 条真实记录）按 id 合并，防止旧窗口覆盖丢数据
// 3) 用户新增/修改的记录（updatedAt 更新）始终保留
import fs from 'node:fs'

const FILE = 'jobmark-data.json'
let canonical = []
try {
  canonical = JSON.parse(fs.readFileSync('canonical-real6.json', 'utf8'))
} catch {
  console.log('未找到 canonical-real6.json（本地数据文件），守护跳过')
  process.exit(0)
}
const canonicalById = new Map(canonical.map((a) => [a.id, a]))
const sampleIds = new Set(JSON.parse(fs.readFileSync('recovered-seq271.json', 'utf8')).applications.map((a) => a.id))
const deadline = Date.now() + 30 * 60 * 1000
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let fixes = 0
console.log('守护 v2 启动：规范集', canonical.length, '条，运行 30 分钟')

while (Date.now() < deadline) {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    const cur = d.applications || []

    // 需要修复的情况：
    // a) 规范集里的记录被覆盖丢失
    const lost = canonical.filter((a) => {
      const c = cur.find((x) => x.id === a.id)
      return !c || (a.updatedAt || 0) > (c.updatedAt || 0)
    })
    // b) 示例记录复活
    const revivedSamples = cur.filter((a) => sampleIds.has(a.id))

    if (lost.length || revivedSamples.length) {
      const byId = new Map()
      const put = (a) => {
        if (!a || !a.id || sampleIds.has(a.id)) return
        const prev = byId.get(a.id)
        if (!prev || (a.updatedAt || 0) >= (prev.updatedAt || 0)) byId.set(a.id, a)
      }
      for (const a of canonical) put(a)
      for (const a of cur) put(a)
      const merged = [...byId.values()].sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0))
      fs.writeFileSync(FILE, JSON.stringify({ ...d, applications: merged }, null, 2))
      fixes++
      console.log(
        new Date().toLocaleTimeString(),
        `修复 #${fixes}：找回 ${lost.length} 条${lost.length ? '（' + lost.map((m) => m.company).join('、') + '）' : ''}` +
          (revivedSamples.length ? `，清除 ${revivedSamples.length} 条示例` : '') +
          `；当前共 ${merged.length} 条`
      )
    }
  } catch (e) {
    console.log('watch error:', e.message)
  }
  await sleep(2000)
}
console.log('守护结束，共修复', fixes, '次')
