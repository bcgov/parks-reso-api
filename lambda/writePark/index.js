const AWS = require('aws-sdk');

const { dynamodb } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');
const { checkPermissions } = require('../permissionUtil');

exports.handler = async (event, context) => {
  if (!event || !event.headers) {
    return sendResponse(403, { msg: 'Unauthorized' }, context);
  }

  if (!(new Set(["POST","PUT"]).has(event.httpMethod))) {
    return sendResponse(404, { msg: 'Not Implemented' }, context);
  }

  if ((await checkPermissions(event)) === false) {
    return sendResponse(403, { msg: 'Unauthorized' }, context);
  }

  try {
    console.log(event.body);
    const obj = JSON.parse(event.body);

    // If this is a PUT operation ensure to protect against creating a new item instead of updating the old one.
    if (event.httpMethod === 'PUT') {
      return await updateItem(obj);
    } else {
      return await createItem(obj);
    }
  } catch (err) {
    console.log('err', err);
    return sendResponse(400, err, context);
  }
};

async function createItem(obj, context) {
  const { park, facilities, visible, description, ...otherProps } = obj;

  let parkObject = {
    TableName: process.env.TABLE_NAME,
    ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)'
  };

  parkObject.Item = {};
  parkObject.Item['pk'] = { S: 'park' };
  parkObject.Item['sk'] = { S: park.name };
  if (park.bcParksLink) {
    parkObject.Item['bcParksLink'] = { S: park.bcParksLink };
  }
  parkObject.Item['description'] = { S: description };
  parkObject.Item['name'] = { S: park.name };
  if (park.capacity) {
    parkObject.Item['capacity'] = AWS.DynamoDB.Converter.input(park.capacity);
  }
  parkObject.Item['status'] = { S: park.status };
  parkObject.Item['visible'] = { BOOL: visible };

  console.log('putting item:', parkObject);
  const res = await dynamodb.putItem(parkObject).promise();
  console.log('res:', res);
  return sendResponse(200, res, context);
}

async function updateItem(obj, context) {
  const { park, sk, facilities, visible, description, ...otherProps } = obj;

  let updateParams = {
    Key: {
      pk: { S: 'park' },
      sk: { S: sk },
    },
    ExpressionAttributeValues: {},
    UpdateExpression: "set",
    ReturnValues: "ALL_NEW",
    TableName: process.env.TABLE_NAME,
    ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)'
  };

  updateParams.UpdateExpression = ('bcParksLink' in obj) ? updateParams.UpdateExpression + ' bcParksLink =:bcParksLink,': updateParams.UpdateExpression
  updateParams.ExpressionAttributeValues = { ...updateParams.ExpressionAttributeValues, ...('bcParksLink' in obj) && { ':bcParksLink': AWS.DynamoDB.Converter.input(obj.bcParksLink) }};

  updateParams.UpdateExpression = ('description' in obj) ? updateParams.UpdateExpression + ' description =:description,': updateParams.UpdateExpression
  updateParams.ExpressionAttributeValues = { ...updateParams.ExpressionAttributeValues, ...('description' in obj) && { ':description': AWS.DynamoDB.Converter.input(obj.description) }};

  updateParams.UpdateExpression = ('visible' in obj) ? updateParams.UpdateExpression + ' visible =:visible,': updateParams.UpdateExpression
  updateParams.ExpressionAttributeValues = { ...updateParams.ExpressionAttributeValues, ...('visible' in obj) && { ':visible': AWS.DynamoDB.Converter.input(obj.visible) }};

  // Reserved Words
  if (obj?.park?.name) {
    updateParams.UpdateExpression = updateParams.UpdateExpression + ' #up_name =:name,';
    updateParams.ExpressionAttributeValues = {
      ...updateParams.ExpressionAttributeValues,
     ':name': AWS.DynamoDB.Converter.input(obj.park.name)
    };
    updateParams.ExpressionAttributeNames = {
      '#up_name': "name"
    }
  }
  if ('capacity' in obj) {
    updateParams.UpdateExpression = updateParams.UpdateExpression + ' #up_capacity =:capacity,';
    updateParams.ExpressionAttributeValues = {
      ...updateParams.ExpressionAttributeValues,
     ':capacity': AWS.DynamoDB.Converter.input(obj.capacity)
    };
    updateParams.ExpressionAttributeNames = {
      ...updateParams.ExpressionAttributeNames,
      '#up_capacity': "capacity"
    }
  }
  if ('status' in obj) {
    updateParams.UpdateExpression = updateParams.UpdateExpression + ' #up_status =:status,';
    updateParams.ExpressionAttributeValues = {
      ...updateParams.ExpressionAttributeValues,
     ':status': AWS.DynamoDB.Converter.input(obj.status)
    };
    updateParams.ExpressionAttributeNames = {
      ...updateParams.ExpressionAttributeNames,
      '#up_status': "status"
    };
  }

  // Trim the last , from the updateExpression
  updateParams.UpdateExpression = updateParams.UpdateExpression.slice(0, -1);

  console.log('Updating item:', updateParams);
  const res = await dynamodb.updateItem(updateParams).promise();
  console.log('res:', res);
  return sendResponse(200, res, context);
}
