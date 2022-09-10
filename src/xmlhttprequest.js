'use strict'

const {
  kUploadObject,
  kTimeout,
  kResponseType,
  kFetchController,
  kSendFlag,
  kUploadListenerFlag,
  kRequestMethod,
  kRequestURL,
  kSychronousFlag,
  kRequestHeaders,
  kResponse,
  kReceivedBytes,
  kResponseObject,
  kState,
  kCrossOriginCredentials,
  kRequestBody,
  kUploadCompleteFlag,
  kTimedOutFlag,
  kOverrideMimeType,
  kLengthComputable,
  kLoaded,
  kTotal
} = require('./symbols.js')
const {
  isValidHeaderValue,
  serializeMimeType,
  extractLengthFromHeadersList,
  getTextResponse,
  finalMimeType,
  utf8Decode
} = require('./util.js')
const { isValidHTTPToken, normalizeMethod } = require('undici/lib/fetch/util.js')
const { forbiddenMethods, DOMException } = require('undici/lib/fetch/constants.js')
const { safelyExtractBody } = require('undici/lib/fetch/body.js')
const { Fetch, finalizeAndReportTiming, fetching } = require('undici/lib/fetch/index.js')
const { HeadersList } = require('undici/lib/fetch/headers.js')
const { makeNetworkError, makeResponse } = require('undici/lib/fetch/response.js')
const { parseMIMEType } = require('undici/lib/fetch/dataURL.js')
const { makeRequest } = require('undici/lib/fetch/request.js')
const { webidl } = require('undici/lib/fetch/webidl.js')
const { getGlobalDispatcher, getGlobalOrigin } = require('undici')
const assert = require('assert')
const { Blob } = require('buffer')
const { toUSVString } = require('util')
const { Worker, MessageChannel, receiveMessageOnPort } = require('worker_threads')
const { join } = require('path')

const XMLHttpRequestReadyState = {
  UNSENT: 0,
  OPENED: 1,
  HEADERS_RECEIVED: 2,
  LOADING: 3,
  DONE: 4
}

// https://xhr.spec.whatwg.org/#xmlhttprequestupload
class XMLHttpRequestUpload extends EventTarget {}

// https://xhr.spec.whatwg.org/#progressevent
class ProgressEvent extends Event {
  constructor (type, eventInitDict) {
    super(type, eventInitDict)

    this[kLengthComputable] = false
    this[kLoaded] = 0
    this[kTotal] = 0
  }

  get lengthComputable () {
    return this[kLengthComputable]
  }

  get loaded () {
    return this[kLoaded]
  }

  get total () {
    return this[kTotal]
  }
}

class XMLHttpRequest extends XMLHttpRequestUpload {
  // https://xhr.spec.whatwg.org/#constructors
  constructor () {
    super()

    // The new XMLHttpRequest() constructor steps are:

    // 1. Set this’s upload object to a new XMLHttpRequestUpload object.
    this[kUploadObject] = new XMLHttpRequestUpload()

    this[kUploadObject] = new XMLHttpRequestUpload()
    this[kState] = 'unsent'
    this[kSendFlag] = undefined
    this[kTimeout] = 0
    this[kCrossOriginCredentials] = false
    this[kRequestMethod] = undefined
    this[kRequestURL] = undefined
    this[kRequestHeaders] = new HeadersList()
    this[kRequestBody] = null
    this[kSychronousFlag] = undefined
    this[kUploadCompleteFlag] = undefined
    this[kUploadListenerFlag] = undefined
    this[kTimedOutFlag] = undefined
    this[kResponse] = makeNetworkError()
    this[kReceivedBytes] = []
    this[kResponseType] = ''
    this[kResponseObject] = null
    this[kFetchController] = new Fetch(getGlobalDispatcher())
    this[kOverrideMimeType] = null
  }

