const AWS = require('aws-sdk');

const { dynamodb, TABLE_NAME } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');
const { decodeJWT, resolvePermissions, getParkAccess } = require('../permissionUtil');
const { logger } = require('../logger');

exports.handler = async (event, context) => {
  if (!event || !event.headers) {
    logger.info('Unauthorized');
    return sendResponse(403, { msg: 'Unauthorized' }, context);
  }

  if (!new Set(['POST', 'PUT']).has(event.httpMethod)) {
    logger.info('Not Implemented');
    return sendResponse(405, { msg: 'Not Implemented' }, context);
  }

  const token = await decodeJWT(event);
  const permissionObject = resolvePermissions(token);

  if (permissionObject.isAuthenticated !== true) {
    logger.info('Unauthorized');
    return sendResponse(403, { msg: 'Unauthorized' }, context);
  }

  try {
    logger.debug(event.body);
    const obj = JSON.parse(event.body);

    // If this is a PUT operation ensure to protect against creating a new item instead of updating the old one.
    if (event.httpMethod === 'PUT') {
      // Ensure PO's can update this particular park.
      if (!permissionObject.isAdmin) {
        await getParkAccess(obj.sk, permissionObject);
      }
      return await updateItem(obj);
    } else {
      // Only let admins create parks.
      if (permissionObject.isAdmin) {
        return await createItem(obj);
      } else {
        logger.info('Unauthorized');
        throw 'Unauthorized Access.';
      }
    }
  } catch (err) {
    logger.error('err', err);
    return sendResponse(400, err, context);
  }
};

async function createItem(obj, context) {
  const { park, facilities, visible, winterWarning = false, description, ...otherProps } = obj;

  let parkObject = {
    TableName: TABLE_NAME,
    ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)'
  };

  parkObject.Item = {};
  parkObject.Item['pk'] = { S: 'park' };
  // This should be an orcs
  parkObject.Item['sk'] = { S: park.orcs };
  if (park.bcParksLink) {
    parkObject.Item['bcParksLink'] = { S: park.bcParksLink };
  }
  parkObject.Item['description'] = { S: description };
  parkObject.Item['orcs'] = { S: park.orcs };
  const roles = ['sysadmin', `${park.orcs}`];
  parkObject.Item['roles'] = AWS.DynamoDB.Converter.input(roles);

  // TODO: Lookup name from database via orcs
  parkObject.Item['name'] = { S: park.name };
  if (park.capacity) {
    parkObject.Item['capacity'] = AWS.DynamoDB.Converter.input(park.capacity);
  }
  parkObject.Item['status'] = { S: park.status };
  parkObject.Item['winterWarning'] = { BOOL: winterWarning };
  parkObject.Item['visible'] = { BOOL: visible };
  if (park.mapLink) {
    parkObject.Item['mapLink'] = AWS.DynamoDB.Converter.input(park.mapLink);
  } else {
    parkObject.Item['mapLink'] = { NULL: true };
  }

  logger.debug('putting item:', parkObject);
  const res = await dynamodb.putItem(parkObject).promise();
  logger.info('Results:', res.length);
  logger.debug('res:', res);
  return sendResponse(200, res, context);
}

async function updateItem(obj, context) {
  const { park, sk, facilities, visible, description, winterWarning, ...otherProps } = obj;

  let updateParams = {
    Key: {
      pk: { S: 'park' },
      sk: { S: sk }
    },
    ExpressionAttributeValues: {},
    UpdateExpression: 'set',
    ReturnValues: 'ALL_NEW',
    TableName: TABLE_NAME,
    ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)'
  };

  updateParams.UpdateExpression =
    'description' in obj
      ? updateParams.UpdateExpression + ' description =:description,'
      : updateParams.UpdateExpression;
  updateParams.ExpressionAttributeValues = {
    ...updateParams.ExpressionAttributeValues,
    ...('description' in obj && { ':description': AWS.DynamoDB.Converter.input(obj.description) })
  };

  updateParams.UpdateExpression =
    'visible' in obj ? updateParams.UpdateExpression + ' visible =:visible,' : updateParams.UpdateExpression;
  updateParams.ExpressionAttributeValues = {
    ...updateParams.ExpressionAttributeValues,
    ...('visible' in obj && { ':visible': AWS.DynamoDB.Converter.input(obj.visible) })
  };

  updateParams.UpdateExpression =
    'winterWarning' in obj
      ? updateParams.UpdateExpression + ' winterWarning =:winterWarning,'
      : updateParams.UpdateExpression;
  updateParams.ExpressionAttributeValues = {
    ...updateParams.ExpressionAttributeValues,
    ...('winterWarning' in obj && { ':winterWarning': AWS.DynamoDB.Converter.input(obj.winterWarning) })
  };
  // Reserved Words
  if (obj?.park?.name) {
    updateParams.UpdateExpression = updateParams.UpdateExpression + ' #up_name =:name,';
    updateParams.ExpressionAttributeValues = {
      ...updateParams.ExpressionAttributeValues,
      ':name': AWS.DynamoDB.Converter.input(obj.park.name)
    };
    updateParams.ExpressionAttributeNames = {
      '#up_name': 'name'
    };
  }
  if (obj?.park?.capacity) {
    updateParams.UpdateExpression = updateParams.UpdateExpression + ' #up_capacity =:capacity,';
    updateParams.ExpressionAttributeValues = {
      ...updateParams.ExpressionAttributeValues,
      ':capacity': AWS.DynamoDB.Converter.input(obj.park.capacity)
    };
    updateParams.ExpressionAttributeNames = {
      ...updateParams.ExpressionAttributeNames,
      '#up_capacity': 'capacity'
    };
  }
  if (obj?.park?.status) {
    updateParams.UpdateExpression = updateParams.UpdateExpression + ' #up_status =:status,';
    updateParams.ExpressionAttributeValues = {
      ...updateParams.ExpressionAttributeValues,
      ':status': AWS.DynamoDB.Converter.input(obj.park.status)
    };
    updateParams.ExpressionAttributeNames = {
      ...updateParams.ExpressionAttributeNames,
      '#up_status': 'status'
    };
  }

  updateParams.UpdateExpression = updateParams.UpdateExpression + ' bcParksLink =:bcParksLink,';
  if (obj?.park?.bcParksLink) {
    updateParams.ExpressionAttributeValues = {
      ...updateParams.ExpressionAttributeValues,
      ':bcParksLink': AWS.DynamoDB.Converter.input(obj.park.bcParksLink)
    };
  } else {
    updateParams.ExpressionAttributeValues = {
      ...updateParams.ExpressionAttributeValues,
      ':bcParksLink': { NULL: true }
    };
  }

  updateParams.UpdateExpression = updateParams.UpdateExpression + ' mapLink =:mapLink,';
  if (obj?.park?.mapLink) {
    updateParams.ExpressionAttributeValues = {
      ...updateParams.ExpressionAttributeValues,
      ':mapLink': AWS.DynamoDB.Converter.input(obj.park.mapLink)
    };
  } else {
    updateParams.ExpressionAttributeValues = {
      ...updateParams.ExpressionAttributeValues,
      ':mapLink': { NULL: true }
    };
  }

  // Trim the last , from the updateExpression
  updateParams.UpdateExpression = updateParams.UpdateExpression.slice(0, -1);

  logger.debug('Updating item:', updateParams);
  const { Attributes } = await dynamodb.updateItem(updateParams).promise();
  logger.info('Results:', Attributes);
  return sendResponse(200, AWS.DynamoDB.Converter.unmarshall(Attributes), context);
}
