/**
 * Sends a response with the specified code, data, and context.
 * @param {number} code - The status code of the response.
 * @param {object} data - The data to be included in the response body.
 * @param {object} context - The context object.
 * @returns {object} - The response object.
 */
exports.sendResponse = function (code, data, context) {
  const response = {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-App-Version',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'OPTIONS,GET'
    },
    body: JSON.stringify(data)
  };
  return response;
};

/**
 * CustomError constructor function.
 * @param {string} message - The error message.
 * @param {number} statusCode - The status code of the error.
 */
exports.CustomError = function (message, statusCode) {
  this.message = message;
  this.statusCode = statusCode;
}

/**
 * Checks if the event is a warmup event.
 * @param {object} event - The event object.
 * @returns {boolean} - True if the event is a warmup event, false otherwise.
 */
exports.checkWarmup = function (event) {
  if (event?.warmup === true) {
    return true;
  } else {
    return false;
  }
}