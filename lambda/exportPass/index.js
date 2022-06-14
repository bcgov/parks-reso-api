const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const csvjson = require('csvjson');
const { runQuery, TIMEZONE } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');
const { decodeJWT, resolvePermissions } = require('../permissionUtil');
const { DateTime } = require('luxon');

exports.handler = async (event, context) => {
  console.log('Export Pass', event);
  console.log('event.queryStringParameters', event.queryStringParameters);

  let queryObj = {
    TableName: process.env.TABLE_NAME
  };

  try {
    if (!event.queryStringParameters) {
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }
    if (event.queryStringParameters.facilityName && event.queryStringParameters.park) {

      const token = await decodeJWT(event);
      const permissionObject = resolvePermissions(token);
      if (permissionObject.isAdmin !== true) {
        return sendResponse(403, { msg: 'Unauthorized' });
      }
      // Get all the passes for a specific facility
      queryObj.ExpressionAttributeValues = {};
      queryObj.ExpressionAttributeValues[':pk'] = { S: 'pass::' + event.queryStringParameters.park };
      queryObj.ExpressionAttributeValues[':facilityName'] = { S: event.queryStringParameters.facilityName };
      queryObj.KeyConditionExpression = 'pk =:pk';
      queryObj.FilterExpression = 'facilityName =:facilityName';

      // Filter Date
      if (event.queryStringParameters.date) {
        const dateselector = DateTime.fromISO(event.queryStringParameters.date).setZone(TIMEZONE).toISODate();
        queryObj = checkAddExpressionAttributeNames(queryObj);
        queryObj.ExpressionAttributeNames['#theDate'] = 'date';
        queryObj.ExpressionAttributeValues[':theDate'] = AWS.DynamoDB.Converter.input(dateselector);
        queryObj.FilterExpression += ' AND contains(#theDate, :theDate)';
      }
      // Filter Multiple Statuses
      if (event.queryStringParameters.passStatus) {
        const statusList = event.queryStringParameters.passStatus.split(',');
        const statusObj = {};
        for (let [index, status] of statusList.entries()) {
          const statusName = ":passStatus" + index;
          statusObj[statusName.toString()] = AWS.DynamoDB.Converter.input(status);
        }
        queryObj = checkAddExpressionAttributeNames(queryObj);
        queryObj.ExpressionAttributeNames['#theStatus'] = 'passStatus';
        Object.assign(queryObj.ExpressionAttributeValues, statusObj);
        queryObj.FilterExpression += ' AND #theStatus IN (' + Object.keys(statusObj).toString() + ')';
      }
      // Filter reservation number
      if (event.queryStringParameters.reservationNumber) {
        queryObj.ExpressionAttributeValues[':sk'] = { S: event.queryStringParameters.reservationNumber };
        queryObj.KeyConditionExpression += ' AND sk =:sk';
      }
      // Filter first/last
      if (event.queryStringParameters.firstName) {
        queryObj = checkAddExpressionAttributeNames(queryObj);
        queryObj.ExpressionAttributeNames['#firstName'] = 'firstName';
        queryObj.ExpressionAttributeValues[':firstName'] = AWS.DynamoDB.Converter.input(
          event.queryStringParameters.firstName
        );
        queryObj.FilterExpression += ' AND #firstName =:firstName';
      }
      if (event.queryStringParameters.lastName) {
        queryObj = checkAddExpressionAttributeNames(queryObj);
        queryObj.ExpressionAttributeNames['#lastName'] = 'lastName';
        queryObj.ExpressionAttributeValues[':lastName'] = AWS.DynamoDB.Converter.input(
          event.queryStringParameters.lastName
        );
        queryObj.FilterExpression += ' AND #lastName =:lastName';
      }
      // Filter email
      if (event.queryStringParameters.email) {
        queryObj = checkAddExpressionAttributeNames(queryObj);
        queryObj.ExpressionAttributeNames['#email'] = 'email';
        queryObj.ExpressionAttributeValues[':email'] = AWS.DynamoDB.Converter.input(
          event.queryStringParameters.email
        );
        queryObj.FilterExpression += ' AND #email =:email';
      }

      console.log('queryObj:', queryObj);
      
      let scanResults = [];
      do {
        passData = await runQuery(queryObj, true);
        passData.data.forEach((item) => scanResults.push(item));
        queryObj.ExclusiveStartKey  = passData.LastEvaluatedKey;
      } while(typeof passData.LastEvaluatedKey !== "undefined");

      // Convert into CSV and deploy.
      const csvData = csvjson.toCSV(scanResults);

      // Write to S3.
      // TODO: In future, token.data.idir_userid needs to be something else unique,
      // as we will have BCeID/BCSC card IDPs generating exports.
      const params = {
        Bucket : process.env.S3_BUCKET_DATA,
        Key: '/' + token.data.idir_userid + '/passExport.csv',
        Body : csvData
      }
      const expiryTime = 60*15; // 15 minutes
      let res = null;
      try {
        // Upload file
        res = await s3.putObject(params).promise();

        // Generate URL.
        const URL = await s3.getSignedUrl('getObject', {
          Bucket: process.env.S3_BUCKET_DATA,
          Expires: expiryTime,
          Key: '/' + token.data.idir_userid + '/passExport.csv',
        });
        console.log("URL:", URL);
        return sendResponse(200, { signedURL: URL }, context);
      } catch (e) {
        console.log("Error uploading to S3.", e);
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

const checkAddExpressionAttributeNames = function (queryObj) {
  if (!queryObj.ExpressionAttributeNames) {
    queryObj.ExpressionAttributeNames = {};
  }
  return queryObj;
};