  // https://xhr.spec.whatwg.org/#the-open()-method
  // The open(method, url) and open(method, url, async, username, password)
  // method steps are:
  open (method, url, async = true, username = null, password = null) {
    if (!(this instanceof XMLHttpRequest)) {
      throw new TypeError('illegal invocation')
    }

    method = webidl.converters.ByteString(method)
    url = webidl.converters.USVString(url)
    async = webidl.converters.boolean(async)
    username = username !== null ? webidl.converters.USVString(username) : null
    password = password !== null ? webidl.converters.USVString(username) : null

    // 1. If this’s relevant global object is a Window object and its
    //    associated Document is not fully active, then throw an
    //    "InvalidStateError" DOMException.

    // 2. If method is not a method, then throw a "SyntaxError" DOMException.
    if (!isValidHTTPToken(method)) {
      throw new DOMException('argument 1 is not a method', 'SyntaxError')
    }

    // 3. If method is a forbidden method, then throw a "SecurityError"
    //    DOMException.
    if (forbiddenMethods.indexOf(method.toUpperCase()) !== -1) {
      throw new DOMException('method is forbidden', 'SecurityError')
    }

    // 4. Normalize method.
    method = normalizeMethod(method)

    // 5. Let parsedURL be the result of parsing url with this’s relevant
    //    settings object’s API base URL and this’s relevant settings object’s
    //    API URL character encoding.
    let parsedURL
    try {
      parsedURL = new URL(url, getGlobalOrigin())
    } catch {
      // 6. If parsedURL is failure, then throw a "SyntaxError" DOMException.
      throw new DOMException('url is not a url', 'SyntaxError')
    }

    // 7. If the async argument is omitted, set async to true, and set username
    //    and password to null.
    // Note: this is done already

    // 8. If parsedURL’s host is non-null, then:
    if (parsedURL.host.length > 0) {
      // 1. If the username argument is not null, set the username given
      //    parsedURL and username.
      if (username !== null) {
        parsedURL.username = username
      }

      // 2. If the password argument is not null, set the password given
      //    parsedURL and password.
      if (password !== null) {
        parsedURL.password = password
      }
    }

    // 9. If async is false, the current global object is a Window object, and
    //    either this’s timeout is not 0 or this’s response type is not the
    //    empty string, then throw an "InvalidAccessError" DOMException.
    if (
      async === false &&
      (this[kTimeout] !== 0 || this[kResponseType] !== '')
    ) {
      throw new DOMException('invalid access', 'InvalidAccessError')
    }

    // 10. Terminate this’s fetch controller.
    this[kFetchController].terminate('terminated')

    // 11. Set variables associated with the object as follows:
    // - Unset this’s send() flag.
    this[kSendFlag] = undefined
    // - Unset this’s upload listener flag.
    this[kUploadListenerFlag] = undefined
    // - Set this’s request method to method.
    this[kRequestMethod] = method
    // - Set this’s request URL to parsedURL.
    this[kRequestURL] = parsedURL
    // - Set this’s synchronous flag if async is false; otherwise unset this’s
    //   synchronous flag.
    this[kSychronousFlag] = async === false ? true : undefined
    // - Empty this’s author request headers.
    this[kRequestHeaders].clear()
    // - Set this’s response to a network error.
    this[kResponse] = makeNetworkError()
    // - Set this’s received bytes to the empty byte sequence.
    this[kReceivedBytes] = []
    // - Set this’s response object to null.
    this[kResponseObject] = null

    // 12. If this’s state is not opened, then:
    if (this[kState] !== 'opened') {
      // 1. Set this’s state to opened.
      this[kState] = 'opened'

      // 2. Fire an event named readystatechange at this.
      fireEvent(this, 'readystatechange')
    }
  }

  // https://xhr.spec.whatwg.org/#the-setrequestheader()-method
  // The setRequestHeader(name, value) method must run these steps:
  setRequestHeader (name, value) {
    if (!(this instanceof XMLHttpRequest)) {
      throw new TypeError('illegal invocation')
    }

    name = webidl.converters.ByteString(name)
    value = webidl.converters.ByteString(value)

    // 1. If this’s state is not opened, then throw an "InvalidStateError"
    //    DOMException.
    if (this[kState] !== 'opened') {
      throw new DOMException('invalid state', 'InvalidStateError')
    }

    // 2. If this’s send() flag is set, then throw an "InvalidStateError"
    //    DOMException.
    if (this[kSendFlag] !== undefined) {
      throw new DOMException('invalid state', 'InvalidStateError')
    }

    // 3. Normalize value.
    value = value.trim()

    // 4. If name is not a header name or value is not a header value, then
    //    throw a "SyntaxError" DOMException.
    if (!isValidHTTPToken(name) || !isValidHeaderValue(value)) {
      throw new DOMException('invalid header name/value', 'SyntaxError')
    }

    // 5. If name is a forbidden header name, then return.
    // Note: undici doesn't implement forbidden headers

    // 6. Combine (name, value) in this’s author request headers.
    this[kRequestHeaders].append(name, value)
  }

  // https://xhr.spec.whatwg.org/#the-timeout-attribute
  get timeout () {
    if (!(this instanceof XMLHttpRequest)) {
      throw new TypeError('illegal invocation')
    }

    // The timeout getter steps are to return this’s timeout.
    return this[kTimeout]
  }

  set timeout (value) {
    if (!(this instanceof XMLHttpRequest)) {
      throw new TypeError('illegal invocation')
    }

    // The timeout setter steps are:

    // 1. If the current global object is a Window object and this’s
    //    synchronous flag is set, then throw an "InvalidAccessError"
    //    DOMException.
    if (this[kSychronousFlag] !== undefined) {
      throw new DOMException('invalid access', 'InvalidAccessError')
    }

    // Note: these steps are undocumented.
    value = Math.floor(Number(value))

    if (!Number.isSafeInteger(value)) { // catch NaN, Infinity, -Infinity, etc.
      value = 0
    }

    this[kTimeout] = value
  }

  // https://xhr.spec.whatwg.org/#the-withcredentials-attribute
  get withCredentials () {
    if (!(this instanceof XMLHttpRequest)) {
      throw new TypeError('illegal invocation')
    }

    // The withCredentials getter steps are to return this’s cross-origin
    // credentials
    return this[kCrossOriginCredentials]
  }

  set withCredentials (value) {
    if (!(this instanceof XMLHttpRequest)) {
      throw new TypeError('illegal invocation')
    }

    // The withCredentials setter steps are:

    // 1. If this’s state is not unsent or opened, then throw an
    //    "InvalidStateError" DOMException.
    if (this[kState] !== 'unsent' && this[kState] !== 'opened') {
      throw new DOMException('invalid state', 'InvalidStateError')
    }

    // 2. If this’s send() flag is set, then throw an "InvalidStateError"
    //    DOMException.
    if (this[kSendFlag] !== undefined) {
      throw new DOMException('invalid state', 'InvalidStateError')
    }

    // 3. Set this’s cross-origin credentials to the given value.
    this[kCrossOriginCredentials] = !!value
  }

