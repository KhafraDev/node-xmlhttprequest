const { fetching } = require('undici/lib/fetch/index')
const { HeadersList } = require('undici/lib/fetch/headers')
const { getGlobalDispatcher } = require('undici')

async function runSync () {
  const req = JSON.parse(process.argv[2])
  req.headersList = new HeadersList(req.headersList)
  req.urlList = req.urlList.map(url => new URL(url))

  const timeout = Number(process.argv[3])

  // 1. Let processedResponse be false.
	let processedResponse = false

  const output = {
    kResponse: null,
    kReceivedBytes: []
  }

	// 2. Let processResponseConsumeBody, given a response and
	//    nullOrFailureOrBytes, be these steps:
	const processResponseConsumeBody = (response, nullOrFailureBytes) => {
    // 1. If nullOrFailureOrBytes is not failure, then set this’s
    //    response to response.
    if (nullOrFailureBytes !== 'failure') {
      output.kResponse = response
    }

    // 2. If nullOrFailureOrBytes is a byte sequence, then append
    //    nullOrFailureOrBytes to this’s received bytes.
    if (nullOrFailureBytes !== null) {
      output.kReceivedBytes.push(...nullOrFailureBytes)
    }

    // 3. Set processedResponse to true.
    processedResponse = true
    console.log(JSON.stringify(output, (key, value) => {
      if (key === 'headersList') {
        return [...output.kResponse.headersList.entries()]
      }

      return value
    }))
    process.exit()
	}

	// 3. Set this’s fetch controller to the result of fetching req with
	//    processResponseConsumeBody set to processResponseConsumeBody and
	//    useParallelQueue set to true.
	const controller = fetching({
    request: req,
    processResponseConsumeBody,
    useParallelQueue: true,
    dispatcher: getGlobalDispatcher()
	})

	// 4. Let now be the present time.
	const now = Date.now()

	// 5. Pause until either processedResponse is true or this’s timeout
	//    is not 0 and this’s timeout milliseconds have passed since now.
}

runSync()