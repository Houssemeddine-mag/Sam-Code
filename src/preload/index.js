import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  getStartupWorkspacePath: () => {
    const arg = process.argv.find((value) => value.startsWith('--workspacePath='))
    if (!arg) return ''
    return decodeURIComponent(arg.slice('--workspacePath='.length))
  },
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  openFolderInNewWindow: () => ipcRenderer.invoke('dialog:openFolderNewWindow'),
  newWindowWithFolder: (folderPath) => ipcRenderer.invoke('window:newWithFolder', folderPath),
  newWindow: () => ipcRenderer.invoke('window:new'),
  readDir: (dirPath) => ipcRenderer.invoke('fs:readDir', dirPath),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  saveFile: (filePath, content) => ipcRenderer.invoke('fs:saveFile', filePath, content),
  saveAsFile: (content) => ipcRenderer.invoke('fs:saveAs', content),
  mkdir: (dirPath) => ipcRenderer.invoke('fs:makeDir', dirPath),
  deletePath: (targetPath) => ipcRenderer.invoke('fs:delete', targetPath),
  renamePath: (oldPath, newPath) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
  copyPath: (src, dest) => ipcRenderer.invoke('fs:copy', src, dest),
  zoomIn: () => ipcRenderer.invoke('zoom:in'),
  zoomOut: () => ipcRenderer.invoke('zoom:out'),
  runCommand: (payload) => ipcRenderer.invoke('shell:runCommand', payload),
  executeNotebookCell: (payload) => ipcRenderer.invoke('notebook:executeCell', payload),
  openExternal: (targetPath) => ipcRenderer.invoke('shell:openExternal', targetPath),
  listPythonEnvironments: (cwd) => ipcRenderer.invoke('python:listEnvironments', cwd),
  getMarketplaceCatalog: () => ipcRenderer.invoke('marketplace:getCatalog'),
  listMarketplacePackages: () => ipcRenderer.invoke('marketplace:listInstalledPackages'),
  installMarketplacePackage: (packageId) =>
    ipcRenderer.invoke('marketplace:installPackage', packageId),
  uninstallMarketplacePackage: (packageId) =>
    ipcRenderer.invoke('marketplace:uninstallPackage', packageId),
  activateMarketplacePackage: (packageId) =>
    ipcRenderer.invoke('marketplace:activatePackage', packageId),
  activateInstalledMarketplacePackages: () =>
    ipcRenderer.invoke('marketplace:activateInstalledPackages'),
  applyAgentOperations: (payload) => ipcRenderer.invoke('agent:applyOperations', payload),
  listOpenRouterModels: (apiKey) => ipcRenderer.invoke('openrouter:listModels', apiKey),
  listProviderModels: (connection, provider) =>
    ipcRenderer.invoke('provider:listModels', connection, provider),
  createTerminal: (payload) => ipcRenderer.invoke('terminal:create', payload),
  writeTerminal: (sessionId, data) => ipcRenderer.invoke('terminal:write', sessionId, data),
  resizeTerminal: (sessionId, cols, rows) =>
    ipcRenderer.invoke('terminal:resize', sessionId, cols, rows),
  disposeTerminal: (sessionId) => ipcRenderer.invoke('terminal:dispose', sessionId),
  onTerminalData: (callback) => {
    const listener = (_, payload) => callback(payload)
    ipcRenderer.on('terminal:data', listener)
    return () => ipcRenderer.removeListener('terminal:data', listener)
  },
  onTerminalExit: (callback) => {
    const listener = (_, payload) => callback(payload)
    ipcRenderer.on('terminal:exit', listener)
    return () => ipcRenderer.removeListener('terminal:exit', listener)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