  // https://xhr.spec.whatwg.org/#the-upload-attribute
  get upload () {
    if (!(this instanceof XMLHttpRequest)) {
      throw new TypeError('illegal invocation')
    }

    // The upload getter steps are to return this’s upload object.
    return this[kUploadObject]
  }

  // https://xhr.spec.whatwg.org/#the-send()-method
  send (body = null) {
    if (!(this instanceof XMLHttpRequest)) {
      throw new TypeError('illegal invocation')
    }

    // https://github.com/nodejs/undici/blob/9ab49672054ef3be88d2412bc7da79ba8554bcd0/lib/fetch/response.js#L516
    body = body === null ? null : webidl.converters.XMLHttpRequestBodyInit(body)

    // 1. If this’s state is not opened, then throw an "InvalidStateError"
    //    DOMException.
    if (this[kState] !== 'opened') {
      throw new DOMException('invalid state', 'InvalidStateError')
    }

    // 2. If this’s send() flag is set, then throw an "InvalidStateError"
    //    DOMException.
    if (this[kSendFlag] !== undefined) {
      throw new DOMException('invalid state', 'InvalidStateError')
    }

    // 3. If this’s request method is `GET` or `HEAD`, then set body to null.
    if (this[kRequestMethod] === 'GET' || this[kRequestMethod] === 'HEAD') {
      body = null
    }

    // 4. If body is not null, then:
    if (body !== null) {
      // 1. Let extractedContentType be null.
      let extractedContentType = null

      // 2. If body is a Document, then set this’s request body to body,
      //    serialized, converted, and UTF-8 encoded.

      // 3. Otherwise:

      // 1a. Let bodyWithType be the result of safely extracting body.
      const bodyWithType = safelyExtractBody(body)

      // 2a. Set this’s request body to bodyWithType’s body.
      this[kRequestBody] = bodyWithType[0]

      // 3a. Set extractedContentType to bodyWithType’s type.
      extractedContentType = bodyWithType[1]

      // 4. Let originalAuthorContentType be the result of getting `Content-Type`
      //    from this’s author request headers.
      const originalAuthorContentType = this[kRequestHeaders].get('content-type')

      // 5. If originalAuthorContentType is non-null, then:
      if (originalAuthorContentType !== null) {
        // 6. If body is a Document or a USVString, then:
        if (typeof body === 'string') {
          // 1. Let contentTypeRecord be the result of parsing originalAuthorContentType.
          const contentTypeRecord = parseMIMEType(originalAuthorContentType)

          // 2. If contentTypeRecord is not failure, contentTypeRecord’s parameters["charset"]
          //    exists, and parameters["charset"] is not an ASCII case-insensitive match for
          //    "UTF-8", then:
          if (
            contentTypeRecord !== 'failure' &&
            contentTypeRecord.parameters.has('charset') &&
            contentTypeRecord.parameters.get('charset').toLowerCase() !== 'utf-8'
          ) {
            // 1. Set contentTypeRecord’s parameters["charset"] to "UTF-8".
            contentTypeRecord.parameters.set('charset', 'UTF-8')

            // 2. Let newContentTypeSerialized be the result of serializing contentTypeRecord.
            const newContentTypeSerialized = serializeMimeType(contentTypeRecord)

            // 3. Set (`Content-Type`, newContentTypeSerialized) in this’s author request headers.
            this[kRequestHeaders].set('content-type', newContentTypeSerialized)
          }
        }
      } else {
        // 6. Otherwise:

        // 1. If body is an HTML document, then set (`Content-Type`,
        //    `text/html;charset=UTF-8`) in this’s author request headers.

        // 2. Otherwise, if body is an XML document, set (`Content-Type`,
        //    `application/xml;charset=UTF-8`) in this’s author request headers.

        // 3. Otherwise, if extractedContentType is not null, set (`Content-Type`,
        //    extractedContentType) in this’s author request headers.
        if (extractedContentType !== null) {
          this[kRequestHeaders].set('content-type', extractedContentType)
        }
      }
    }

    // 5. If one or more event listeners are registered on this’s upload
    //    object, then set this’s upload listener flag.
    // TODO: can we check this?
    this[kUploadListenerFlag] = true

    // 6. Let req be a new request, initialized as follows:
    const req = makeRequest({
      // This’s request method.
      method: this[kRequestMethod],
      // This’s request URL.
      urlList: [this[kRequestURL]],
      // This’s author request headers.
      headersList: this[kRequestHeaders],
      // unsafe-request flag
      unsafeRequest: true,
      // This’s request body.
      body: this[kRequestBody],
      // This’s relevant settings object.
      // mode "cors".
      mode: 'cors',
      // use-CORS-preflight flag Set if this’s upload listener flag is set
      useCORSPreflightFlag: this[kUploadListenerFlag] !== undefined,
      // credentials mode
      // If this’s cross-origin credentials is true, then "include"; otherwise "same-origin".
      credentials: this[kCrossOriginCredentials] ? 'include' : 'same-origin',
      // use-URL-credentials flag Set if this’s request URL includes credentials.
      useURLCredentials: this[kRequestURL].password || this[kRequestURL].username
    })

    // 7. Unset this’s upload complete flag.
    this[kUploadCompleteFlag] = undefined

    // 8. Unset this’s timed out flag.
    this[kTimedOutFlag] = undefined

    // 9. If req’s body is null, then set this’s upload complete flag.
    if (req.body == null) {
      this[kUploadCompleteFlag] = true
    }

    // 10. Set this’s send() flag.
    this[kSendFlag] = true

    // 11. If this’s synchronous flag is unset, then:
    if (!this[kSychronousFlag]) {
      // 1. Fire a progress event named loadstart at this with 0 and 0.
      fireProgressEvent('loadstart', this, 0, 0)

      // 2. Let requestBodyTransmitted be 0.
      let requestBodyTransmitted = 0

      // 3. Let requestBodyLength be req’s body’s length, if req’s body is
      //    non-null; otherwise 0.
      const requestBodyLength = req.body != null ? req.body.length : 0

      // 4. Assert: requestBodyLength is an integer.
      assert(Number.isInteger(requestBodyLength))

      // 5. If this’s upload complete flag is unset and this’s upload
      //    listener flag is set, then fire a progress event named loadstart
      //    at this’s upload object with requestBodyTransmitted and
      //    requestBodyLength.
      if (this[kUploadCompleteFlag] === undefined && this[kUploadListenerFlag]) {
        fireProgressEvent(
          'loadstart',
          this[kUploadObject],
          requestBodyTransmitted,
          requestBodyLength
        )
      }

      // 6. If this’s state is not opened or this’s send() flag is unset, then return.
      if (this[kState] !== 'opened' || this[kSendFlag] === undefined) {
        return
      }

      // 7. Let processRequestBodyChunkLength, given a bytesLength, be these steps:
      let lastInvoked
      const processRequestBodyChunkLength = (bytesLength) => {
        // 1. Increase requestBodyTransmitted by bytesLength.
        requestBodyTransmitted += bytesLength

        // 2. If not roughly 50ms have passed since these steps were last invoked,
        //    then return.
        if (lastInvoked !== undefined && (Date.now() - lastInvoked) < 50) {
          return
        }

        lastInvoked = Date.now()

        // 3. If this’s upload listener flag is set, then fire a progress event name
        //    progress at this’s upload object with requestBodyTransmitted and
        //    requestBodyLength.
        if (this[kUploadListenerFlag]) {
          fireProgressEvent(
            'progress',
            this[kUploadObject],
            requestBodyTransmitted,
            requestBodyLength
          )
        }
      }

      // 8. Let processRequestEndOfBody be these steps:
      const processRequestEndOfBody = () => {
        // 1. Set this’s upload complete flag.
        this[kUploadCompleteFlag] = true

        // 2. If this’s upload listener flag is unset, then return.
        if (this[kUploadListenerFlag] === undefined) {
          return
        }

        // 3. Fire a progress event named progress at this’s upload object with
        //    requestBodyTransmitted and requestBodyLength.
        fireProgressEvent(
          'progress',
          this[kUploadObject],
          requestBodyTransmitted,
          requestBodyLength
        )

        // 4. Fire a progress event named load at this’s upload object with
        //    requestBodyTransmitted and requestBodyLength.
        fireProgressEvent(
          'load',
          this[kUploadObject],
          requestBodyTransmitted,
          requestBodyLength
        )

        // 5. Fire a progress event named loadend at this’s upload object with
        //    requestBodyTransmitted and requestBodyLength.
        fireProgressEvent(
          'loadend',
          this[kUploadObject],
          requestBodyTransmitted,
          requestBodyLength
        )
      }

      // 9. Let processResponse, given a response, be these steps:
      const processResponse = (response) => {
        // 1. Set this’s response to response.
        this[kResponse] = response

        // 2. Handle errors for this.
        handleErrors(this)

        // 3. If this’s response is a network error, then return.
        if (this[kResponse].type === 'error') {
          return
        }

        // 4. Set this’s state to headers received.
        this[kState] = 'headers received'

        // 5. Fire an event named readystatechange at this.
        fireEvent(this, 'readystatechange')

        // 6. If this’s state is not headers received, then return.
        if (this[kState] !== 'headers received') {
          return
        }

        // 7. If this’s response’s body is null, then run handle response
        //    end-of-body for this and return.
        if (this[kResponse].body == null) {
          handleResponseEndOfBody(this)
          return
        }

        // 8. Let length be the result of extracting a length from this’s
        //    response’s header list.
        let length = extractLengthFromHeadersList(this[kResponse].headersList)

        // 9. If length is not an integer, then set it to 0.
        if (length === 'failure' || !Number.isSafeInteger(length)) {
          length = 0
        }

        // 10. Let processBodyChunk given bytes be these steps:
        let lastInvoked
        const processBodyChunk = (bytes) => {
          // 1. Append bytes to this’s received bytes.
          this[kReceivedBytes].push(...bytes)

          // 2. If not roughly 50ms have passed since these steps were last
          //    invoked, then return.
          if (lastInvoked !== undefined && (Date.now() - lastInvoked) < 50) {
            return
          }

          // 3. If this’s state is headers received, then set this’s state to loading.
          if (this[kState] === 'headers received') {
            this[kState] = 'loading'
          }

          // 4. Fire an event named readystatechange at this.
          fireEvent(this, 'readystatechange')

          // 5. Fire a progress event named progress at this with this’s received
          //    bytes’s length and length.
          fireProgressEvent('progress', this, this[kReceivedBytes].length, length)
        }

        // 11. Let processEndOfBody be this step: run handle response
        //     end-of-body for this.
        const processEndOfBody = () => handleResponseEndOfBody(this)

        // 12. Let processBodyError be these steps:
        const processBodyError = () => {
          // 1. Set this’s response to a network error.
          this[kResponse] = makeNetworkError()

          // 2. Run handle errors for this.
          handleErrors(this)
        }

        // 13. Incrementally read this’s response’s body, given processBodyChunk,
        //     processEndOfBody, processBodyError, and this’s relevant global object.
        (async () => {
          try {
            /** @type {import('stream/web').ReadableStream<Uint8Array>} */
            const stream = this[kResponse].body.stream
            const reader = stream.getReader()

            while (true) {
              const { done, value } = await reader.read()

              if (done) {
                break
              }

              processBodyChunk(value)
            }

            processEndOfBody()
          } catch (err) {
            processBodyError(err)
          }
        })()
      }

      // 10. Set this’s fetch controller to the result of fetching req with
      //     processRequestBodyChunkLength set to processRequestBodyChunkLength,
      //     processRequestEndOfBody set to processRequestEndOfBody, and
      //     processResponse set to processResponse.
      this[kFetchController] = fetching({
        request: req,
        processRequestBodyChunkLength,
        processRequestEndOfBody,
        processResponse,
        dispatcher: getGlobalDispatcher()
      })

      // 11. Let now be the present time.
      const now = Date.now()

      // 12. Run these steps in parallel:

      // 1a. Wait until either req’s done flag is set or this’s timeout is not 0
      //     and this’s timeout milliseconds have passed since now.
      // 2a. If req’s done flag is unset, then set this’s timed out flag and
      //     terminate this’s fetch controller.

      let timeout = null
      const interval = setInterval(() => {
        if (req.done || (this[kTimeout] !== 0 && Date.now() - now < this[kTimeout])) {
          clearInterval(interval)
          clearTimeout(timeout)
        }
      }, 10)

      if (this[kTimeout] !== 0) {
        timeout = setTimeout(() => {
          if (!req.done) {
            this[kTimedOutFlag] = true
            this[kFetchController].abort()

            clearInterval(interval)
          }
        }, this[kTimeout])
      }
    } else {
      // 12. Otherwise, if this’s synchronous flag is set:

      // 1. Let processedResponse be false.

      // 2. Let processResponseConsumeBody, given a response and
      //    nullOrFailureOrBytes, be these steps:

      // 3. Set this’s fetch controller to the result of fetching req with
      //    processResponseConsumeBody set to processResponseConsumeBody and
      //    useParallelQueue set to true.

      // 4. Let now be the present time.

      // 5. Pause until either processedResponse is true or this’s timeout
      //    is not 0 and this’s timeout milliseconds have passed since now.

      // 6. If processedResponse is false, then set this’s timed out flag and
      //    terminate this’s fetch controller.

      // 7. Run handle response end-of-body for this.

      const shared = new SharedArrayBuffer(4)
      const { port1: localPort, port2: workerPort } = new MessageChannel()

      const path = join(__dirname, 'worker.mjs')

      const w = new Worker(path, {
        workerData: {
          shared,
          port: workerPort,
          request: {
            body: req.body,
            url: req.url.toString(),
            method: req.method,
            headers: [...req.headersList.entries()],
            mode: req.mode,
            credentials: req.credentials
          },
          timeout: this[kTimeout]
        },
        transferList: [workerPort]
      })

      const int32 = new Int32Array(shared)
      Atomics.wait(int32, 0, 0)

      const { message } = receiveMessageOnPort(localPort)

      if (!('error' in message)) {
        const { body, status, statusText, headers, type, url } = message

        this[kResponse] = makeResponse({
          status,
          statusText,
          type,
          urlList: [new URL(url)],
          headersList: headers,
          body: {
            source: new Uint8Array(body)
          }
        })

        if (body) {
          this[kReceivedBytes].push(...new Uint8Array(body))
        }
      } else {
        this[kResponse] = makeNetworkError(message.error)
      }

      w.terminate()

      handleResponseEndOfBody(this)
    }
  }

