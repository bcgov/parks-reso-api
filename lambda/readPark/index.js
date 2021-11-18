const { runQuery } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');
const { checkPermissions } = require('../permissionUtil');

exports.handler = async (event, context) => {
  console.log('Read Park', event);

  let queryObj = {
    TableName: process.env.TABLE_NAME
  };

  const isAdmin = await checkPermissions(event);
  console.log('isAdmin:', isAdmin);

  try {
    if (!event.queryStringParameters) {
      queryObj.ExpressionAttributeValues = {};
      queryObj.ExpressionAttributeValues[':pk'] = { S: 'park' };
      queryObj.KeyConditionExpression = 'pk =:pk';

      const parksData = await runQuery(queryObj);
      if (isAdmin) {
        return sendResponse(200, parksData, context);
      } else {
        const list = parksData.filter(item => {
          return item.visible === true;
        });
        return sendResponse(200, list, context);
      }
    } else if (event.queryStringParameters.park) {
      // Get specific park.
      queryObj.ExpressionAttributeValues = {};
      queryObj.ExpressionAttributeValues[':pk'] = { S: 'park' };
      queryObj.ExpressionAttributeValues[':sk'] = { S: event.queryStringParameters.park };
      queryObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';
      queryObj = visibleFilter(queryObj, isAdmin);
      const parkData = await runQuery(queryObj);
      return sendResponse(200, parkData, context);
    } else {
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }
  } catch (err) {
    console.log(err);
    return sendResponse(400, err, context);
  }
};

const visibleFilter = function (queryObj, isAdmin) {
  console.log('visibleFilter:', queryObj, isAdmin);
  if (!isAdmin) {
    queryObj.ExpressionAttributeValues[':visible'] = { BOOL: true };
    queryObj.FilterExpression = 'visible =:visible';
  }
  return queryObj;
};
