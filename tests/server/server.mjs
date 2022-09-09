import { createServer } from 'node:http'
import { once } from 'node:events'
import { createReadStream } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const resources = fileURLToPath(join(import.meta.url, '../../wpt/resources'))

const server = createServer((req, res) => {
  switch (req.url) {
    case '/resources/well-formed.xml': {
      res.setHeader('Content-Type', 'application/xml')
      createReadStream(join(resources, 'well-formed.xml')).pipe(res)
      res.end()

      break
    }
    case '/resources/utf16-bom.json': {
      res.setHeader('Content-Type', 'application/json')
      createReadStream(join(resources, 'utf16-bom.json')).pipe(res)
      res.end()

      break
    }
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