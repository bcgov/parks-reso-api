const AWS = require('aws-sdk');

const { dynamodb } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');
const { checkPermissions } = require('../permissionUtil');

exports.handler = async (event, context) => {
  if (!event || !event.headers) {
    return sendResponse(403, { msg: 'Unauthorized' }, context);
  }

  if (!(event.httpMethod === 'POST' || event.httpMethod === 'PUT')) {
    return sendResponse(405, { msg: 'Not Implemented' }, context);
  }

  if ((await checkPermissions(event)) === false) {
    return sendResponse(403, { msg: 'Unauthorized' }, context);
  }

  try {
    console.log(event.body);
    const obj = JSON.parse(event.body);

    // If this is a PUT operation ensure to protect against creating a new item instead of updating the old one.
    if (event.httpMethod === 'PUT') {
      return await updateFacility(obj);
    } else {
      return await createFacility(obj);
    }
  } catch (err) {
    console.log('err', err);
    return sendResponse(400, err, context);
  }
};

async function createFacility(obj) {
  let {
    parkName,
    bookingTimes,
    name,
    status,
    type,
    visible,
    mode,
    stateReason,
    bookingOpeningHour,
    bookingDaysAhead,
    ...otherProps
  } = obj;

  const bookingOpeningHourAttrValue = {};
  const bookingDaysAheadAttrValue = {};

  if (bookingOpeningHour || bookingOpeningHour === 0) {
    bookingOpeningHourAttrValue.N = bookingOpeningHour.toString();
  } else {
    bookingOpeningHourAttrValue.NULL = true;
  }
  if (bookingDaysAhead || bookingDaysAhead === 0) {
    bookingDaysAheadAttrValue.N = bookingDaysAhead.toString();
  } else {
    bookingDaysAheadAttrValue.NULL = true;
  }

  const facilityObj = {
    TableName: process.env.TABLE_NAME,
    ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
    Item: {
      pk: { S: `facility::${parkName}` },
      sk: { S: name },
      bookingTimes: { M: AWS.DynamoDB.Converter.marshall(bookingTimes) },
      name: { S: name },
      status: { M: AWS.DynamoDB.Converter.marshall(status) },
      type: { S: type },
      visible: { BOOL: visible },
      reservations: { M: {} },
      bookingOpeningHour: bookingOpeningHourAttrValue,
      bookingDaysAhead: bookingDaysAheadAttrValue
    }
  };

  console.log('putting item:', facilityObj);
  const res = await dynamodb.putItem(facilityObj).promise();
  console.log('res:', res);
  return sendResponse(200, res);
}

async function updateFacility(obj) {
  let {
    sk,
    parkName,
    bookingTimes,
    name,
    status,
    type,
    visible,
    mode,
    stateReason,
    bookingOpeningHour,
    bookingDaysAhead,
    ...otherProps
  } = obj;

  const bookingOpeningHourAttrValue = {};
  const bookingDaysAheadAttrValue = {};

  if (bookingOpeningHour || bookingOpeningHour === 0) {
    bookingOpeningHourAttrValue.N = bookingOpeningHour.toString();
  } else {
    bookingOpeningHourAttrValue.NULL = true;
  }
  if (bookingDaysAhead || bookingDaysAhead === 0) {
    bookingDaysAheadAttrValue.N = bookingDaysAhead.toString();
  } else {
    bookingDaysAheadAttrValue.NULL = true;
  }

  let updateParams = {
    Key: {
      pk: { S: `facility::${parkName}` },
      sk: { S: sk }
    },
    ExpressionAttributeValues: {
      ':statusValue': { M: AWS.DynamoDB.Converter.marshall(status) },
      ':visibility': { BOOL: visible },
      ':bookingTimes': { M: AWS.DynamoDB.Converter.marshall(bookingTimes) },
      ':bookingOpeningHour': bookingOpeningHourAttrValue,
      ':bookingDaysAhead': bookingDaysAheadAttrValue
    },
    ExpressionAttributeNames: {
      '#facilityStatus': 'status',
      '#visibility': 'visible'
    },
    UpdateExpression:
      'SET #facilityStatus =:statusValue, bookingTimes =:bookingTimes, #visibility =:visibility, bookingOpeningHour = :bookingOpeningHour, bookingDaysAhead = :bookingDaysAhead',
    ReturnValues: 'ALL_NEW',
    TableName: process.env.TABLE_NAME
  };
  const res = await dynamodb.updateItem(updateParams).promise();
  return sendResponse(200, AWS.DynamoDB.Converter.unmarshall(res.ExpressionAttributeNames));
}