  // https://xhr.spec.whatwg.org/#the-abort()-method
  abort () {
    if (!(this instanceof XMLHttpRequest)) {
      throw new TypeError('illegal invocation')
    }

    // 1. Abort this’s fetch controller.
    this[kFetchController].abort()

    // 2. If this’s state is opened with this’s send() flag set,
    //    headers received, or loading, then run the request error
    //    steps for this and abort.
    if (
      (this[kState] === 'opened' && this[kSendFlag]) ||
      this[kState] === 'headers received' ||
      this[kState] === 'loading'
    ) {
      requestErrorSteps(this, new ProgressEvent('abort'))
    }

    // 3. If this’s state is done, then set this’s state to unsent
    //    and this’s response to a network error.
    if (this[kState] === 'done') {
      this[kState] = 'unsent'
      this[kResponse] = makeNetworkError()
    }
  }

  // https://xhr.spec.whatwg.org/#the-responseurl-attribute
  get responseURL () {
    if (!(this instanceof XMLHttpRequest)) {
      throw new TypeError('illegal invocation')
    }

    // The responseURL getter steps are to return the empty string
    // if this’s response’s URL is null; otherwise its serialization
    // with the exclude fragment flag set.
    if (this[kResponse].url === null) {
      return ''
    }

    const url = new URL(this[kResponse].url)
    url.hash = ''
    return url.toString()
  }

