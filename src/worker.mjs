import { workerData } from 'worker_threads';

const { shared, port, request } = workerData;

const response = await fetch(request.url, request)

port.postMessage({
  body: await response.arrayBuffer(),
  headers: [...response.headers.entries()],
  status: response.status,
  statusText: response.statusText,
  type: response.type,
  url: response.url
})

const int32 = new Int32Array(shared)
Atomics.notify(int32, 0)