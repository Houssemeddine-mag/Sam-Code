const fs = require('fs')
const path = require('path')

const target = path.join(__dirname, '..', 'dist')
try {
  if (fs.existsSync(target)) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      console.log('Removed', target)
    } catch (err) {
      console.warn('Could not remove dist folder (may be in use):', err.message)
    }
  }
} catch (e) {
  console.warn('Failed to check/remove dist folder:', e.message)
}
