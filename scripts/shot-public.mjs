// 生成公开 README 截图：全新环境 + 通用示例数据（无任何真实信息）
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { config } from './lib/config.mjs'

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

const FILE = 'file:///' + process.cwd().replace(/\\/g, '/') + '/dist/index.html'
const browser = await puppeteer.launch({
  executablePath: config.chromePath,
  headless: 'new',
  args: ['--no-first-run', `--user-data-dir=${join(tmpdir(), `jm-shot-${Date.now()}`)}`],
  defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 2 },
})

const page = await browser.newPage()
await page.goto(FILE, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.empty-state', { timeout: 8000 })

const records = [
  { company: '云帆信息科技', position: '前端开发工程师', channel: 'BOSS直聘', city: '深圳', branch: '研发中心', department: '电商平台', salary: '18-28K', types: ['创业公司'], status: 'applied' },
  { company: '星辉数据服务', position: '数据开发工程师', channel: '内推', city: '杭州', branch: '数据平台部', salary: '20-32K', types: ['上市'], status: 'interview1' },
  { company: '澜舟智能', position: '算法工程师', channel: '官网', city: '北京', branch: 'AI实验室', salary: '25-40K', types: ['独角兽'], status: 'written' },
  { company: '白鹭云计算', position: '测试开发工程师', channel: '猎聘', city: '广州', department: '质量保障部', salary: '15-25K', types: ['合资', '上市'], status: 'offer' },
  { company: '远山软件', position: '后端开发工程师', channel: '拉勾', city: '成都', salary: '12-20K', types: ['私企'], status: 'applied' },
]

let n = 0
for (const r of records) {
  n++
  await page.click('header button.btn.primary')
  await page.waitForSelector('.modal', { timeout: 5000 })
  await page.type('.modal input[placeholder*="公司名称"]', r.company)
  await page.type('.modal input[placeholder*="开发工程师"]', r.position)
  await page.type('.modal input[list="channel-list"]', r.channel)
  await page.type('.modal input[placeholder*="北京"]', r.city)
  if (r.branch) await page.type('.modal input[placeholder*="分公司"]', r.branch)
  if (r.department) await page.type('.modal input[placeholder*="运维"]', r.department)
  if (r.salary) await page.type('.modal input[placeholder*="15薪"]', r.salary)
  for (const t of r.types) await page.click(`.type-chip::-p-text(${t})`)
  if (r.status !== 'applied') await page.select('.modal select', r.status)
  await page.click('.modal button[type="submit"]')
  await waitPoll(`卡片${n}`, async () => (await page.$$('article')).length >= n)
}

fs.mkdirSync('docs', { recursive: true })
await page.screenshot({ path: 'docs/screenshot.png' })
console.log('截图已生成 docs/screenshot.png')
await browser.close()
