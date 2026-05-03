// live-server/index.mjs
//
// HTML preview server for SamCode.
// Serves files locally and refreshes the browser on change.

import { spawn } from 'child_process'
import { join } from 'path'

export async function activate(context) {
  const { packageRecord, shell } = context

  console.log(`Activating Live Server package: ${packageRecord.name}`)

  let serverProcess = null
  let serverPort = 3000

  return {
    type: 'preview-server',
    id: packageRecord.id,
    name: packageRecord.name,
    version: packageRecord.version,
    runtime: packageRecord.runtime,
    features: packageRecord.features,
    ui: packageRecord.ui,
    activateTime: new Date().toISOString(),
    startServer: async (rootPath) => {
      if (serverProcess) {
        serverProcess.kill()
      }

      return new Promise((resolve, reject) => {
        const serverScript = `
          const express = require('express');
          const chokidar = require('chokidar');
          const WebSocket = require('ws');
          const open = require('open');
          const path = require('path');
          const fs = require('fs');

          const app = express();
          const port = ${serverPort};
          const wss = new WebSocket.Server({ noServer: true });

          app.use(express.static('${rootPath}'));

          const server = app.listen(port, () => {
            console.log('Live Server running on http://localhost:' + port);
          });

          server.on('upgrade', (request, socket, head) => {
            wss.handleUpgrade(request, socket, head, (ws) => {
              wss.emit('connection', ws, request);
            });
          });

          chokidar.watch('${rootPath}').on('change', (filePath) => {
            console.log('File changed:', filePath);
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'reload', path: filePath }));
              }
            });
          });

          setTimeout(() => {
            open('http://localhost:' + port);
          }, 500);
        `

        serverProcess = spawn('node', ['-e', serverScript], {
          cwd: rootPath,
          stdio: ['ignore', 'pipe', 'pipe']
        })

        serverProcess.stdout.on('data', (data) => {
          const output = data.toString()
          if (output.includes('Live Server running')) {
            resolve({
              url: `http://localhost:${serverPort}`,
              pid: serverProcess.pid
            })
          }
        })

        serverProcess.stderr.on('data', (data) => {
          console.error('Live Server error:', data.toString())
        })

        serverProcess.on('error', (error) => {
          reject(new Error(`Failed to start server: ${error.message}`))
        })

        // Timeout after 5 seconds
        setTimeout(() => {
          reject(new Error('Server start timeout'))
        }, 5000)
      })
    },
    stopServer: () => {
      if (serverProcess) {
        serverProcess.kill()
        serverProcess = null
        return Promise.resolve(true)
      }
      return Promise.resolve(false)
    },
    isActive: () => !!serverProcess
  }
}
