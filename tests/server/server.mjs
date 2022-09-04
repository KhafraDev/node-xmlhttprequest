import { createServer } from 'node:http'
import { once } from 'node:events'

const server = createServer((req, res) => {
	res.write('Some more body')
	res.end('body')
}).listen(3000)

await once(server, 'listening')