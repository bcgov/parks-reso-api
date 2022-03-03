const { runQuery, TABLE_NAME } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');

exports.handler = async (event, context) => {
  console.log('Read Config', event);

  let queryObj = {
    TableName: TABLE_NAME
  };

  if (event.queryStringParameters.warmup) {
    // Used for warming up the lambda
    return sendResponse(200);
  }

  try {
    queryObj.ExpressionAttributeValues = {};
    queryObj.ExpressionAttributeValues[':pk'] = { S: 'config' };
    queryObj.ExpressionAttributeValues[':sk'] = { S: 'config' };
    queryObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';

    const configData = await runQuery(queryObj);
    return sendResponse(200, configData[0], context);
  } catch (err) {
    console.log(err);
    return sendResponse(400, err, context);
  }
};
