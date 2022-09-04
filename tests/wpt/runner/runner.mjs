import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { readdirSync, statSync } from 'node:fs'
import { url } from '../../server/server.mjs'

const testPath = fileURLToPath(join(import.meta.url, '../..'))

export class WPTRunner {
	/** @type {string} */
	#folderPath
  
  /** @type {string[]} */
  #files = []

  /** @type {string[]} */
  #initScripts = []

	constructor (folder) {
		this.#folderPath = join(testPath, folder)
    this.#files.push(...WPTRunner.walk(this.#folderPath, () => true))
	}

	static walk (dir, fn) {
    const ini = new Set(readdirSync(dir));
    const files = new Set();

    while (ini.size !== 0) {
        for (const d of ini) {
            const path = resolve(dir, d)
            ini.delete(d); // remove from set
            const stats = statSync(path)

            if (stats.isDirectory()) {
                for (const f of readdirSync(path))
                    ini.add(resolve(path, f))
            } else if (stats.isFile() && fn(d)) {
                files.add(path)
            }
        }
    }

    return [...files]
  }

  run () {
    const workerPath = fileURLToPath(join(import.meta.url, '../worker.mjs'))

    const worker = new Worker(workerPath, {
      workerData: {
        initScripts: this.#initScripts,
        paths: this.#files,
        url
      }
    })

    worker.on('message', (message) => {
      console.log({ message })
    })
  }

  addInitScript (code) {
    this.#initScripts.push(code)
  }
}
