const { runQuery } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');

exports.handler = async (event, context) => {
  console.log('Read Config', event);

  let queryObj = {
    TableName: process.env.TABLE_NAME
  };

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
