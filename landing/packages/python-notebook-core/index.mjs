// python-notebook-core/index.mjs
//
// Notebook runtime package for SamCode.
// Provides cell-by-cell execution, rich output rendering, and kernel lifecycle management.

export async function activate(context) {
  const { packageRecord, marketplaceRoot, installedRoot } = context

  console.log(`Activating Python Notebook Core package: ${packageRecord.name}`)

  return {
    type: 'notebook-kernel',
    id: packageRecord.id,
    name: packageRecord.name,
    version: packageRecord.version,
    runtime: packageRecord.runtime,
    features: packageRecord.features,
    ui: packageRecord.ui,
    activateTime: new Date().toISOString(),
    executeCell: async (cellSource, cellMetadata = {}) => {
      // In a real implementation, this would interface with a Python kernel
      // For now, simulate basic execution and output
      const executionCount = Date.now() % 1000
      const output = {
        execution_count: executionCount,
        outputs: [
          {
            output_type: 'stream',
            name: 'stdout',
            text: `Executed cell with ${cellSource.length} characters.\n`
          }
        ]
      }

      if (cellSource.includes('plot') || cellSource.includes('chart')) {
        output.outputs.push({
          output_type: 'display_data',
          data: {
            'image/png':
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
          },
          metadata: {}
        })
      }

      return output
    },
    interrupt: () => {
      console.log('Interrupting kernel execution')
      return Promise.resolve(true)
    },
    restart: () => {
      console.log('Restarting kernel')
      return Promise.resolve(true)
    }
  }
}
