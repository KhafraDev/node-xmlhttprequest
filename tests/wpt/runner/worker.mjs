import { workerData, parentPort } from 'node:worker_threads'
import { runInThisContext } from 'node:vm'
import { readFileSync } from 'node:fs'
import { setGlobalOrigin, FormData } from 'undici'
import { XMLHttpRequest } from '../../../index.js'

const { initScripts, paths, url } = workerData

globalThis.XMLHttpRequest = XMLHttpRequest
globalThis.XMLHttpRequestUpload = (new XMLHttpRequest()).upload
globalThis.FormData ??= FormData

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

await import('../resources/testharness.cjs')

// add_*_callback comes from testharness
// stolen from node's wpt test runner
// eslint-disable-next-line no-undef
add_result_callback((result) => {
  parentPort.postMessage({
    type: 'result',
    result: {
      status: result.status,
      name: result.name,
      message: result.message,
      stack: result.stack
    }
  })
})

// eslint-disable-next-line no-undef
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
  // Some files with create global variables.
  // In the future, tests should likely run in
  // a new context -- the decision to run in the
  // same context was based on Node.js' WPT test
  // runner.
  runInThisContext(
    `;(() => {${code}})();`,
    { filename: path }
  )
}
