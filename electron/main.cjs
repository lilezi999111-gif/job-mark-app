// JobMark 桌面版主进程：数据文件放在程序同目录，随程序走，实时读写
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')

// 数据目录：便携 exe = exe 所在目录；开发运行 = 项目根目录
const dataDir = process.env.PORTABLE_EXECUTABLE_DIR
  || (app.isPackaged ? path.dirname(app.getPath('exe')) : path.join(__dirname, '..'))
// 可用环境变量覆盖数据文件位置（自动化测试用，避免污染真实数据）
const DATA_FILE = process.env.JOBMARK_DATA_FILE || path.join(dataDir, 'jobmark-data.json')
// 旧版数据文件位置（此前在「文档」目录）：仅在使用默认位置时才做迁移
const LEGACY_FILE = process.env.JOBMARK_DATA_FILE
  ? ''
  : path.join(app.getPath('documents'), 'jobmark-data.json')

// 首次运行的种子数据（真实投递记录）
// 种子数据（首次运行写入空数据文件用）：从本地数据文件读取，不入库
function readJSON(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}
const seedData = readJSON(path.join(__dirname, '..', 'seed.local.json'))
const SEED = {
  applications: (seedData && seedData.applications) || [],
  settings: (seedData && seedData.settings) || { followUpDays: 7 },
}

// 开发运行（未打包）使用隔离的存储目录，与正式安装版数据互不干扰
if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'job-mark-dev'))
}

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  } catch {
    return null
  }
}

function writeData(json) {
  fs.mkdirSync(dataDir, { recursive: true })
  const tmp = DATA_FILE + '.tmp'
  fs.writeFileSync(tmp, json)
  // Windows 上目标文件偶发被占用导致 rename 失败：重试，最终兜底直接覆盖写
  for (let i = 0; i < 3; i++) {
    try {
      fs.renameSync(tmp, DATA_FILE)
      return
    } catch (e) {
      if (i === 2) {
        fs.writeFileSync(DATA_FILE, json)
        try { fs.unlinkSync(tmp) } catch {}
      } else {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150)
      }
    }
  }
}

ipcMain.handle('load-data', () => {
  // 数据文件不存在：优先从旧位置迁移，否则用种子创建；存在则原样返回（绝不混入其他数据）
  if (!fs.existsSync(DATA_FILE)) {
    if (LEGACY_FILE && fs.existsSync(LEGACY_FILE)) {
      fs.copyFileSync(LEGACY_FILE, DATA_FILE)
    } else {
      writeData(JSON.stringify(SEED))
    }
  }
  return { dataFile: DATA_FILE, data: readData() }
})

ipcMain.handle('save-data', (event, json) => {
  writeData(json)
  return true
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    autoHideMenuBar: true,
    title: 'JobMark · 投递记录',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: ['--jobmark-data-file=' + DATA_FILE],
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows()
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()