  // https://xhr.spec.whatwg.org/#the-status-attribute
  get status () {
    if (!(this instanceof XMLHttpRequest)) {
      throw new TypeError('illegal invocation')
    }

    // The status getter steps are to return this’s response’s status.
    return this[kResponse].status
  }

  // https://xhr.spec.whatwg.org/#the-statustext-attribute
  get statusText () {
    if (!(this instanceof XMLHttpRequest)) {
      throw new TypeError('illegal invocation')
    }

    // The statusText getter steps are to return this’s response’s status message.
    return this[kResponse].statusText
  }

  // https://xhr.spec.whatwg.org/#the-getresponseheader()-method
  getResponseHeader (name) {
    if (!(this instanceof XMLHttpRequest)) {
      throw new TypeError('illegal invocation')
    }

    name = webidl.converters.ByteString(name)

    // The getResponseHeader(name) method steps are to return the result of
    // getting name from this’s response’s header list.
    return this[kRequestHeaders].get(toUSVString(name))
  }

  // https://xhr.spec.whatwg.org/#the-getallresponseheaders()-method
  getAllResponseHeaders () {
    if (!(this instanceof XMLHttpRequest)) {
      throw new TypeError('illegal invocation')
    }

    // 1. Let output be an empty byte sequence.
    let output = ''

    // 2. Let initialHeaders be the result of running sort and
    //    combine with this’s response’s header list.

    // 3. Let headers be the result of sorting initialHeaders in
    //    ascending order, with a being less than b if a’s name
    //    is legacy-uppercased-byte less than b’s name.
    // TODO

    // 4. For each header in headers, append header’s name, followed
    //    by a 0x3A 0x20 byte pair, followed by header’s value,
    //    followed by a 0x0D 0x0A byte pair, to output.
    for (const [name, value] of this[kRequestHeaders]) {
      output += `${name}: ${value}\r\n`
    }

    return output
  }

