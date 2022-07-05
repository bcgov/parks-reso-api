'use strict';
const AWS = require('aws-sdk');
const { runScan, TABLE_NAME, dynamodb } = require('../lambda/dynamoUtil');
const { DateTime } = require('luxon');

exports.up = async function (dbOptions) {
  await updateAllFacilities();
};

// Adds isUpdating attribute to all facilities
async function updateAllFacilities() {
  const scanObj = {
    TableName: TABLE_NAME,
    ConsistentRead: true,
    ExpressionAttributeNames: {
      '#pk': 'pk'
    },
    ExpressionAttributeValues: {
      ':pk': { S: 'facility::' }
    },
    FilterExpression: 'begins_with(#pk, :pk)'
  };

  let errors = [];
  let completed = [];

  try {
    const facilities = await runScan(scanObj);

    for (const facility of facilities) {
      const updateObj = {
        TableName: TABLE_NAME,
        Key: {
          pk: { S: facility.pk },
          sk: { S: facility.sk }
        },
        UpdateExpression: 'set #isUpdating = :isUpdating',
        ExpressionAttributeNames: {
          '#isUpdating': 'isUpdating'
        },
        ExpressionAttributeValues: {
          ':isUpdating': { BOOL: false },
        },
        ReturnValues: 'ALL_NEW'
      };
      try {
        const facilityData = await dynamodb.updateItem(updateObj).promise();
        console.log('Updated facility:', facilityData.Attributes?.name?.S);
        completed.push(facilityData.Attributes?.name?.S);
      } catch (err) {
        console.log('ERROR:', err);
        console.log('Failed to update facility:', facility.name);
        errors.push(facility.name);
      };
    }
  } catch (err) {
    console.log('ERROR:', err);
    return null;
  };
  console.log("------------------------------------------------------------------");
  console.log(`Successfully updated ${completed.length} facilities. \n`)
  process.stdout.write(`Failed to update ${errors.length}\n`);
  let firstTime = true;
  for(const item of errors) {
    if (firstTime) {
      console.log("Failed Items:");
      firstTime = false;
    }
    process.stdout.write(`${item} `);
  }
  console.log();
  console.log("------------------------------------------------------------------");
}



exports.down = async function (dbOptions) { };
