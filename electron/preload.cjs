const { contextBridge, ipcRenderer } = require('electron')

const dataFileArg = process.argv.find((a) => a.startsWith('--jobmark-data-file='))
const dataFilePath = dataFileArg ? dataFileArg.split('=')[1] : ''

contextBridge.exposeInMainWorld('electronAPI', {
  dataFile: dataFilePath,
  isElectron: true,
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (json) => ipcRenderer.invoke('save-data', json),
})
