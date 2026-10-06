// 构建带种子数据的单文件版：把真实记录封装进 JobMark.html
// 用法：npm run build && node scripts/build-seeded.mjs
import fs from 'node:fs'

let seed = { applications: [] }
try {
  seed = JSON.parse(fs.readFileSync('seed.local.json', 'utf8'))
} catch {
  console.log('未找到 seed.local.json，生成不带初始数据的版本')
}
let html = fs.readFileSync('dist/index.html', 'utf8')

const inject = `<script>window.__JOBMARK_SEED__=${JSON.stringify(seed)};try{if(!localStorage.getItem('job-mark-data-v2'))localStorage.setItem('job-mark-data-v2',JSON.stringify({applications:window.__JOBMARK_SEED__.applications,settings:{followUpDays:7}}))}catch(e){}</script>`

if (!html.includes('<div id="app"></div>')) throw new Error('index.html 结构变化，注入失败')
html = html.replace('<div id="app"></div>', `<div id="app"></div>\n    ${inject}`)

fs.writeFileSync('JobMark.html', html)
console.log('JobMark.html 已生成，内置', seed.applications.length, '条记录')
