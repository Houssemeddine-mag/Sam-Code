import { app, shell, ipcMain } from 'electron'
import fs from 'fs/promises'
import { dirname, join, resolve, isAbsolute } from 'path'
import { pathToFileURL } from 'url'

const activatedPackages = new Map()

const CATALOG_URL = 'https://samcode-26.web.app/catalog.json'
const MARKETPLACE_BASE_URL = 'https://samcode-26.web.app'

function getMarketplaceRoot() {
  return resolve(app.getAppPath(), 'marketplace')
}

function getInstalledRoot() {
  return join(app.getPath('userData'), 'marketplace-installed')
}

function getCatalogPath() {
  return join(getMarketplaceRoot(), 'catalog.json')
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8')
  return JSON.parse(raw)
}

async function readCatalog() {
  try {
    const response = await fetch(CATALOG_URL)
    if (!response.ok) throw new Error(`Failed to fetch catalog: ${response.status}`)
    return await response.json()
  } catch (err) {
    console.error('Failed to fetch catalog online, falling back to local if available:', err)
    return await readJson(getCatalogPath())
  }
}

async function getCatalogItem(packageId) {
  const catalog = await readCatalog()
  return catalog.items.find((item) => item.id === packageId) || null
}

async function readManifest(packageId) {
  const item = await getCatalogItem(packageId)
  if (!item) {
    throw new Error(`Unknown marketplace package: ${packageId}`)
  }

  const manifestUrl = `${MARKETPLACE_BASE_URL}/${item.path}`
  let manifest
  try {
    const response = await fetch(manifestUrl)
    if (!response.ok) throw new Error()
    manifest = await response.json()
  } catch (err) {
    console.error('Failed to fetch manifest online, trying local', err)
    const manifestPath = resolve(getMarketplaceRoot(), item.path)
    manifest = await readJson(manifestPath)
  }

  return {
    item,
    manifest,
    manifestUrl,
    packagePath: item.path
  }
}

async function ensureInstalledRoot() {
  await fs.mkdir(getInstalledRoot(), { recursive: true })
}

