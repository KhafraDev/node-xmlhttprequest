import { workerData, parentPort, isMainThread } from 'node:worker_threads'
import { runInThisContext } from 'node:vm'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { setGlobalOrigin } from 'undici'
import { XMLHttpRequest } from '../../../index.js'

const { initScripts, paths, url } = workerData

if (typeof require === 'undefined') {
  globalThis.require = createRequire(import.meta.url) 
}

globalThis.XMLHttpRequest = XMLHttpRequest
globalThis.XMLHttpRequestUpload = (new XMLHttpRequest()).upload
globalThis.FormData ??= require('undici').FormData

// self is required by testharness
// GLOBAL is required by self
runInThisContext(`
  globalThis.self = globalThis
  globalThis.GLOBAL = {
    isWorker () {
      return false
    },
    isShadowRealm () {
      return false
    }
  }
`)

require('../resources/testharness.cjs')

// add_*_callback comes from testharness
// stolen from node's wpt test runner
add_result_callback((result) => {
  parentPort.postMessage({
    type: 'result',
    result: {
      status: result.status,
      name: result.name,
      message: result.message,
      stack: result.stack,
    }
  })
})

add_completion_callback((_, status) => {
  parentPort.postMessage({
    type: 'completion',
    status
  })
})

setGlobalOrigin(url)

for (const initScript of initScripts) {
  runInThisContext(initScript)
}

for (const path of paths) {
  const code = readFileSync(path, 'utf-8')
  runInThisContext(
    `;(() => {${code}})();`,
    { filename: path 
  })
}