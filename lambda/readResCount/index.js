const { runQuery, TABLE_NAME } = require('../dynamoUtil');
const { sendResponse, checkWarmup } = require('../responseUtil');
const { checkPermissions } = require('../permissionUtil');

exports.handler = async (event, context) => {
  console.log('Read ResCount', event);
  if (checkWarmup(event)) {
    return sendResponse(200, {});
  }

  let queryObj = {
    TableName: TABLE_NAME
  };

  const isAdmin = (await checkPermissions(event)).decoded;
  console.log('isAdmin:', isAdmin);

  if (!isAdmin) {
    return sendResponse(401, { msg: 'Must be admin' }, context);
  }

  try {
    // Get rescount
    queryObj.ExpressionAttributeValues = {};
    queryObj.ExpressionAttributeValues[':pk'] = {
      S: `rescount::${event.queryStringParameters.park}::${event.queryStringParameters.facility}`
    };
    queryObj.ExpressionAttributeValues[':sk'] = { S: event.queryStringParameters.date };
    queryObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';
    const resCountData = await runQuery(queryObj);
    const reservations = resCountData.length ? resCountData[0]?.reservations || {} : {};
    return sendResponse(200, reservations, context);
  } catch (err) {
    console.log(err);
    return sendResponse(400, err, context);
  }
};
