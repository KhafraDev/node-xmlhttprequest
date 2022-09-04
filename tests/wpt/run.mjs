import { WPTRunner } from './runner/runner.mjs'

const runner = new WPTRunner('xhr')

// https://github.com/web-platform-tests/wpt/blob/master/xhr/idlharness.any.js
runner.addInitScript(`
  globalThis.XMLHttpRequest = require('../../../index.js')
  globalThis.XMLHttpRequestUpload = (new XMLHttpRequest()).upload
  globalThis.FormData ??= require('undici').FormData
`)

runner.run()