  // https://xhr.spec.whatwg.org/#the-overridemimetype()-method
  overrideMimeType (mime) {
    if (!(this instanceof XMLHttpRequest)) {
      throw new TypeError('illegal invocation')
    }

    mime = webidl.converters.DOMString(mime)

    // 1. If this’s state is loading or done, then throw an
    //    "InvalidStateError" DOMException.
    if (this[kState] === 'loading' || this[kState] === 'done') {
      throw new DOMException('invalid state', 'InvalidStateError')
    }

    // 2. Set this’s override MIME type to the result of parsing mime.
    this[kOverrideMimeType] = parseMIMEType(mime)

    // 3. If this’s override MIME type is failure, then set this’s
    //    override MIME type to application/octet-stream.
    if (this[kOverrideMimeType] === 'failure') {
      this[kOverrideMimeType] = 'application/octet-stream'
    }
  }

  // https://xhr.spec.whatwg.org/#the-responsetype-attribute
  get responseType () {
    if (!(this instanceof XMLHttpRequest)) {
      throw new TypeError('illegal invocation')
    }

    // The responseType getter steps are to return this’s response type.
    return this[kResponseType]
  }

  set responseType (value) {
    if (!(this instanceof XMLHttpRequest)) {
      throw new TypeError('illegal invocation')
    }

    const old = value
    value = responseTypeEnum(value)

    // This is referred to as an "ignored" type in WPTs. The spec
    // doesn't mention it. At all.
    if (old !== value) {
      this[kResponseType] = ''
      return
    }

    // The responseType setter steps are:

    // 1. If the current global object is not a Window object and the
    //    given value is "document", then return.

    // 2. If this’s state is loading or done, then throw an
    //    "InvalidStateError" DOMException.
    if (this[kState] === 'done' || this[kState] === 'loading') {
      throw new DOMException('invalid state', 'InvalidStateError')
    }

    // 3. If the current global object is a Window object and this’s
    //    synchronous flag is set, then throw an "InvalidAccessError"
    //    DOMException.
    if (this[kSychronousFlag]) {
      throw new DOMException('invalid access', 'InvalidAccessError')
    }

    // 4. Set this’s response type to the given value.
    this[kResponseType] = value
  }

