import { workerData } from 'worker_threads'

const { shared, port, request, timeout } = workerData

const ac = timeout !== 0 ? new AbortController() : undefined
let timeoutId

if (ac) {
  timeoutId = setTimeout(() => ac.abort(), timeout)
}

try {
  const response = await fetch(request.url, {
    signal: ac?.signal,
    ...request
  })

  if (timeoutId) {
    clearTimeout(timeoutId)
  }

  port.postMessage({
    body: await response.arrayBuffer(),
    headers: [...response.headers.entries()],
    status: response.status,
    statusText: response.statusText,
    type: response.type,
    url: response.url
  })
} catch (err) {
  port.postMessage({ error: err })
} finally {
  const int32 = new Int32Array(shared)
  Atomics.notify(int32, 0)
}
