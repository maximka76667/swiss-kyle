import { spawn, execSync, type ChildProcess } from 'node:child_process'
import { createConnection } from 'node:net'
import { resolve } from 'node:path'

let viteProcess: ChildProcess | undefined
let tauriDriverProcess: ChildProcess | undefined

function waitForPort(port: number, host = '127.0.0.1', timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  return new Promise((res, rej) => {
    const tryConnect = () => {
      const socket = createConnection(port, host)
      socket.once('connect', () => {
        socket.destroy()
        res()
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() > deadline) {
          rej(new Error(`vite dev server never opened port ${port}`))
        } else {
          setTimeout(tryConnect, 300)
        }
      })
    }
    tryConnect()
  })
}

export const config: WebdriverIO.Config = {
  hostname: '127.0.0.1',
  port: 4444,
  path: '/',
  specs: ['./specs/**/*.spec.ts'],
  maxInstances: 1,
  capabilities: [
    {
      // @ts-expect-error tauri-driver capability, not part of the standard WebDriver type
      'tauri:options': {
        application: resolve(import.meta.dirname, '../target/debug/app.exe'),
      },
    },
  ],
  logLevel: 'info',
  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },
  reporters: ['spec'],
  onPrepare: async () => {
    viteProcess = spawn('bun', ['dev'], {
      cwd: resolve(import.meta.dirname, '../ui'),
      stdio: 'ignore',
    })
    await waitForPort(5173)

    tauriDriverProcess = spawn('tauri-driver', [], {
      stdio: 'ignore',
    })
    await waitForPort(4444)
  },
  onComplete: () => {
    for (const proc of [viteProcess, tauriDriverProcess]) {
      if (proc?.pid) {
        try {
          execSync(`taskkill /pid ${proc.pid} /T /F`)
        } catch {
          // already dead
        }
      }
    }
  },
}
