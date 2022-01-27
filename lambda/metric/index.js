const AWS = require('aws-sdk');
const { runScan, TABLE_NAME } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');
const { checkPermissions } = require('../permissionUtil');

exports.handler = async (event, context) => {
  console.log('Metric', event);
  console.log('event.queryStringParameters', event.queryStringParameters);

  let queryObj = {
    TableName: TABLE_NAME
  };

  try {
    if (!event.queryStringParameters) {
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }

    const tokenObj = await checkPermissions(event);
    if (tokenObj.decoded !== true) {
      return sendResponse(403, { msg: 'Unauthorized' });
    }

    if (event.queryStringParameters.type == 'passTotals') {
      // Get all the passes for a specific facility
     
      const cancelled = await getPassNumbers(queryObj, 'cancelled');
      console.log("cancelled:", cancelled.length)
      const active = await getPassNumbers(queryObj, 'active');
      console.log("active:", active.length)
      const reserved = await getPassNumbers(queryObj, 'reserved');
      console.log("reserved:", reserved.length)
      const expired = await getPassNumbers(queryObj, 'expired');
      console.log("expired:", expired.length)

      return sendResponse(200, {
        cancelled: cancelled.length,
        active: active.length,
        reserved: reserved.length,
        expired: expired.length,
      });
    } else {
      console.log('Invalid Request');
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }
  } catch (err) {
    console.log(err);
    return sendResponse(400, err, context);
  }
};

async function getPassNumbers(queryObj, status) {
  queryObj.ExpressionAttributeValues = {};
  queryObj.ExpressionAttributeValues[':ending'] = { S: 'pass::' };
  queryObj.ExpressionAttributeValues[':passStatus'] = { S: status };
  queryObj.FilterExpression = 'begins_with(pk, :ending) and passStatus=:passStatus';

  console.log('queryObj:', queryObj);
  let scanResults = [];
  do {
    passData = await runScan(queryObj, true);
    passData.data.forEach((item) => scanResults.push(item));
    queryObj.ExclusiveStartKey  = passData.LastEvaluatedKey;
  } while(typeof passData.LastEvaluatedKey !== "undefined");

  return scanResults;
}