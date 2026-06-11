/**
 * PDF Viewer Extension — Main Process Entry
 *
 * This extension provides PDF file viewing support in Sam Code.
 * The IPC handler (fs:readFileAsArrayBuffer) is registered by the
 * main process; this module serves as the extension manifest entry
 * for marketplace installation and activation tracking.
 */

/**
 * Activate the PDF viewer extension.
 * The fs:readFileAsArrayBuffer handler is already registered in main/index.js.
 * This function logs activation for marketplace status tracking.
 *
 * @param {Object} context — Electron app, shell, marketplace info, etc.
 */
export async function activate(context) {
  console.log('[pdf-viewer] Extension activated', context?.packageId || '')

  return {
    name: 'pdf-viewer',
    version: '1.0.0',
    features: ['file-viewer'],
    fileExtensions: ['.pdf']
  }
}

/**
 * Deactivate the extension.
 */
export async function deactivate() {
  console.log('[pdf-viewer] Extension deactivated')
}
