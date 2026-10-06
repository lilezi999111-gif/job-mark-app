// 便携版 exe 启动验证
// 防污染三件套：临时数据文件（不碰真实数据）+ 验证前清掉打包版 localStorage 残留 + 禁用后台节流
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 测试用临时数据文件：不触碰真实数据
const TMP_DATA = path.join(tmpdir(), `jm-portable-test-${Date.now()}.json`)
fs.writeFileSync(
  TMP_DATA,
  JSON.stringify({
    applications: ['甲', '乙', '丙', '丁', '戊', '己'].map((s, i) => ({
      id: `seed-${i}`,
      company: `测试公司${s}`,
      position: '测试岗位',
      appliedDate: '2026-01-01',
      status: 'applied',
      updatedAt: Date.now() - (i + 1) * 1000,
    })),
    settings: { followUpDays: 7 },
  })
)
// 打包版 userData 的 localStorage 会在启动时按 id 并集「复活」旧缓存，验证前先清掉
const lsDir = path.join(process.env.APPDATA || '', 'job-mark', 'Local Storage')
try {
  fs.rmSync(lsDir, { recursive: true, force: true })
} catch {} // 上次实例若仍有残留锁，启动后的兜底清理会再试

const child = spawn(
  'release/JobMark.exe',
  [
    '--remote-debugging-port=9223',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
  ],
  {
    stdio: 'ignore',
    env: { ...process.env, JOBMARK_DATA_FILE: TMP_DATA },
  }
)

const result = {}
let browser = null
try {
  for (let i = 0; i < 100 && !browser; i++) {
    try {
      browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9223', defaultViewport: null, protocolTimeout: 120000 })
    } catch {
      await sleep(300)
    }
  }
  if (!browser) throw new Error('无法连接便携版 exe')
  const pages = await browser.pages()
  const page = pages.find((p) => p.url().includes('index.html')) || (await browser.pages())[0]

  const dataFile = await page.evaluate(() => window.electronAPI && window.electronAPI.dataFile)
  if (dataFile !== TMP_DATA) throw new Error('JOBMARK_DATA_FILE 未生效: ' + dataFile)

  const start = Date.now()
  for (;;) {
    const n = await page.$$eval('article', (els) => els.length).catch(() => 0)
    if (n >= 6) {
      result.records = n
      result.loadTimeMs = Date.now() - start
      break
    }
    if (Date.now() - start > 20000) throw new Error('记录未加载')
    await sleep(300)
  }
  result.chip = await page.$eval('.chip.ok', (e) => e.textContent.trim())
} catch (e) {
  result.failedAt = e.message.split('\n')[0]
} finally {
  console.log(JSON.stringify(result, null, 2))
  try {
    await browser.close() // CDP 优雅关闭，确保 Chromium 子进程全部退出
  } catch {}
  child.kill() // 兜底
  // 等主进程真正退出（否则 leveldb 文件仍被占用），再清掉验证实例写入的 localStorage
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve()
    child.once('exit', resolve)
    setTimeout(resolve, 5000)
  })
  await sleep(500)
  for (let i = 0; i < 10; i++) {
    try {
      fs.rmSync(lsDir, { recursive: true, force: true })
      break
    } catch {
      await sleep(500) // Windows 上文件锁释放有延迟，轮询重试
    }
  }
  try {
    fs.unlinkSync(TMP_DATA)
  } catch {}
}
