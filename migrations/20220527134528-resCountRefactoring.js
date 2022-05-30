'use strict';
const AWS = require('aws-sdk');

exports.up = async function (dbOptions) {
  const TABLE_NAME = process.env.TABLE_NAME || 'parksreso';
  const dynamodb = new AWS.DynamoDB(dbOptions);

  // do a 'scan' query to get records where the pk starts with 'facility::'
  let queryObj = {
    TableName: TABLE_NAME,
    ConsistentRead: false,
    FilterExpression: 'begins_with(#pk, :facilityPrefix)',
    ExpressionAttributeValues: {
      ':facilityPrefix': {
        S: 'facility::'
      }
    },
    ExpressionAttributeNames: {
      '#pk': 'pk'
    }
  };
  const queryResponse = await dynamodb.scan(queryObj).promise();

  // loop through the facilities
  for (const facility of queryResponse.Items) {
    if (facility.reservations) {
      const parkName = facility.pk.S.split('::')[1];
      const facilityName = facility.sk.S;
      const reservations = facility.reservations.M;

      for (const dateselector of Object.keys(reservations)) {
        // only use dates in YYYY-MM-DD format (there is some bad data in the dev environment)
        if (dateselector.length === 10 && dateselector.indexOf('-') > -1) {
          // insert a rescount record for each park/facility/date
          let insertResCount = {
            TableName: TABLE_NAME,
            ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)'
          };
          insertResCount.Item = {};
          insertResCount.Item['pk'] = { S: `rescount::${parkName}::${facilityName}` };
          insertResCount.Item['sk'] = { S: dateselector };
          insertResCount.Item['reservations'] = reservations[dateselector];

          try {
            console.log('putting rescount:', insertResCount);
            const insertResponse = await dynamodb.putItem(insertResCount).promise();
            console.log('insertResponse:', insertResponse);
          } catch (e) {
            console.log('rescount already exists', e);
          }
        }
      }

      // remove the reservations from the facility
      facility.reservations = undefined;
      const updateObj = {
        TableName: TABLE_NAME,
        Item: facility
      };
      console.log('putting facility:', updateObj);
      const updateResponse = await dynamodb.putItem(updateObj).promise();
      console.log('updateResponse:', updateResponse);
    }
  }
};

exports.down = async function (dbOptions) {};
