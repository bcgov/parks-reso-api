'use strict';
const { TABLE_NAME, dynamodb, runQuery } = require('../lambda/dynamoUtil');

exports.up = async function (dbOptions) {
  await updateAllFacilities();
};

// Adds isUpdating attribute to all facilities
async function updateAllFacilities() {

  console.log('Adding isUpdating attribute to all facilities');

  // get all parks
  const parkQueryObj = {
    TableName: TABLE_NAME,
    ConsistentRead: true,
    ExpressionAttributeNames: {
      '#pk': 'pk'
    },
    ExpressionAttributeValues: {
      ':pk': { S: 'park' }
    },
    KeyConditionExpression: '#pk = :pk'
  };

  let errors = [];
  let completed = [];

  // get all facilities within each park
  try {
    const parks = await runQuery(parkQueryObj);

    let facilities = [];

    for (const park of parks) {
      const facilityPk = `facility::${park.sk}`;
      const facilityQueryObj = {
        TableName: TABLE_NAME,
        ConsistentRead: true,
        ExpressionAttributeNames: {
          '#pk': 'pk'
        },
        ExpressionAttributeValues: {
          ':pk': { S: facilityPk }
        },
        KeyConditionExpression: '#pk = :pk'
      };

      try {
        const parkFacilities = await runQuery(facilityQueryObj);
        if (parkFacilities.length > 0) {
          for (const facility of parkFacilities) {
            facilities.push(facility);
          }
        }
      } catch (err) {
        console.log('ERROR:', err);
      }
    }

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
  for (const item of errors) {
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
