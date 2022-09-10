'use strict'

const { kResponse, kOverrideMimeType, kResponseType, kReceivedBytes } = require('./symbols.js')
const { parseMIMEType } = require('undici/lib/fetch/dataURL.js')
const { getEncoding } = require('./encoding.js')

/**
 * @typedef {import('./index').XMLHttpRequest} XMLHttpRequest
 * @typedef {import('../fetch/headers').HeadersList} HeadersList
 */

/**
 * @see https://fetch.spec.whatwg.org/#header-value
 * @param {string} value
 */
function isValidHeaderValue (value) {
  // see: https://chromium.googlesource.com/chromium/src/+/7d15b7fc471b33e2d52a45876cb8323a4fb0e780/third_party/WebKit/Source/platform/network/HTTPParsers.cpp#224
  return (
    containsOnlyLatin1(value) &&
    !value.includes('\r') &&
    !value.includes('\n') &&
    !value.includes('\0')
  )
}

/**
 * @param {string} string
 */
function containsOnlyLatin1 (string) {
  for (let i = 0; i < string.length; i++) {
    const byte = string.charCodeAt(i)
    if (byte > 255) {
      return false
    }
  }

  return true
}

/**
 * @see https://mimesniff.spec.whatwg.org/#serialize-a-mime-type
 */
