import { createServer } from 'node:http'
import { once } from 'events'

const server = createServer((req, res) => {
	res.end('body')
}).listen(0)

await once(server, 'listening')

const url = `http://localhost:${server.address().port}`

export {
  server,
  url
}