  // https://xhr.spec.whatwg.org/#the-response-attribute
  get response () {
    if (!(this instanceof XMLHttpRequest)) {
      throw new TypeError('illegal invocation')
    }

    // The response getter steps are:

    // 1. If this’s response type is the empty string or "text", then:
    if (this[kResponseType] === '' || this[kResponseType] === 'text') {
      // 1. If this’s state is not loading or done, then return the
      //    empty string.
      if (this[kState] !== 'loading' && this[kState] !== 'done') {
        return ''
      }

      // 2. Return the result of getting a text response for this.
      return getTextResponse(this)
    }

    // 2. If this’s state is not done, then return null.
    if (this[kState] !== 'done') {
      return null
    }

    // 3. If this’s response object is failure, then return null.
    if (this[kResponseObject] === 'failure') {
      return null
    }

    // 4. If this’s response object is non-null, then return it.
    if (this[kResponseObject] !== null) {
      return this[kResponseObject]
    }

    // 5. If this’s response type is "arraybuffer", then set this’s
    //    response object to a new ArrayBuffer object representing
    //    this’s received bytes. If this throws an exception, then
    //    set this’s response object to failure and return null.
    if (this[kResponseType] === 'arraybuffer') {
      try {
        this[kResponseObject] = new Uint8Array(this[kReceivedBytes]).buffer
      } catch {
        this[kResponseObject] = 'failure'
        return null
      }
    } else if (this[kResponseType] === 'blob') {
      // 6. Otherwise, if this’s response type is "blob", set this’s
      //    response object to a new Blob object representing this’s
      //    received bytes with type set to the result of get a final
      //    MIME type for this.
      this[kResponseObject] = new Blob(
        this[kReceivedBytes],
        { type: serializeMimeType(finalMimeType(this)) }
      )
    } else if (this[kResponseObject] === 'document') {
      // 7. Otherwise, if this’s response type is "document", set a
      //    document response for this.
      // TODO: should this throw an error?
    } else {
      // 8. Otherwise:

      // 1. Assert: this’s response type is "json".
      assert(this[kResponseType] === 'json')

      // 2. If this’s response’s body is null, then return null.
      if (this[kResponse].body == null) {
        return null
      }

      // 3. Let jsonObject be the result of running parse JSON from
      //    bytes on this’s received bytes. If that threw an exception,
      //    then return null.
      let jsonObject
      try {
        jsonObject = utf8Decode(new Uint8Array(this[kReceivedBytes]))
      } catch {
        return null
      }

      // 4. Set this’s response object to jsonObject.
      this[kResponseObject] = jsonObject
    }

    // 9. Return this’s response object.
    return this[kResponseObject]
  }

  // https://xhr.spec.whatwg.org/#the-responsetext-attribute
  get responseText () {
    if (!(this instanceof XMLHttpRequest)) {
      throw new TypeError('illegal invocation')
    }

    // 1. If this’s response type is not the empty string or
    //    "text", then throw an "InvalidStateError" DOMException.
    if (this[kResponseType] !== '' && this[kResponseType] !== 'text') {
      throw new DOMException('invalid state', 'InvalidStateError')
    }

    // 2. If this’s state is not loading or done, then return the empty string.
    if (this[kState] !== 'loading' && this[kState] !== 'done') {
      return ''
    }

    // 3. Return the result of getting a text response for this.
    return getTextResponse(this)
  }

  // https://xhr.spec.whatwg.org/#the-responsexml-attribute
  get responseXML () {
    if (!(this instanceof XMLHttpRequest)) {
      throw new TypeError('illegal invocation')
    }

    // 1. If this’s response type is not the empty string or "document",
    //    then throw an "InvalidStateError" DOMException.
    if (this[kResponseType] !== '' && this[kResponseType] !== 'document') {
      throw new DOMException('invalid state', 'InvalidStateError')
    }

    // 2. If this’s state is not done, then return null.
    if (this[kState] !== 'done') {
      return null
    }

    // 3. Assert: this’s response object is not failure.
    assert(this[kResponseObject] !== 'failure')

    return null
  }

  // https://xhr.spec.whatwg.org/#dom-xmlhttprequest-readystate
  get readyState () {
    if (!(this instanceof XMLHttpRequest)) {
      throw new TypeError('illegal invocation')
    }

    switch (this[kState]) {
      case 'unsent': return 0
      case 'opened': return 1
      case 'headers received': return 2
      case 'loading': return 3
      case 'done': return 4
    }
  }

  static get UNSENT () {
    return XMLHttpRequestReadyState.UNSENT
  }

  get UNSENT () {
    return XMLHttpRequestReadyState.UNSENT
  }

  static get OPENED () {
    return XMLHttpRequestReadyState.OPENED
  }

  get OPENED () {
    return XMLHttpRequestReadyState.OPENED
  }

  static get HEADERS_RECEIVED () {
    return XMLHttpRequestReadyState.HEADERS_RECEIVED
  }

  get HEADERS_RECEIVED () {
    return XMLHttpRequestReadyState.HEADERS_RECEIVED
  }

  static get LOADING () {
    return XMLHttpRequestReadyState.LOADING
  }

  get LOADING () {
    return XMLHttpRequestReadyState.LOADING
  }

  static get DONE () {
    return XMLHttpRequestReadyState.DONE
  }

  get DONE () {
    return XMLHttpRequestReadyState.DONE
  }
}

/**
 * @see https://xhr.spec.whatwg.org/#concept-event-fire-progress
 * @param {string|Event} e
 * @param {EventTarget} target
 * @param {number} transmitted
 * @param {number} length
 */
function fireProgressEvent (e, target, transmitted, length) {
  const eventName = typeof e === 'string' ? e : e.type
  // To fire a progress event named e at target, given transmitted and length, means to
  // fire an event named e at target, using ProgressEvent, with the loaded attribute
  // initialized to transmitted, and if length is not 0, with the lengthComputable
  // attribute initialized to true and the total attribute initialized to length.
  const event = new ProgressEvent(eventName)
  event[kLoaded] = transmitted
  event[kLengthComputable] = length !== 0
  event[kTotal] = length

  target.dispatchEvent(event)

  try {
    // eslint-disable-next-line no-useless-call
    target[`on${eventName}`]?.call(target, event)
  } catch (e) {
    queueMicrotask(() => {
      throw e
    })
  }
}

