# node-xmlhttprequest

A spec-compliant version of [XMLHttpRequest](https://xhr.spec.whatwg.org/) that works in NodeJS.

## Install

```
npm i --save node-xmlhttprequest
```

## Quick Start

```js
import { XMLHttpRequest } from 'node-xmlhttprequest'

const xhr = new XMLHttpRequest()
xhr.open('GET', 'https://example.com')

xhr.onreadystatechange = () => {
	if (xhr.readyState === XMLHttpRequest.DONE) {
		const html = xhr.responseText
		const statusCode = xhr.status
		const statusText = xhr.statusText
	}
}

xhr.send()
```

## Synchronous XHR Calls

Synchronous XHR requests work too, without writing files as other packages do. Note that it does use worker threads.

> **Warning**
> This option is only left in for compatibility reasons. It is not recommended for any reason as it *will* block the thread.

```js
import { XMLHttpRequest } from 'node-xmlhttprequest'

const xhr = new XMLHttpRequest()
xhr.open('GET', 'https://example.com', false) // <-- note the false parameter
xhr.send()

assert(xhr.readyState === XMLHttpRequest.DONE)
const html = xhr.responseText
// ...
```

## Relative URLs

> **Note**
> A relative URL is a URL that only contains a path.

Relative URLs do **not** behave the same as the browser. You must use [undici](https://github.com/nodejs/undici) to set a relative url, otherwise an error will be thrown.

```js
import { XMLHttpRequest } from 'node-xmlhttprequest'
import { setGlobalOrigin } from 'undici'

setGlobalOrigin('https://example.com')

const xhr = new XMLHttpRequest()
xhr.open('GET', '/api/ping')

xhr.onreadystatechange = () => {
	if (xhr.readyState === XMLHttpRequest.DONE) {
		xhr.responseURL // https://example.com/api/ping
	}
}

xhr.send()
```