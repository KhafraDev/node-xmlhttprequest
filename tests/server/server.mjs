import { createServer } from 'node:http'
import { once } from 'node:events'
import { parentPort } from 'node:worker_threads'

const server = createServer((req, res) => {
	res.write('Some more body')
	res.end('body')
}).listen(0)

await once(server, 'listening')

parentPort?.postMessage(`http://localhost:${server.address().port}`) ??
console.log(`http://localhost:${server.address().port}`)