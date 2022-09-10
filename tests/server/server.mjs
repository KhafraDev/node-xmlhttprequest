import { createServer } from 'node:http'
import { once } from 'node:events'
import { createReadStream } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import process from 'node:process'

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
}).listen(0)

await once(server, 'listening')

const send = (message) => {
  if (typeof process.send === 'function') {
    process.send(message)
  }
}

send({ server: `http://localhost:${server.address().port}` })

process.on('message', (message) => {
  if (message === 'shutdown') {
    server.close((err) => err ? send(err) : send({ message: 'shutdown' }))
    return
  }
})