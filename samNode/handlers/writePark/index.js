const { http } = require('winston');
const { dynamoClient,
  TABLE_NAME,
  sendResponse,
  logger,
  unmarshall,
  marshall,
  UpdateItemCommand,
  PutItemCommand } = require('/opt/baseLayer');
const { decodeJWT, resolvePermissions, getParkAccess } = require('/opt/permissionLayer');


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
  parkObject.Item['roles'] = {M: marshall(roles)};

  // TODO: Lookup name from database via orcs
  parkObject.Item['name'] = { S: park.name };
  if (park.capacity) {
    parkObject.Item['capacity'] ={N: park.capacity };
  }
  parkObject.Item['status'] = { S: park.status };
  parkObject.Item['winterWarning'] = { BOOL: winterWarning };
  parkObject.Item['visible'] = { BOOL: visible };
  if (park.mapLink) {
    parkObject.Item['mapLink'] = {S: park.mapLink };
  } else {
    parkObject.Item['mapLink'] = { NULL: true };
  }

  logger.debug('putting item:', parkObject);
  const command = new PutItemCommand(parkObject);
  const res = await dynamoClient.send(command);
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
    ...('description' in obj && { ':description': {S: obj.description }})
  };

  updateParams.UpdateExpression =
    'visible' in obj ? updateParams.UpdateExpression + ' visible =:visible,' : updateParams.UpdateExpression;
  updateParams.ExpressionAttributeValues = {
    ...updateParams.ExpressionAttributeValues,
    ...('visible' in obj && { ':visible': {BOOL: obj.visible }})
  };

  updateParams.UpdateExpression =
    'winterWarning' in obj
      ? updateParams.UpdateExpression + ' winterWarning =:winterWarning,'
      : updateParams.UpdateExpression;
  updateParams.ExpressionAttributeValues = {
    ...updateParams.ExpressionAttributeValues,
    ...('winterWarning' in obj && { ':winterWarning':{S: obj.winterWarning.toString() }})
  };
  // Reserved Words
  if (obj?.park?.capacity) {
    updateParams.UpdateExpression = updateParams.UpdateExpression + ' #up_capacity =:capacity,';
    updateParams.ExpressionAttributeValues = {
      ...updateParams.ExpressionAttributeValues,
      ':capacity': {N: obj.park.capacity.toString()}
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
      ':status': {S: obj.park.status}
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
      ':bcParksLink': {S: obj.park.bcParksLink}
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
      ':mapLink': {S: obj.park.mapLink}
    };
  } else {
    updateParams.ExpressionAttributeValues = {
      ...updateParams.ExpressionAttributeValues,
      ':mapLink': { NULL: true }
    };
  }

  updateParams.UpdateExpression = updateParams.UpdateExpression + ' videoLink =:videoLink,';
  if (obj?.park?.videoLink) {
    updateParams.ExpressionAttributeValues = {
      ...updateParams.ExpressionAttributeValues,
      ':videoLink': {S: obj.park.videoLink}
    };
  } else {
    updateParams.ExpressionAttributeValues = {
      ...updateParams.ExpressionAttributeValues,
      ':videoLink': { NULL: true }
    };
  }

  updateParams.UpdateExpression = updateParams.UpdateExpression + ' specialClosure =:specialClosure,';
  if (obj?.park?.specialClosure) {
    updateParams.ExpressionAttributeValues = {
      ...updateParams.ExpressionAttributeValues,
      ':specialClosure': { BOOL: obj.park.specialClosure }
    };
  } else {
    updateParams.ExpressionAttributeValues = {
      ...updateParams.ExpressionAttributeValues,
      ':specialClosure': { NULL: true }
    };
  }


 updateParams.UpdateExpression = updateParams.UpdateExpression + ' specialClosureText =:specialClosureText,';
 if (obj?.park?.specialClosureText) {
   updateParams.ExpressionAttributeValues = {
     ...updateParams.ExpressionAttributeValues,
     ':specialClosureText': {S: obj.park.specialClosureText }
   };
 } else {
   updateParams.ExpressionAttributeValues = {
     ...updateParams.ExpressionAttributeValues,
     ':specialClosureText': { NULL: true }
   };
 }

  // Trim the last , from the updateExpression
  updateParams.UpdateExpression = updateParams.UpdateExpression.slice(0, -1);
  logger.debug('Updating item:', updateParams);
  const command = new UpdateItemCommand(updateParams);
  const { Attributes } = await dynamoClient.send(command);
  logger.info('Results:', Attributes);
  return sendResponse(200, unmarshall(Attributes), context);
}
