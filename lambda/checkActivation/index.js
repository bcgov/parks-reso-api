const { runQuery, setStatus } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');

exports.handler = async (event, context) => {
  console.log('check activation', event);

  let queryObj = {
    TableName: process.env.TABLE_NAME
  };

  // Look for today's activations
  let todaysDate = new Date().toISOString().split('T')[0];

  try {
    queryObj.ExpressionAttributeValues = {};
    queryObj.ExpressionAttributeValues[':pk'] = { S: 'park' };
    queryObj.KeyConditionExpression = 'pk =:pk';
    console.log('queryObj:', queryObj);

    const parkData = await runQuery(queryObj);

    for (let i = 0; i < parkData.length; i++) {
      let passQuery = {
        TableName: process.env.TABLE_NAME
      };
      passQuery.ExpressionAttributeNames = {
        '#dateselector': 'date'
      };
      passQuery.ExpressionAttributeValues = {};
      passQuery.ExpressionAttributeValues[':pk'] = { S: 'pass::' + parkData[i].sk };
      passQuery.ExpressionAttributeValues[':todaysDate'] = { S: todaysDate };
      passQuery.ExpressionAttributeValues[':reservedStatus'] = { S: 'reserved' };
      passQuery.KeyConditionExpression = 'pk =:pk';
      passQuery.FilterExpression = 'begins_with(#dateselector, :todaysDate) AND passStatus =:reservedStatus';

      console.log('passQuery:', passQuery);
      const passData = await runQuery(passQuery);
      console.log('passData:', passData);

      await setStatus(passData, 'active');
    }
    return sendResponse(200, {}, context);
  } catch (err) {
    console.log(err);
    return sendResponse(200, { msg: 'Activation Check Complete' }, context);
  }
};
