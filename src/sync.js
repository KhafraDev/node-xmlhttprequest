const https = require('https')
const http = require('http')
const { workerData } = require('worker_threads')

const { shared, port, request, timeout } = workerData

;(async () => {
  /** @type {import('http')['request'] & import('https')['request']} */
  const method = request.url.startsWith('https://') ? https.request : http.request

  const url = new URL(request.url)
  
  const req = method({
    href: url.href,
    timeout: timeout === 0 ? undefined : timeout,
    method: request.method,
    headers: Object.fromEntries(request.headersList)
  }).on('response', async (response) => {
    const body = []

    for await (const chunk of response) {
      body.push(chunk)
    }

    port.postMessage({
      body: Buffer.concat(body),
      headers: response.headers,
      statusCode: response.statusCode,
      statusMessage: response.statusMessage
    })

    const int32 = new Int32Array(shared)
    Atomics.notify(int32, 0)
  })

  if (request.body) {
    req.write(request.body)
  }
})()