function serializeMimeType (mimeType) {
  // 1. Let serialization be the concatenation of mimeType’s type,
  //    U+002F (/), and mimeType’s subtype.
  let serialization = `${mimeType.type}/${mimeType.subtype}`

  // 2. For each name → value of mimeType’s parameters:
  for (let [name, value] of mimeType.parameters) {
    // 1. Append U+003B (;) to serialization.
    serialization += ';'

    // 2. Append name to serialization.
    serialization += name

    // 3. Append U+003D (=) to serialization.
    serialization += '='

    // 4. If value does not solely contain HTTP token code points or
    //    value is the empty string, then:
    if (value.length === 0 || !/^[!#$%&'*+-.^_|~A-z0-9]+$/.test(value)) {
      // 1. Precede each occurence of U+0022 (") or U+005C (\) in
      //    value with U+005C (\).
      value = value.replace(/("|\\)/g, '\\$1')

      // 2. Prepend U+0022 (") to value.
      // 3. Append U+0022 (") to value.
      value = `"${value}"`
    }

    // 5. Append value to serialization.
    serialization += value
  }

  // 3. Return serialization.
  return serialization
}

/**
 * @see https://fetch.spec.whatwg.org/#header-list-extract-a-length
 */
function extractLengthFromHeadersList (headers) {
  const header = headers.get('content-length')

  if (header === null) {
    return null
  }

  // 1. Let values be the result of getting, decoding, and
  //    splitting `Content-Length` from headers.
  const values = header.split(',').map(value => value.trim())

  // 2. If values is null, then return null.

  // 3. Let candidateValue be null.
  let candidateValue = null

  // 4. For each value of values:
  for (const value of values) {
    // 1. If candidateValue is null, then set candidateValue to value.
    if (candidateValue === null) {
      candidateValue = value
    } else if (value !== candidateValue) {
      // 2. Otherwise, if value is not candidateValue, return failure.
      return 'failure'
    }
  }

  // 5. If candidateValue is the empty string or has a code point that
  //    is not an ASCII digit, then return null.
  if (candidateValue.length === 0 || !/^[0-9]+$/.test(candidateValue)) {
    return null
  }

  // 6. Return candidateValue, interpreted as decimal number.
  return Number(candidateValue)
}

/**
 * @see https://xhr.spec.whatwg.org/#text-response
 * @param {XMLHttpRequest} xhr
 */
function getTextResponse (xhr) {
  // 1. If xhr’s response’s body is null, then return the empty string.
  if (xhr[kResponse].body == null) {
    return ''
  }

  // 2. Let charset be the result of get a final encoding for xhr.
  let charset = finalCharset(xhr)

  // 3. If xhr’s response type is the empty string, charset is null,
  //    and the result of get a final MIME type for xhr is an XML MIME
  //    type, then use the rules set forth in the XML specifications to
  //    determine the encoding. Let charset be the determined encoding.
  if (xhr[kResponseType] === '' && charset === null) {
    const final = finalMimeType(xhr)
    const essence = `${final.type}/${final.subtype}`

    // https://mimesniff.spec.whatwg.org/#xml-mime-type
    if (
      final.subtype.endsWith('+xml') ||
      essence === 'text/xml' ||
      essence === 'application/xml'
    ) {
      // Note: there's no real reason to bother implementing this.
      charset = 'UTF-8'
    }
  }

  // 4. If charset is null, then set charset to UTF-8.
  if (charset === null) {
    charset = 'UTF-8'
  }

  // 5. Return the result of running decode on xhr’s received bytes
  //    using fallback encoding charset.
  const bytes = new Uint8Array(xhr[kReceivedBytes], 0, xhr[kReceivedBytes].length)

  return new TextDecoder(charset).decode(bytes)
}

/**
 * @see https://xhr.spec.whatwg.org/#final-charset
 * @param {XMLHttpRequest} xhr
 */
function finalCharset (xhr) {
  // 1. Let label be null.
  let label = null

  // 2. Let responseMIME be the result of get a response MIME type
  //    for xhr.
  const responseMIME = getResponseMimeType(xhr)

  // 3. If responseMIME’s parameters["charset"] exists, then set
  //    label to it.
  label = responseMIME.parameters.get('charset') ?? null

  // 4. If xhr’s override MIME type’s parameters["charset"] exists,
  //    then set label to it.
  label = xhr[kOverrideMimeType]?.parameters.get('charset') ?? label

  // 5. If label is null, then return null.
  if (label === null) {
    return null
  }

  // 6. Let encoding be the result of getting an encoding from label.
  const encoding = getEncoding(label)

  // 7. If encoding is failure, then return null.
  if (encoding === 'failure') {
    return null
  }

  // 8. Return encoding.
  return encoding
}

/**
 * @see https://xhr.spec.whatwg.org/#response-mime-type
 * @param {XMLHttpRequest} xhr
 */
function getResponseMimeType (xhr) {
  // 1. Let mimeType be the result of extracting a MIME type from xhr’s
  //    response’s header list.
  const mimeType = extractMimeType(xhr[kResponse].headersList)

  // 2. If mimeType is failure, then set mimeType to text/xml.
  if (mimeType === 'failure') {
    return {
      type: 'text',
      subtype: 'xml',
      /** @type {Map<string, string>} */
      parameters: new Map()
    }
  }

  // 3. Return mimeType.
  return mimeType
}

/**
 * @see https://fetch.spec.whatwg.org/#concept-header-extract-mime-type
 * @param {HeadersList} headers
 */
function extractMimeType (headers) {
  // 1. Let charset be null.
  let charset = null

  // 2. Let essence be null.
  let essence = null

  // 3. Let mimeType be null.
  let mimeType = null

  // 4. Let values be the result of getting, decoding, and splitting
  //    `Content-Type` from headers.
  const contentType = headers.get('content-type')
  // TODO: implement 'getting, decoding, and splitting'
  const values = contentType
    ? contentType.split(',').map(ct => ct.trim())
    : null

  // 5. If values is null, then return failure.
  if (values === null) {
    return 'failure'
  }

  // 6. For each value of values:
  for (const value of values) {
    // 1. Let temporaryMimeType be the result of parsing value.
    const temporaryMimeType = parseMIMEType(value)
    const tempEssence = `${temporaryMimeType.type}/${temporaryMimeType.subtype}`

    // 2. If temporaryMimeType is failure or its essence is "*/*",
    //    then continue.
    if (
      temporaryMimeType === 'failure' ||
      tempEssence === '*/*'
    ) {
      continue
    }

    // 3. Set mimeType to temporaryMimeType.
    mimeType = temporaryMimeType

    // 4. If mimeType’s essence is not essence, then:
    if (tempEssence !== essence) {
      // 1. Set charset to null.
      charset = null

      // 2. If mimeType’s parameters["charset"] exists, then set
      //    charset to mimeType’s parameters["charset"].
      charset = mimeType.parameters.get('charset') ?? null

      // 3. Set essence to mimeType’s essence.
      essence = tempEssence
    } else if (!mimeType.parameters.has('charset') && charset !== null) {
      // 5. Otherwise, if mimeType’s parameters["charset"] does
      //    not exist, and charset is non-null, set mimeType’s
      //    parameters["charset"] to charset.
      mimeType.parameters.set('charset', charset)
    }
  }

  // 7. If mimeType is null, then return failure.
  if (mimeType === null) {
    return 'failure'
  }

  // 8. Return mimeType.
  return mimeType
}

/**
 * @see https://xhr.spec.whatwg.org/#final-mime-type
 * @param {XMLHttpRequest} xhr
 */
function finalMimeType (xhr) {
  // 1. If xhr’s override MIME type is null, return the result of
  //    get a response MIME type for xhr.
  if (xhr[kOverrideMimeType] === null) {
    return getResponseMimeType(xhr)
  }

  // 2. Return xhr’s override MIME type.
  return xhr[kOverrideMimeType]
}

// https://encoding.spec.whatwg.org/#utf-8-decode
function utf8Decode (buffer) {
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    buffer = buffer.subarray(3)
  }

  const text = new TextDecoder('utf-8', {
    fatal: true
  }).decode(buffer)

  return JSON.parse(text)
}

module.exports = {
  finalMimeType,
  getTextResponse,
  extractLengthFromHeadersList,
  serializeMimeType,
  isValidHeaderValue,
  utf8Decode
}
