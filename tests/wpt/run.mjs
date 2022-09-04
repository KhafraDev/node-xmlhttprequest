import { WPTRunner } from './runner/runner.mjs'
import { Worker } from 'worker_threads'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { request } from 'undici'

const workerPath = fileURLToPath(join(import.meta.url, '../../server/server.mjs'))

const worker = new Worker(workerPath)

while (true) {
  const response = await request('http://localhost:3000').catch(() => null)

  if (response !== null) {
    break
  }
}

export const url = 'http://localhost:3000'

const runner = new WPTRunner('xhr', url)

runner.run()

await worker.terminate()