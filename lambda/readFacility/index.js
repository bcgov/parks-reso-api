const { runQuery, TABLE_NAME } = require('../dynamoUtil');
const { sendResponse, checkWarmup } = require('../responseUtil');
const { checkPermissions } = require('../permissionUtil');
const { format } = require('date-fns');

exports.handler = async (event, context) => {
  console.log('Read Facility', event);
  if (checkWarmup(event)) {
    return sendResponse(200, {});
  }

  let queryObj = {
    TableName: TABLE_NAME
  };

  const isAdmin = (await checkPermissions(event)).decoded;
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

        // get the reservation data for each facility
        for (let i = 0; i < facilityData.length; i++) {
          facilityData[i].reservations = await getReservationCounts(event.queryStringParameters.park, facilityData[i].name);
        }

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
        if (facilityData.length) {
          facilityData[0].reservations =  await getReservationCounts(
            event.queryStringParameters.park, 
            event.queryStringParameters.facilityName
          );
        }
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
      TableName: TABLE_NAME,
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

const getReservationCounts = async function (parkName, facilityName) {
  // Gets the reservation counts for a facility and simplifies the results
  const resCountPK = `rescount::${parkName}::${facilityName}`;

  // query DynamoDB
  let queryObj = {
    TableName: TABLE_NAME,
    ExpressionAttributeValues: {}
  };  
  queryObj.ExpressionAttributeValues[':pk'] = { S: resCountPK };

  // get the local Vancouver date in YYYY-MM-DD format
  const todayShortDate = format(
    Date.parse(new Date().toLocaleString('en-us', { timeZone: "America/Vancouver" })), 
    'yyyy-MM-dd');

  // only reservations on or after today are included
  queryObj.ExpressionAttributeValues[':today'] = { S: todayShortDate };
  queryObj.KeyConditionExpression = 'pk =:pk AND sk >= :today';
  console.log('queryObj', queryObj);
  const resData = await runQuery(queryObj);

  // rewrite the results in a simplified format
  const reservations = {};
  resData.forEach(date => {
    reservations[date.sk] = date.reservations;
  });
  console.log(reservations);

  return reservations;
}

const visibleFilter = function (queryObj, isAdmin) {
  console.log('visibleFilter:', queryObj, isAdmin);
  if (!isAdmin) {
    queryObj.ExpressionAttributeValues[':visible'] = { BOOL: true };
    queryObj.FilterExpression = 'visible =:visible';
  }
  return queryObj;
};
