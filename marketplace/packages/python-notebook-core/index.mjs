/**
 * Python Notebook Core Extension
 *
 * This extension provides the core notebook kernel functionality
 * for running Python cells with rich output rendering.
 */

export function activate(context) {
  console.log(`[Python Notebook Core] Activated in ${context.packageId}`)
  return {
    name: 'Python Notebook Core',
    version: '1.0.0',
    activated: true
  }
}
