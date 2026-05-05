import { app, shell, ipcMain } from 'electron'
import fs from 'fs/promises'
import { existsSync } from 'fs'
import { dirname, join, resolve, isAbsolute } from 'path'
import { pathToFileURL } from 'url'

const activatedPackages = new Map()
const packageModules = new Map() // Stores { module, activation } for deactivation

const CATALOG_URL = 'https://samcode-26.web.app/catalog.json'
const MARKETPLACE_BASE_URL = 'https://samcode-26.web.app'

function getMarketplaceRoot() {
  const candidateRoots = [
    resolve(app.getAppPath(), 'marketplace'),
    resolve(app.getAppPath(), 'landing'),
    resolve(process.cwd(), 'marketplace'),
    resolve(process.cwd(), 'landing')
  ]

  return candidateRoots.find((root) => existsSync(root)) || candidateRoots[0]
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
  let remoteCatalog = null
  try {
    const response = await fetch(CATALOG_URL)
    if (!response.ok) throw new Error(`Failed to fetch catalog: ${response.status}`)
    remoteCatalog = await response.json()
  } catch (err) {
    console.error('Failed to fetch catalog online, falling back to local if available:', err)
  }

  try {
    const localCatalog = await readJson(getCatalogPath())
    if (!remoteCatalog) {
      return localCatalog
    }

    const mergedItems = new Map()
    for (const item of Array.isArray(remoteCatalog.items) ? remoteCatalog.items : []) {
      if (item?.id) mergedItems.set(item.id, item)
    }
    for (const item of Array.isArray(localCatalog.items) ? localCatalog.items : []) {
      if (item?.id) mergedItems.set(item.id, item)
    }

    return {
      ...localCatalog,
      ...remoteCatalog,
      items: Array.from(mergedItems.values())
    }
  } catch (localErr) {
    if (remoteCatalog) {
      return remoteCatalog
    }
    throw localErr
  }
}

async function getCatalogItem(packageId) {
  console.log(`[Marketplace] getCatalogItem: Looking for package "${packageId}"`)

  try {
    const catalog = await readCatalog()
    console.log(`[Marketplace] getCatalogItem: Catalog has ${catalog.items?.length || 0} items`)
    console.log(
      `[Marketplace] getCatalogItem: Available package IDs: ${catalog.items?.map((i) => i.id).join(', ') || 'none'}`
    )

    const found = catalog.items.find((item) => item.id === packageId)
    if (found) {
      console.log(`[Marketplace] getCatalogItem: Found "${packageId}" in catalog`)
      return found
    }
  } catch (err) {
    console.error(`[Marketplace] getCatalogItem: Error reading catalog:`, err)
  }

  try {
    const localCatalog = await readJson(getCatalogPath())
    console.log(
      `[Marketplace] getCatalogItem: Local catalog has ${localCatalog.items?.length || 0} items`
    )
    const localFound = localCatalog.items.find((item) => item.id === packageId)
    if (localFound) {
      console.log(`[Marketplace] getCatalogItem: Found "${packageId}" in local catalog`)
      return localFound
    }
  } catch (err) {
    console.log(
      `[Marketplace] getCatalogItem: Error reading local catalog, trying direct manifest lookup:`,
      err.message
    )
  }

  console.log(
    `[Marketplace] getCatalogItem: Package not in catalogs, checking direct manifest paths for "${packageId}"`
  )
  const localPackageRoots = [
    resolve(getMarketplaceRoot(), 'packages', packageId),
    resolve(app.getAppPath(), 'marketplace', 'packages', packageId),
    resolve(app.getAppPath(), 'landing', 'packages', packageId),
    resolve(process.cwd(), 'marketplace', 'packages', packageId),
    resolve(process.cwd(), 'landing', 'packages', packageId)
  ]

  console.log(`[Marketplace] getCatalogItem: Checking paths: ${localPackageRoots.join(' | ')}`)

  for (const packageRoot of localPackageRoots) {
    const manifestPath = join(packageRoot, 'manifest.json')
    console.log(`[Marketplace] getCatalogItem: Checking ${manifestPath}...`)
    if (await fileExists(manifestPath)) {
      try {
        console.log(`[Marketplace] getCatalogItem: Found manifest at ${manifestPath}`)
        const manifest = await readJson(manifestPath)
        return {
          id: manifest.id || packageId,
          name: manifest.name || packageId,
          type: manifest.type || 'extension',
          description: manifest.description || '',
          path: manifestPath,
          resolvedPath: manifestPath,
          requires: Array.isArray(manifest.dependencies) ? manifest.dependencies : []
        }
      } catch (err) {
        console.error(
          `[Marketplace] getCatalogItem: Error reading manifest at ${manifestPath}:`,
          err.message
        )
      }
    }
  }

  console.error(`[Marketplace] getCatalogItem: Package "${packageId}" not found in any location`)
  return null
}

