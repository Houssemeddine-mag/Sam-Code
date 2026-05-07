const fs = require('fs')
const path = require('path')

async function main() {
  try {
    const pngToIco = require('png-to-ico')
    const Jimp = require('jimp')
    const src = path.join(__dirname, '..', 'build', 'icon.png')
    const tmp = path.join(__dirname, '..', 'build', 'icon-256.png')
    const out = path.join(__dirname, '..', 'build', 'icon.ico')

    if (!fs.existsSync(src)) {
      console.warn('Source icon not found at', src)
      return
    }

    // Resize to 256x256 to satisfy png-to-ico requirement
    const image = await Jimp.read(src)
    image.cover(256, 256)
    await image.writeAsync(tmp)

    const buffer = await pngToIco(tmp)
    fs.writeFileSync(out, buffer)
    try {
      fs.unlinkSync(tmp)
    } catch (e) {}
    console.log('Wrote', out)
  } catch (err) {
    console.error('Failed to generate icon:', err)
    process.exit(1)
  }
}

main()
