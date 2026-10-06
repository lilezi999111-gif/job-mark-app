// 单文件版冒烟测试：直接驱动本机 Chrome 打开 file:// 页面
// 用法：node scripts/verify-singlefile.mjs
// 注：不使用 puppeteer 的 waitForFunction（在本环境不可靠），统一用轮询 + $$eval
import puppeteer from 'puppeteer-core'
import { tmpdir } from 'node:os'
import { config } from './lib/config.mjs'
import { join } from 'node:path'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const FILE = 'file:///' + process.cwd().replace(/\\/g, '/') + '/JobMark.html'
const PROFILE = join(tmpdir(), `jm-pptr-${Date.now()}`)

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check', `--user-data-dir=${PROFILE}`],
})

const errors = []
const page = await browser.newPage()
page.on('console', (m) => m.type() === 'error' && errors.push('CONSOLE: ' + m.text()))
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('dialog', (d) => d.accept())

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 轮询等待：fn 返回真值即通过，超时抛错
async function waitPoll(desc, fn, timeout = 8000) {
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
    await sleep(150)
  }
}

const articleCount = () => page.$$eval('article', (els) => els.length)

async function addApp(company, position) {
  await page.click('header button.btn.primary')
  await page.waitForSelector('.modal', { timeout: 5000 })
  await page.type('.modal input[placeholder*="公司"]', company)
  await page.type('.modal input[placeholder*="工程师"]', position)
  const before = await articleCount() // 模态打开期间数量稳定，必须在点保存前取，否则与快速渲染竞态
  await page.click('.modal button[type="submit"]')
  await waitPoll('卡片出现', async () => (await articleCount()) >= before + 1)
}

const result = {}
try {
  await page.goto(FILE, { waitUntil: 'domcontentloaded' })
  // 种子数据应直接呈现（v2 存储，双击即见）
  await waitPoll('种子记录呈现', async () => (await articleCount()) >= 6)
  result.seededRecords = await articleCount()
  result.noSampleButton =
    (await page.$$eval('button', (els) => els.some((e) => e.textContent.includes('示例')))) === false

  // 清空成确定性空库，再跑标准流程（应用内确认框 → 确定）
  await page.evaluate(() =>
    [...document.querySelectorAll('.topbar-right .btn')].find((b) => b.textContent.trim() === '清空').click()
  )
  await page.waitForSelector('.confirm-modal', { timeout: 5000 })
  await page.click('.confirm-modal .btn.primary')
  await waitPoll('清空种子', async () => (await articleCount()) === 0)

  // 表单录入两条记录
  await addApp('示例公司甲', '示例岗位甲')
  result.cardsAfterAdd1 = await articleCount()
  await addApp('示例公司乙', '示例岗位乙')
  result.cardsAfterAdd2 = await articleCount()

  // 保存状态指示 + 备份提醒 + 文件模式按钮
  await waitPoll('已保存指示', async () =>
    page.$eval('.chip.ok', (e) => e.textContent.includes('已保存') && /\d{2}:\d{2}/.test(e.textContent))
  )
  result.saveIndicator = await page.$eval('.chip.ok', (e) => e.textContent.trim())
  await waitPoll('备份提醒', async () =>
    page.$eval('.chip-btn', (e) => /已 7 天未备份/.test(e.textContent))
  )
  result.backupReminder = true
  result.fileModeButton = await page.$$eval('.file-btn', (els) => els.map((e) => e.textContent.trim()))

  // 编辑 B：状态改为“一面”，产生两步流转历史
  await page.click('::-p-text(示例公司乙)')
  await page.waitForSelector('.modal', { timeout: 5000 })
  await page.select('.modal select', 'interview1')
  await page.click('.modal button[type="submit"]')
  await waitPoll('B 移到一面列', async () =>
    page.$$eval('article', (els) =>
      els.some(
        (e) =>
          e.textContent.includes('示例公司乙') &&
          e.closest('.kcol')?.querySelector('h3')?.textContent === '一面'
      )
    )
  )
  result.movedToInterview1 = true

  // 清除状态流转历史（应用内确认框 → 确定）
  await page.click('::-p-text(示例公司乙)')
  await page.waitForSelector('.history', { timeout: 5000 })
  await page.click('.history-clear')
  await page.waitForSelector('.confirm-modal', { timeout: 5000 })
  await page.click('.confirm-modal .btn.primary')
  await waitPoll('流转历史清除', async () => (await page.$$eval('.history', (els) => els.length)) === 0)
  await page.keyboard.press('Escape')
  await waitPoll('弹窗关闭', async () => (await page.$$eval('.modal', (els) => els.length)) === 0)
  result.historyClear = true

  // 拖拽第一张卡片到“流程结束”列（标准 HTML5 拖拽事件序列）
  const closedBefore = await page.$$eval('.kcol.fail article', (els) => els.length)
  await page.evaluate(() => {
    const card = document.querySelector('article')
    const col = document.querySelector('.kcol.fail')
    const dt = new DataTransfer()
    card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
    col.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
    col.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
  })
  await waitPoll('拖拽生效', async () => (await page.$$eval('.kcol.fail article', (els) => els.length)) >= closedBefore + 1)
  result.dragDrop = true
  result.closedCardsAfterDrag = await page.$$eval('.kcol.fail article', (els) => els.length)

  // 刷新验证持久化
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitPoll('刷新后记录保留', async () => (await articleCount()) >= 2)
  result.cardsAfterReload = await articleCount()
  result.closedCardsAfterReload = await page.$$eval('.kcol.fail article', (els) => els.length)

  // 统计页
  await page.evaluate(() => [...document.querySelectorAll('.tabs button')].find((b) => b.textContent.trim() === '统计').click())
  await page.waitForSelector('.stat-grid', { timeout: 5000 })
  result.statsOk = true

  // 一键清空
  await page.evaluate(() =>
    [...document.querySelectorAll('.topbar-right .btn')].find((b) => b.textContent.trim() === '清空').click()
  )
  await page.waitForSelector('.confirm-modal', { timeout: 5000 })
  await page.click('.confirm-modal .btn.primary')
  await waitPoll('清空生效', async () => (await articleCount()) === 0)
  result.clearAll = true
} catch (e) {
  result.failedAt = e.message
} finally {
  result.jsErrors = errors
  console.log(JSON.stringify(result, null, 2))
  await browser.close()
}
