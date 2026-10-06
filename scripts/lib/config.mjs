// 本地配置读取：config.local.json（不入库）覆盖默认值
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const DEFAULTS = {
  chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  appDir: '.',
}

let local = {}
try {
  const cfgPath = new URL('../../config.local.json', import.meta.url)
  local = JSON.parse(fs.readFileSync(fileURLToPath(cfgPath), 'utf8'))
} catch {
  // 没有 config.local.json 时使用默认值
}

export const config = { ...DEFAULTS, ...local }
