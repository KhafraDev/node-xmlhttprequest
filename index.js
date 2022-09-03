'use strict'

const { XMLHttpRequest } = require('./src/xmlhttprequest')

// https://github.com/fastify/fastify/blob/224dc104260ad26f9baa0e46962f917963d41fe5/fastify.js#L711

module.exports.XMLHttpRequest = XMLHttpRequest
module.exports.default = XMLHttpRequest
module.exports = XMLHttpRequest