import express from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'

const app = express()
const port = Number(process.env.PORT || 10000)
const uploadToken = process.env.UPLOAD_TOKEN || ''
const downloadDir = process.env.DOWNLOAD_DIR || '/data/downloads'

fs.mkdirSync(downloadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, downloadDir),
  filename: (req, file, cb) => {
    const requested = String(req.body.filename || '').trim()
    const safeRequested = requested.replace(/[^a-zA-Z0-9._-]/g, '')
    const originalSafe = String(file.originalname || 'file.bin').replace(/[^a-zA-Z0-9._-]/g, '')
    cb(null, safeRequested || originalSafe)
  }
})

const upload = multer({ storage })

function isAuthorized(req) {
  const token = String(req.headers['x-upload-token'] || req.query.token || '').trim()
  return Boolean(uploadToken) && token === uploadToken
}

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/files', (_req, res) => {
  const files = fs
    .readdirSync(downloadDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)

  res.json({ files })
})

app.get('/download/:fileName', (req, res) => {
  const fileName = String(req.params.fileName || '').replace(/[^a-zA-Z0-9._-]/g, '')
  const filePath = path.join(downloadDir, fileName)

  if (!fileName || !fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' })
    return
  }

  res.download(filePath, fileName)
})

app.post('/upload', upload.single('file'), (req, res) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' })
    return
  }

  res.json({ ok: true, file: req.file.filename })
})

app.listen(port, () => {
  console.log(`Download server listening on port ${port}`)
})
