import { createServer } from 'node:http'
import { once } from 'node:events'
import { createReadStream } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'

const resources = fileURLToPath(join(import.meta.url, '../../wpt/resources'))

const server = createServer(async (req, res) => {
  const fullUrl = new URL(req.url, `http://localhost:${server.address().port}`)

  switch (fullUrl.pathname) {
    case '/resources/over-1-meg.txt': {
      res.setHeader('Content-Type', 'text/plain')
      createReadStream(join(resources, 'over-1-meg.txt'))
        .pipe(res)
        .on('close', () => res.end())

      break
    }
    case '/resources/trickle.py': {
      // https://github.com/web-platform-tests/wpt/blob/master/xhr/resources/trickle.py
      const chunk = 'TEST_TRICKLE\n'
      const delay = (parseFloat(fullUrl.searchParams.get('ms')) ?? 500) / 1e3
      const count = parseInt(fullUrl.searchParams.get('count')) ?? 50

      if (fullUrl.searchParams.has('specifylength')) {
        res.setHeader('Content-Length', (count * chunk.length).toString())
      }

      await sleep(delay)
      res.setHeader('Content-Type', 'text/plain')
      await sleep(delay)

      for (let i = 0; i < count; i++) {
        res.write(chunk)
        await sleep(delay)
      }

      res.end()

      break
    }
    case '/resources/well-formed.xml': {
      res.setHeader('Content-Type', 'application/xml')
      createReadStream(join(resources, 'well-formed.xml'))
        .pipe(res)
        .on('close', () => res.end())

      break
    }
    case '/resources/utf16-bom.json': {
      res.setHeader('Content-Type', 'application/json')
      createReadStream(join(resources, 'utf16-bom.json'))
        .pipe(res)
        .on('close', () => res.end())

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
  }
})
