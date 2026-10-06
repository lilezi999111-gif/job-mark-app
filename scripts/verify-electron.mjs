// 桌面版（Electron）自动化验证：通过远程调试协议连上真实应用
// 验证：种子记录呈现、数据文件生成、改动实时写入文件、删除同步
// 用法：node scripts/verify-electron.mjs
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import electronPath from 'electron'

const APP_DIR = '.'
const PORT = 9222

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitPoll(desc, fn, timeout = 10000) {
  const start = Date.now()
  for (;;) {
    let ok = false
    try {
      ok = await fn()
    } catch {
      ok = false
    }
    if (ok) return
    if (Date.now() - start > timeout) throw new Error('等待超时: ' + desc)
    await sleep(200)
  }
}

const uniqueName = '桌面版验证测试'
// 每次运行前重置应用存储，避免历史测试记录累积
const lsWithoutLock = path.join(process.env.APPDATA || '', 'job-mark-dev', 'Local Storage')
fs.rmSync(lsWithoutLock, { recursive: true, force: true })
// 测试用临时数据文件：不触碰真实数据
const TMP_DATA = path.join(tmpdir(), `jm-electron-test-${Date.now()}.json`)
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
const child = spawn(
    electronPath,
    [
      APP_DIR,
      `--remote-debugging-port=${PORT}`,
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
    ],{
  stdio: 'ignore',
  cwd: APP_DIR,
  env: { ...process.env, JOBMARK_DATA_FILE: TMP_DATA },
})

const result = {}
try {
  // 等 CDP 端口就绪
  let browser = null
  for (let i = 0; i < 50 && !browser; i++) {
    try {
      browser = await puppeteer.connect({
        browserURL: `http://127.0.0.1:${PORT}`,
        defaultViewport: null,
        protocolTimeout: 120000,
      })
    } catch {
      await sleep(300)
    }
  }
  if (!browser) throw new Error('无法连接 Electron 调试端口')

  const pages = await browser.pages()
  const page0 = pages[0]
  if (page0) await page0.bringToFront().catch(() => {})
  const page = pages.find((p) => p.url().includes('index.html')) || (await browser.pages())[0]
  const DATA_FILE = await page.evaluate(() => window.electronAPI && window.electronAPI.dataFile)
  if (!DATA_FILE) throw new Error('未取到数据文件路径')
  console.log('数据文件:', DATA_FILE)

  // 1. 种子记录直接呈现
  await waitPoll('种子记录呈现', async () => (await page.$$('article')).length >= 6)
  result.seededRecords = (await page.$$('article')).length

  // 2. 已连接数据文件指示
  result.chip = await page.$eval('.chip.ok', (e) => e.textContent.trim())

  // 3. 数据文件已在「文档」目录生成，内容与界面一致
  await waitPoll('数据文件生成', () => fs.existsSync(DATA_FILE))
  const disk = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  result.fileRecordsAfterSeed = disk.applications.length

  // 4. 实时持久化：录入一条，文件立即更新
  await page.click('header button.btn.primary')
  await page.waitForSelector('.modal', { timeout: 5000 })
  await page.type('.modal input[placeholder*="公司"]', uniqueName)
  await page.type('.modal input[placeholder*="工程师"]', '自动化验证岗位')
  await page.click('.modal button[type="submit"]')
  await waitPoll('新卡片出现', async () => (await page.$$('article')).length >= 7)
  await waitPoll('文件同步新记录', () => fs.readFileSync(DATA_FILE, 'utf8').includes(uniqueName))
  result.realtimeFilePersist = true
  result.fileRecordsAfterAdd = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')).applications.length

  // 5. 删除该测试记录（应用内确认框 → 确定），文件同步删除
  const beforeDelete = await page.$$eval('article', (els) => els.length)
  await page.click('::-p-text(' + uniqueName + ')')
  await page.waitForSelector('.modal', { timeout: 5000 })
  await page.click('.modal .btn.danger-ghost')
  await page.waitForSelector('.confirm-modal', { timeout: 5000 })
  await page.click('.confirm-modal .btn.primary')
  await waitPoll('记录删除', async () => (await page.$$('article')).length <= beforeDelete - 1)
  await waitPoll('文件同步删除', async () => !fs.readFileSync(DATA_FILE, 'utf8').includes(uniqueName))
  result.deleteSynced = true
  result.fileRecordsAfterDelete = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')).applications.length

  result.dataFile = DATA_FILE
} catch (e) {
  result.failedAt = e.message.split('\n')[0]
} finally {
  result.jsErrors = []
  console.log(JSON.stringify(result, null, 2))
  try {
    await browser.close()
  } catch {}
  child.kill()
}
