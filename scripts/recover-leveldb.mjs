// 从 Chromium localStorage 的 LevelDB 日志里恢复 job-mark 数据（只读）
// 正确解码：value 首字节 0x00 = UTF-16-LE，0x01 = 单字节(latin1/utf8)
// 用法：node scripts/recover-leveldb.mjs <leveldb.log> [输出目录前缀]
import { readFileSync, writeFileSync } from 'node:fs'

const [src, outPrefix] = process.argv.slice(2)
const buf = readFileSync(src)

const STATUS_LABEL = {
  applied: '已投递', written: '笔试/测评', interview1: '一面', interview2: '二面',
  interview3: '三面/终面', hr: 'HR面', offer: 'Offer', closed: '流程结束',
}

// ---- LevelDB 日志帧解析（处理跨 32KB 块的分片） ----
const BLOCK = 32768
const records = []
let pos = 0
let pending = null
while (pos + 7 <= buf.length) {
  const blockEnd = Math.min(pos - (pos % BLOCK) + BLOCK, buf.length)
  if (blockEnd - pos < 7) {
    pos = blockEnd
    continue
  }
  const len = buf.readUInt16LE(pos + 4)
  const type = buf[pos + 6]
  const data = buf.subarray(pos + 7, pos + 7 + len)
  pos += 7 + len
  if (type === 1) {
    records.push(data)
    pending = null
  } else if (type === 2) {
    pending = Buffer.from(data)
  } else if (type === 3) {
    pending = pending ? Buffer.concat([pending, data]) : Buffer.from(data)
  } else if (type === 4) {
    records.push(pending ? Buffer.concat([pending, data]) : data)
    pending = null
  }
}

// ---- WriteBatch 解析 ----
function readVarint(b, i) {
  let shift = 0
  let result = 0
  for (;;) {
    const byte = b[i++]
    result += (byte & 0x7f) * Math.pow(2, shift)
    if (!(byte & 0x80)) return [result, i]
    shift += 7
  }
}

const found = []
for (const rec of records) {
  if (rec.length < 12) continue
  const seq = Number(rec.readBigUInt64LE(0))
  const count = rec.readUInt32LE(8)
  let i = 12
  for (let n = 0; n < count && i < rec.length; n++) {
    const tag = rec[i++]
    let keyLen
    ;[keyLen, i] = readVarint(rec, i)
    const key = rec.subarray(i, i + keyLen).toString('utf8')
    i += keyLen
    if (tag !== 1) continue
    let valLen
    ;[valLen, i] = readVarint(rec, i)
    const value = rec.subarray(i, i + valLen)
    i += valLen
    if (!key.includes('job-mark-data-v1') && !key.includes('job-mark-data-v2')) continue
    const encoding = value[0] === 0 ? 'utf16le' : 'latin1'
    const text = value.subarray(1).toString(encoding)
    try {
      const data = JSON.parse(text)
      found.push({ seq, origin: key.split('\x00')[0], encoding, data })
    } catch {
      // 解码失败时保留原文以便人工检查
      found.push({ seq, origin: key.split('\x00')[0], encoding, raw: text.slice(0, 120) })
    }
  }
}

console.log(`共找到 ${found.length} 个 job-mark-data-v1 写入版本（按写入顺序）：\n`)
found.forEach((f, i) => {
  if (!f.data) {
    console.log(`[${i}] seq=${f.seq} origin=${f.origin} 编码=${f.encoding} —— 仍无法解析: ${f.raw}`)
    return
  }
  const apps = f.data.applications || []
  const stamps = apps.map((a) => a.updatedAt || 0)
  const lastWrite = stamps.length ? new Date(Math.max(...stamps)).toLocaleString() : '无'
  console.log(`[${i}] seq=${f.seq} origin=${f.origin} 编码=${f.encoding} 记录数=${apps.length} 数据内最新更新=${lastWrite}`)
  apps.forEach((a) =>
    console.log(`    - ${a.company} / ${a.position}  [${STATUS_LABEL[a.status] || a.status}${a.endReason ? '·' + a.endReason : ''}]  投递:${a.appliedDate}  渠道:${a.channel || '—'}`)
  )
  if (outPrefix) {
    writeFileSync(`${outPrefix}-seq${f.seq}.json`, JSON.stringify({ app: 'job-mark', version: 1, exportedAt: new Date().toISOString(), applications: apps }, null, 2))
  }
})

if (found.length && outPrefix) {
  const withData = found.filter((f) => f.data)
  if (withData.length) {
    const best = withData.reduce((a, b) => (b.seq > a.seq ? b : a))
    console.log(`\n最新版本 seq=${best.seq}（${(best.data.applications || []).length} 条）已单独保存为 ${outPrefix}-seq${best.seq}.json`)
  }
}
