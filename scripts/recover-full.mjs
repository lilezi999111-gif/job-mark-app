// 完整版 leveldb 日志恢复：帧解析（处理跨块分片）+ 正确编码 + 全量输出
// 用法：node scripts/recover-full.mjs <leveldb.log>
import fs from 'node:fs'

const src = process.argv[2]
const buf = fs.readFileSync(src)
let SAMPLE_IDS = new Set()
try {
  SAMPLE_IDS = new Set(JSON.parse(fs.readFileSync('sample-ids.json', 'utf8')))
} catch {}

// ---- LevelDB 日志帧解析 ----
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
  const crc = buf.readUInt32LE(pos)
  const len = buf.readUInt16LE(pos + 4)
  const type = buf[pos + 6]
  if (crc === 0 && len === 0 && type === 0) {
    pos = blockEnd
    continue
  }
  const data = buf.subarray(pos + 7, pos + 7 + len)
  pos += 7 + len
  if (type === 1) {
    records.push(data)
  } else if (type === 2) {
    pending = Buffer.from(data)
  } else if (type === 3) {
    pending = pending ? Buffer.concat([pending, data]) : Buffer.from(data)
  } else if (type === 4) {
    records.push(pending ? Buffer.concat([pending, data]) : data)
    pending = null
  }
}

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

const versions = []
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
    if (!key.includes('job-mark-data-v2') && !key.includes('job-mark-data-v1')) continue
    const encoding = value[0] === 0 ? 'utf16le' : 'latin1'
    const text = value.subarray(1).toString(encoding)
    try {
      const data = JSON.parse(text)
      versions.push({ seq, origin: key.split('\x00')[0], encoding, data })
    } catch {
      versions.push({ seq, origin: key.split('\x00')[0], encoding, raw: text })
    }
  }
}

console.log(`共 ${versions.length} 个写入版本：\n`)
versions.forEach((v, i) => {
  if (!v.data) {
    console.log(`[${i}] seq=${v.seq} ${v.origin} ${v.encoding} —— 解析失败，原文前 150 字：`)
    console.log('   ' + JSON.stringify(v.raw.slice(0, 150)))
    return
  }
  const apps = v.data.applications || []
  console.log(`[${i}] seq=${v.seq} ${v.origin} ${v.encoding} 记录数=${apps.length}`)
  apps.forEach((a) => console.log(`    - ${a.company} / ${a.position}`))
})
