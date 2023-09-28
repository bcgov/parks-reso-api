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

exports.checkWarmup = function (event) {
  if (event?.warmup === true) {
    return true;
  } else {
    return false;
  }
}