const AWS = require('aws-sdk');
const lambda = new AWS.Lambda();
const { parentPort, workerData } = require('worker_threads');

const config = workerData.config;

let concurrency = config.concurrency
    && !isNaN(config.concurrency)
    && config.concurrency > 1
    ? config.concurrency : 1;

// Log it
if (config.log) {
    const lastAccess = Date.now();
    // Create log record

    const log = {
        action: 'warmer',
        function: config.funcName + ':' + config.funcVersion,
        correlationId: config.correlationId,
        count: 1,
        concurrency: concurrency,
        lastAccessed: lastAccess,
        lastAccessedSeconds: lastAccess === null ? null : ((Date.now() - lastAccess) / 1000).toFixed(1)
    };
    parentPort.postMessage(`{"message":"${config.funcName}: ${log}"}`);
}

// Fan out if concurrency is set higher than 1
if (concurrency > 1) {
    // init promise array
    let invocations = [];

    // loop through concurrency count
    for (let i = 2; i <= concurrency; i++) {

        // Set the params and wait for the final function to finish
        let params = {
            FunctionName: config.funcName + ':' + config.funcVersion,
            InvocationType: i === concurrency ? 'RequestResponse' : 'Event',
            LogType: 'None',
            Payload: Buffer.from(JSON.stringify({
                '__WARMER_INVOCATION__': i, // send invocation number
                '__WARMER_CONCURRENCY__': concurrency, // send total concurrency
                '__WARMER_CORRELATIONID__': config.correlationId, // send correlation id
                'warmup': true
            }))
        };

        // Add promise to invocations array
        invocations.push(lambda.invoke(params).promise());
    } // end for

    // Invoke concurrent functions
    try {
        Promise.all(invocations).then(() => {
            if (config.log) {
                parentPort.postMessage(`{"message":"${config.funcName} has been warmed up successfully."}`);
            }
        })
    } catch (error) {
        throw error;
    }
}
