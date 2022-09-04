import { WPTRunner } from './runner/runner.mjs'
import { Worker } from 'worker_threads'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { once } from 'events'

const workerPath = fileURLToPath(join(import.meta.url, '../../server/server.mjs'))

const worker = new Worker(workerPath)

export const url = process.argv[2] ?? (await once(worker, 'message'))[0]

const runner = new WPTRunner('xhr', url)

runner.run()

await worker.terminate()