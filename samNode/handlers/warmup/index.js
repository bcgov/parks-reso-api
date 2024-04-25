const { v4: uuidv4 } = require('uuid');

const mainThreadConfigDefaults = {
    configArray: [],
    log: true,
    delay: 1000
};

const configDefaults = {
    funcName: null,
    funcVersion: null,
    concurrency: 'concurrency', // default concurrency field
    log: true, // default logging to true
    correlationId: uuidv4(), // default the correlationId
};

const { Worker } = require('worker_threads');
exports.handler = async (event) => {
    const mainThreadConfig = Object.assign({}, mainThreadConfigDefaults, event);
    if (mainThreadConfig.configArray.length > 0) {
        const threads = new Set();
        for (let i = 0; i < mainThreadConfig.configArray.length; i++) {
            const config = Object.assign({}, configDefaults, mainThreadConfig.configArray[i]);
            if (config.funcName && config.funcVersion) {
                threads.add(new Worker(__dirname + '/worker.js', { workerData: { config: config } }));
                logMessage(mainThreadConfigDefaults.log, `Worker added to thread list with config: ${config}`);
            }
        }

        for (let worker of threads) {
            worker.on('error', (err) => {
                logMessage(mainThreadConfigDefaults.log, `We have an error: ${err}`);
                threads.delete(worker);
            });
            worker.on('exit', () => {
                threads.delete(worker);
                logMessage(mainThreadConfigDefaults.log, `Thread exiting, ${threads.size} running...`);
                if (threads.size === 0) {
                    logMessage(mainThreadConfigDefaults.log, 'Warm up complete.');
                }
            });
            worker.on('message', (msg) => {
                logMessage(mainThreadConfigDefaults.log, msg);
            });
        }

        return new Promise(async (resolve) => {
            while (true) {
                await new Promise(r => setTimeout(r, mainThreadConfig.delay));
                if (threads.size === 0) {
                    logMessage(mainThreadConfigDefaults.log, 'All threads complete.');
                    break;
                } else {
                    logMessage(mainThreadConfigDefaults.log, '.');
                }
            }
            resolve();
        });
    }
}; // end module

function logMessage(logBoolean, message) {
    if (logBoolean === true) {
        console.log(message);
    }
}