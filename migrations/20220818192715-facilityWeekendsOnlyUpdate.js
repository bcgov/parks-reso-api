'use strict';

const AWS = require('aws-sdk');
const { TABLE_NAME, dynamodb, getParks, getFacilities } = require('../lambda/dynamoUtil');

exports.up = async function (dbOptions) {
  await updateAllFacilities();
};

// update all facilities with bookingDays, bookingDaysRichText and bookableHolidays fields.
async function updateAllFacilities() {

  console.log('Adding bookingDays, bookingDaysRichText and bookableHolidays fields to all facilities.');

  let facilities = [];

  try {
    // get all facilities
    const parks = await getParks();
    for (const park of parks) {
      const parkFacilities = await getFacilities(park.name);
      if (parkFacilities.length > 0) {
        facilities = facilities.concat(parkFacilities);
      }
    }

  } catch (error) {
    console.log('ERROR:', error);
  }

  let errors = [];
  let completed = [];

  // update all facilities
  for (const facility of facilities) {
    const updateObj = {
      TableName: TABLE_NAME,
      Key: {
        pk: { S: facility.pk },
        sk: { S: facility.sk },
      },
      UpdateExpression: 'set bookingDays = :bookingDays, bookingDaysRichText = :bookingDaysRichText, bookableHolidays = :bookableHolidays',
      ExpressionAttributeValues: {
        ':bookingDays': { M: AWS.DynamoDB.Converter.marshall(defaultBookingDays()) },
        ':bookingDaysRichText': { S: '' },
        ':bookableHolidays': { L: [] }
      },
      ReturnValues: 'ALL_NEW'
    }
    try {
      const facilityRes = await dynamodb.updateItem(updateObj).promise();
      console.log('Updated facility:', facilityRes.Attributes?.name?.S);
      completed.push(facilityRes.Attributes?.name?.S);
    } catch (error) {
      console.log('ERROR:', error);
      console.log('Failed to update facility:', facility.name);
      errors.push(facility.name);
    }
  }

  resultReport(completed, errors);

}

function defaultBookingDays() {
  return {
    "1": true,
    "2": true,
    "3": true,
    "4": true,
    "5": true,
    "6": true,
    "7": true
  };
}

function resultReport(completed, errors) {
  console.log("------------------------------------------------------------------");
  console.log(`Successfully updated ${completed.length} facilities. \n`)
  process.stdout.write(`Failed to update ${errors.length}\n`);
  let firstTime = true;
  for (const item of errors) {
    if (firstTime) {
      console.log("Failed Items:");
      firstTime = false;
    }
    process.stdout.write(`${item} \n`);
  }
  console.log();
  console.log("------------------------------------------------------------------");
}


exports.down = async function (dbOptions) { };
