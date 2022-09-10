'use strict'

module.exports = {
  // https://xhr.spec.whatwg.org/#upload-object
  kUploadObject: Symbol('upload object'),
  // https://xhr.spec.whatwg.org/#timeout
  kTimeout: Symbol('timeout'),
  // https://xhr.spec.whatwg.org/#response-type
  kResponseType: Symbol('response type'),
  // https://xhr.spec.whatwg.org/#xmlhttprequest-fetch-controller
  kFetchController: Symbol('fetch controller'),
  // https://xhr.spec.whatwg.org/#send-flag
  kSendFlag: Symbol('send flag'),
  // https://xhr.spec.whatwg.org/#upload-listener-flag
  kUploadListenerFlag: Symbol('upload listener flag'),
  // https://xhr.spec.whatwg.org/#request-method
  kRequestMethod: Symbol('request method'),
  // https://xhr.spec.whatwg.org/#request-url
  kRequestURL: Symbol('request url'),
  // https://xhr.spec.whatwg.org/#synchronous-flag
  kSychronousFlag: Symbol('sync flag'),
  // https://xhr.spec.whatwg.org/#author-request-headers
  kRequestHeaders: Symbol('headers list'),
  // https://xhr.spec.whatwg.org/#response
  kResponse: Symbol('response'),
  // https://xhr.spec.whatwg.org/#received-bytes
  kReceivedBytes: Symbol('received bytes'),
  // https://xhr.spec.whatwg.org/#response-object
  kResponseObject: Symbol('response object'),
  // https://xhr.spec.whatwg.org/#concept-xmlhttprequest-state
  kState: Symbol('state'),
  // https://xhr.spec.whatwg.org/#cross-origin-credentials
  kCrossOriginCredentials: Symbol('cross origin credentials'),
  // https://xhr.spec.whatwg.org/#request-body
  kRequestBody: Symbol('request body'),
  // https://xhr.spec.whatwg.org/#upload-complete-flag
  kUploadCompleteFlag: Symbol('upload complete flag'),
  // https://xhr.spec.whatwg.org/#timed-out-flag
  kTimedOutFlag: Symbol('timed out flag'),
  // https://xhr.spec.whatwg.org/#override-mime-type
  kOverrideMimeType: Symbol('override mime type'),

  // ProgressEvent symbols
  kLengthComputable: Symbol('length computable'),
  kLoaded: Symbol('loaded'),
  kTotal: Symbol('total')
}
