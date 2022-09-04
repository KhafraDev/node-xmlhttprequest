import { createServer } from 'node:http'
import { once } from 'node:events'

const server = createServer((req, res) => {
	switch (req.url) {
		case '/resources/echo-content-type.py': {
			// https://github.com/web-platform-tests/wpt/blob/master/xhr/resources/echo-content-type.py
			res.setHeader('Content-Type', 'text/plain')
			res.statusCode = 200
			res.write(req.headers['content-type'])
			res.end()

      break
		}
		default: {
			res.write('Some more body')
			res.end('body')
		}
	}
}).listen(3000)

await once(server, 'listening')