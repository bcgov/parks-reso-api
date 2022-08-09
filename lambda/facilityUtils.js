const AWS = require('aws-sdk');
const { dynamodb, TABLE_NAME } = require('./dynamoUtil');
const { logger } = require('./logger');

async function setFacilityLock(pk, sk) {
  const facilityLockObject = {
    TableName: TABLE_NAME,
    Key: {
      pk: { S: pk },
      sk: { S: sk }
    },
    ExpressionAttributeValues: {
      ':isUpdating': AWS.DynamoDB.Converter.input(true),
      ':false': AWS.DynamoDB.Converter.input(false)
    },
    UpdateExpression: 'SET isUpdating = :isUpdating',
    ConditionExpression: 'isUpdating = :false',
    ReturnValues: 'ALL_NEW'
  };
  try {
    logger.debug('facilityLockObject', facilityLockObject);
    const { Attributes } = await dynamodb.updateItem(facilityLockObject).promise();
    return AWS.DynamoDB.Converter.unmarshall(Attributes);
  } catch (error) {
    logger.error(error);
    throw {
      msg: 'This item is being updated by someone else. Please try again later.',
      title: 'Sorry, we are unable to fill your specific request.'
    };
  }
}

async function unlockFacility(pk, sk) {
  try {
    const facilityLockObject = {
      TableName: TABLE_NAME,
      Key: {
        pk: { S: pk },
        sk: { S: sk }
      },
      ExpressionAttributeValues: {
        ':isUpdating': AWS.DynamoDB.Converter.input(false)
      },
      UpdateExpression: 'SET isUpdating = :isUpdating',
      ReturnValues: 'ALL_NEW'
    };
    logger.debug('facilityLockObject', facilityLockObject);
    await dynamodb.updateItem(facilityLockObject).promise();
  } catch (error) {
    logger.error(error);
    // TODO: Retry this until we can unlock facility.
    return sendResponse(400, {
      msg: 'Failed to unlock facility. Please alert a developer as soon as possible.',
      title: 'Sorry, we are unable to fill your specific request.'
    });
  }
}

module.exports = {
  setFacilityLock,
  unlockFacility
};