async function downloadFile(url, destPath) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to download ${url}: ${response.status}`)

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  await fs.writeFile(destPath, buffer)
}

async function downloadPackageDirectory(packagePath, destDir, manifest, files) {
  await fs.rm(destDir, { recursive: true, force: true })
  await fs.mkdir(destDir, { recursive: true })

  const packageBaseUrl = `${MARKETPLACE_BASE_URL}/${dirname(packagePath)}`

  // We need to know which files to download since we can't 'dir' an HTTP server.
  // The catalog or manifest needs to specify this, or we just download common ones.
  // Assuming manifest and entry for now.
  const filesToDownload = ['manifest.json', manifest.entry || 'index.mjs', 'README.md']

  for (const file of filesToDownload) {
    try {
      await downloadFile(`${packageBaseUrl}/${file}`, join(destDir, file))
    } catch (err) {
      console.log(`Optional file not found: ${file}`)
    }
  }
}

async function writeInstalledRecord(installedPath, record) {
  await fs.writeFile(
    join(installedPath, 'installed.json'),
    JSON.stringify(record, null, 2),
    'utf-8'
  )
}

async function readInstalledRecord(packageId) {
  const installedPath = join(getInstalledRoot(), packageId)
  const recordPath = join(installedPath, 'installed.json')

  if (!(await fileExists(recordPath))) {
    return null
  }

  const record = await readJson(recordPath)
  return {
    ...record,
    installedPath
  }
}

async function listInstalledPackages() {
  await ensureInstalledRoot()

  const entries = await fs.readdir(getInstalledRoot(), { withFileTypes: true })
  const packages = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const record = await readInstalledRecord(entry.name)
    if (record) {
      packages.push(record)
    }
  }

  return packages.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
}

async function installPackage(packageId, visited = new Set()) {
  if (!packageId) {
    throw new Error('Package id is required')
  }

  if (visited.has(packageId)) {
    return await readInstalledRecord(packageId)
  }

  visited.add(packageId)
  await ensureInstalledRoot()

  const { item, manifest, manifestUrl, packagePath } = await readManifest(packageId)
  const dependencies = Array.isArray(manifest.dependencies)
    ? manifest.dependencies
    : Array.isArray(item.requires)
      ? item.requires
      : []

  for (const dependencyId of dependencies) {
    await installPackage(dependencyId, visited)
  }

  const installedPath = join(getInstalledRoot(), packageId)
  await downloadPackageDirectory(packagePath, installedPath, manifest)

  const record = {
    id: manifest.id || packageId,
    name: manifest.name || item.name || packageId,
    version: manifest.version || '1.0.0',
    type: manifest.type || item.type || 'package',
    manifestUrl,
    installedAt: new Date().toISOString(),
    installedPath,
    entry: manifest.entry || 'index.mjs',
    dependencies,
    runtime: manifest.runtime || null,
    features: Array.isArray(manifest.features) ? manifest.features : [],
    ui: manifest.ui || null,
    status: 'installed'
  }

  await writeInstalledRecord(installedPath, record)
  activatedPackages.delete(packageId)

  // IPC cloning issue: do not send complex objects or Functions back to the renderer
  const safeRecord = JSON.parse(JSON.stringify(record))
  return safeRecord
}

async function loadPackageModule(packageId) {
  const record = await readInstalledRecord(packageId)
  if (!record) {
    throw new Error(`Package ${packageId} is not installed.`)
  }

  const entryPath = resolve(record.installedPath, record.entry || 'index.mjs')
  if (!(await fileExists(entryPath))) {
    throw new Error(`Package entry not found: ${entryPath}`)
  }

  const moduleUrl = `${pathToFileURL(entryPath).href}?v=${Date.now()}`
  const module = await import(moduleUrl)
  return { record, module, entryPath }
}

async function activatePackage(packageId, context = {}) {
  if (activatedPackages.has(packageId)) {
    return activatedPackages.get(packageId)
  }

  const { record, module } = await loadPackageModule(packageId)

  const activationContext = {
    ...context,
    app,
    shell,
    packageId,
    packageRecord: record,
    marketplaceRoot: getMarketplaceRoot(),
    installedRoot: getInstalledRoot()
  }

  const activation =
    typeof module.activate === 'function' ? await module.activate(activationContext) : null
  const packageState = {
    record,
    activation,
    moduleExports: Object.keys(module).filter((key) => key !== 'default')
  }

  activatedPackages.set(packageId, packageState)
  // Ensure we send only serializable data over IPC
  return JSON.parse(JSON.stringify(packageState))
}

export async function activateInstalledPackages(context = {}) {
  const installedPackages = await listInstalledPackages()
  const activated = []

  for (const record of installedPackages) {
    const packageState = await activatePackage(record.id, context)
    activated.push(packageState)
  }

  return activated
}

export function registerMarketplaceHandlers() {
  ipcMain.handle('marketplace:getCatalog', async () => {
    return await readCatalog()
  })

  ipcMain.handle('marketplace:listInstalledPackages', async () => {
    return await listInstalledPackages()
  })

  ipcMain.handle('marketplace:installPackage', async (_, packageId) => {
    const record = await installPackage(String(packageId || '').trim())
    const activation = await activatePackage(record.id)
    return { record, activation }
  })

  ipcMain.handle('marketplace:activatePackage', async (_, packageId) => {
    return await activatePackage(String(packageId || '').trim())
  })

  ipcMain.handle('marketplace:activateInstalledPackages', async () => {
    return await activateInstalledPackages()
  })
}

export async function getMarketplacePackageState(packageId) {
  if (!packageId) return null

  const record = await readInstalledRecord(packageId)
  if (!record) return null

  const packageState = activatedPackages.get(packageId) || (await activatePackage(packageId))
  return JSON.parse(
    JSON.stringify({
      record,
      activation: packageState.activation,
      moduleExports: packageState.moduleExports
    })
  )
}

export async function getInstalledMarketplacePackages() {
  return await listInstalledPackages()
}
