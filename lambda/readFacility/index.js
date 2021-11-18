const { runQuery } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');
const { checkPermissions } = require('../permissionUtil');

exports.handler = async (event, context) => {
  console.log('Read Facility', event);

  let queryObj = {
    TableName: process.env.TABLE_NAME
  };

  const isAdmin = await checkPermissions(event);
  console.log('isAdmin:', isAdmin);

  try {
    if (!event.queryStringParameters) {
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }
    if (event.queryStringParameters.facilities && event.queryStringParameters.park) {
      console.log('Grab facilities for this park');
      // Grab facilities for this park.
      queryObj.ExpressionAttributeValues = {};
      queryObj.ExpressionAttributeValues[':pk'] = { S: 'facility::' + event.queryStringParameters.park };
      queryObj.KeyConditionExpression = 'pk =:pk';
      if (await parkVisible(event.queryStringParameters.park, isAdmin)) {
        queryObj = visibleFilter(queryObj, isAdmin);
        const facilityData = await runQuery(queryObj);
        return sendResponse(200, facilityData, context);
      } else {
        return sendResponse(400, { msg: 'Invalid Request' }, context);
      }
    } else if (event.queryStringParameters.facilityName && event.queryStringParameters.park) {
      console.log('Get the specific Facility');
      // Get the specific Facility
      queryObj.ExpressionAttributeValues = {};
      queryObj.ExpressionAttributeValues[':pk'] = { S: 'facility::' + event.queryStringParameters.park };
      queryObj.ExpressionAttributeValues[':sk'] = { S: event.queryStringParameters.facilityName };
      queryObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';
      if (await parkVisible(event.queryStringParameters.park, isAdmin)) {
        queryObj = visibleFilter(queryObj, isAdmin);
        const facilityData = await runQuery(queryObj);
        return sendResponse(200, facilityData, context);
      } else {
        return sendResponse(400, { msg: 'Invalid Request' }, context);
      }
    } else {
      console.log('Invalid Request');
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }
  } catch (err) {
    console.log(err);
    return sendResponse(400, err, context);
  }
};

const parkVisible = async function (park, isAdmin) {
  console.log(park, isAdmin);
  if (isAdmin) {
    return true;
  } else {
    let queryObj = {
      TableName: process.env.TABLE_NAME,
      ExpressionAttributeValues: {}
    };
    queryObj.ExpressionAttributeValues[':pk'] = { S: 'park' };
    queryObj.ExpressionAttributeValues[':sk'] = { S: park };
    queryObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';
    console.log('queryObj', queryObj);
    const parkData = await runQuery(queryObj);
    console.log('ParkData:', parkData);
    if (parkData.length > 0) {
      return parkData[0].visible;
    } else {
      return false;
    }
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