function fireEvent (target, eventName) {
  const event = new Event(eventName)
  target.dispatchEvent(event)

  try {
    // eslint-disable-next-line no-useless-call
    target.onreadystatechange?.call(target, event)
  } catch (e) {
    queueMicrotask(() => {
      throw e
    })
  }
}

/**
 * @see https://xhr.spec.whatwg.org/#handle-errors
 * @param {XMLHttpRequest} xhr
 */
function handleErrors (xhr) {
  // 1. If xhr’s send() flag is unset, then return.
  if (!xhr[kSendFlag]) {
    return
  }

  // 2. If xhr’s timed out flag is set, then run the request error steps for xhr,
  //    timeout, and "TimeoutError" DOMException.
  if (xhr[kTimedOutFlag]) {
    requestErrorSteps(xhr, 'timeout', new DOMException('timed out', 'TimeoutError'))
  } else if (xhr[kResponse].aborted) {
    // 3. Otherwise, if xhr’s response’s aborted flag is set, run the request error
    //    steps for xhr, abort, and "AbortError" DOMException.
    requestErrorSteps(xhr, 'abort', new DOMException('aborted', 'AbortError'))
  } else if (xhr[kResponse].type === 'error') {
    // 4. Otherwise, if xhr’s response is a network error, then:

    // 1. Report timing for xhr.
    finalizeAndReportTiming(xhr[kResponse], 'xmlhttprequest')

    // 2. Run the request error steps for xhr, error, and "NetworkError" DOMException.
    requestErrorSteps(xhr, 'error', new DOMException('network error', 'NetworkError'))
  }
}

/**
 * @see https://xhr.spec.whatwg.org/#request-error-steps
 * @param {XMLHttpRequest} xhr
 */
function requestErrorSteps (xhr, event, exception) {
  // 1. Set xhr’s state to done.
  xhr[kState] = 'done'

  // 2. Unset xhr’s send() flag.
  xhr[kSendFlag] = undefined

  // 3. Set xhr’s response to a network error.
  xhr[kResponse] = makeNetworkError()

  // 4. If xhr’s synchronous flag is set, then throw exception.
  if (xhr[kSychronousFlag]) {
    throw exception || new Error('bad flag')
  }

  // 5. Fire an event named readystatechange at xhr.
  fireEvent(xhr, 'readystatechange')

  // 6. If xhr’s upload complete flag is unset, then:
  if (xhr[kUploadCompleteFlag] === undefined) {
    // 1. Set xhr’s upload complete flag.
    xhr[kUploadCompleteFlag] = true

    // 2. If xhr’s upload listener flag is set, then:
    if (xhr[kUploadListenerFlag]) {
      // 1. Fire a progress event named event at xhr’s upload object with 0 and 0.
      fireProgressEvent(event, xhr[kUploadObject], 0, 0)

      // 2. Fire a progress event named loadend at xhr’s upload object with 0 and 0.
      fireProgressEvent('loadend', xhr[kUploadObject], 0, 0)
    }
  }

  // 7. Fire a progress event named event at xhr with 0 and 0.
  fireProgressEvent(event, xhr, 0, 0)

  // 8. Fire a progress event named loadend at xhr with 0 and 0.
  fireProgressEvent('loadend', xhr, 0, 0)
}

/**
 * @see https://xhr.spec.whatwg.org/#handle-response-end-of-body
 * @param {XMLHttpRequest} xhr
 */
function handleResponseEndOfBody (xhr) {
  // 1. Handle errors for xhr.
  handleErrors(xhr)

  // 2. If xhr’s response is a network error, then return.
  if (xhr[kResponse].type === 'error') {
    return
  }

  // 3. Report timing for xhr.
  finalizeAndReportTiming(xhr)

  // 4. Let transmitted be xhr’s received bytes’s length.
  const transmitted = xhr[kReceivedBytes].length

  // 5. Let length be the result of extracting a length from
  //    this’s response’s header list.
  let length = extractLengthFromHeadersList(xhr[kResponse].headersList)

  // 6. If length is not an integer, then set it to 0.
  if (!Number.isSafeInteger(length)) {
    length = 0
  }

  // 7. If xhr’s synchronous flag is unset, then fire a progress event
  //    named progress at xhr with transmitted and length.
  if (xhr[kSychronousFlag] === undefined) {
    fireProgressEvent('progress', xhr, transmitted, length)
  }

  // 8. Set xhr’s state to done.
  xhr[kState] = 'done'

  // 9. Unset xhr’s send() flag.
  xhr[kSendFlag] = undefined

  // 10. Fire an event named readystatechange at xhr.
  fireEvent(xhr, 'readystatechange')

  // 11. Fire a progress event named load at xhr with transmitted and length.
  fireProgressEvent('load', xhr, transmitted, length)

  // 12. Fire a progress event named loadend at xhr with transmitted and length.
  fireProgressEvent('loadend', xhr, transmitted, length)
}

webidl.enumConverter = function (allowed, def) {
  return (V) => {
    if (typeof V !== 'string' || !allowed.includes(V)) {
      return def
    }

    return V
  }
}

const responseTypeEnum = webidl.enumConverter(
  ['', 'arraybuffer', 'blob', 'document', 'json', 'text'],
  ''
)

module.exports = {
  XMLHttpRequest
}
