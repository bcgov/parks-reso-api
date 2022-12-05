'use strict';
 
const AWS = require('aws-sdk');
const { TABLE_NAME, dynamodb, getParks } = require('../lambda/dynamoUtil');
 
exports.up = async function (dbOptions) {
  await addWinterWarning()
};
 
// update all parks with winterWarning boolean field.
// for Seymour, set to true
async function addWinterWarning() {
  let parks = [];
 
  try {
    // get all facilities
    parks = await getParks();
  } catch (error) {
    console.log('ERROR:', error);
  }
 
  let errors = [];
  let completed = [];
 
  for (const park of parks) {
    const updateObj = {
      TableName: TABLE_NAME,
      Key: {
        pk: { S: park.pk },
        sk: { S: park.sk },
      },
      UpdateExpression: 'set winterWarning = :winterWarning',
      ExpressionAttributeValues: {
        ':winterWarning': { BOOL: false }
      },
      ReturnValues: 'ALL_NEW'
    }
    try {
      const parkRes = await dynamodb.updateItem(updateObj).promise();
      console.log('Updated park:', parkRes.Attributes?.name?.S);
      completed.push(parkRes.Attributes?.name?.S);
    } catch (error) {
      console.log('ERROR:', error);
      console.log('Failed to update park:', park.name);
      errors.push(park.name);
    }
  }
 
  resultReport(completed, errors);
 
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
 
exports.down = async function (dbOptions) {};