async function readManifest(packageId) {
  console.log(`[Marketplace] readManifest: Loading manifest for "${packageId}"`)
  const item = await getCatalogItem(packageId)
  if (!item) {
    console.error(`[Marketplace] readManifest: getCatalogItem returned null for "${packageId}"`)
    throw new Error(`Unknown marketplace package: ${packageId}`)
  }

  console.log(`[Marketplace] readManifest: Found item:`, {
    id: item.id,
    name: item.name,
    path: item.path,
    resolvedPath: item.resolvedPath
  })

  const manifestPath =
    item.resolvedPath ||
    (isAbsolute(item.path) ? item.path : resolve(getMarketplaceRoot(), item.path))
  const manifestUrl = isAbsolute(manifestPath)
    ? pathToFileURL(manifestPath).href
    : `${MARKETPLACE_BASE_URL}/${item.path}`
  console.log(
    `[Marketplace] readManifest: manifestPath="${manifestPath}", manifestUrl="${manifestUrl}"`
  )

  let manifest
  try {
    if (isAbsolute(manifestPath)) {
      console.log(`[Marketplace] readManifest: Reading local manifest from ${manifestPath}`)
      manifest = await readJson(manifestPath)
    } else {
      console.log(`[Marketplace] readManifest: Fetching manifest from ${manifestUrl}`)
      const response = await fetch(manifestUrl)
      if (!response.ok) throw new Error()
      manifest = await response.json()
    }
  } catch (err) {
    console.error('Failed to fetch manifest online, trying local', err)
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

async function deactivatePackage(packageId) {
  const packageState = activatedPackages.get(packageId)
  if (!packageState) return

  const deactivate = packageState.module?.deactivate
  if (typeof deactivate === 'function') {
    await deactivate(packageState.activation)
  }

  activatedPackages.delete(packageId)
}

async function uninstallPackage(packageId) {
  const record = await readInstalledRecord(packageId)
  if (!record) {
    return { removed: false, packageId }
  }

  await deactivatePackage(packageId)
  await fs.rm(record.installedPath, { recursive: true, force: true })

  // Clean up the activated package state
  activatedPackages.delete(packageId)

  return { removed: true, packageId, record }
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
  // Store module for deactivation
  packageModules.set(packageId, { module, activation })
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
  console.log('[Marketplace] Registering marketplace handlers...')

  ipcMain.handle('marketplace:getCatalog', async () => {
    console.log('[Marketplace] Handling getCatalog')
    return await readCatalog()
  })

  ipcMain.handle('marketplace:listInstalledPackages', async () => {
    console.log('[Marketplace] Handling listInstalledPackages')
    return await listInstalledPackages()
  })

  ipcMain.handle('marketplace:installPackage', async (_, packageId) => {
    console.log('[Marketplace] Handling installPackage:', packageId)
    const record = await installPackage(String(packageId || '').trim())
    const activation = await activatePackage(record.id)
    return { record, activation }
  })

  ipcMain.handle('marketplace:uninstallPackage', async (_, packageId) => {
    console.log('[Marketplace] Handling uninstallPackage:', packageId)
    return await uninstallPackage(String(packageId || '').trim())
  })

  ipcMain.handle('marketplace:activatePackage', async (_, packageId) => {
    console.log('[Marketplace] Handling activatePackage:', packageId)
    return await activatePackage(String(packageId || '').trim())
  })

  ipcMain.handle('marketplace:activateInstalledPackages', async () => {
    console.log('[Marketplace] Handling activateInstalledPackages')
    return await activateInstalledPackages()
  })

  console.log('[Marketplace] All handlers registered successfully')
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
