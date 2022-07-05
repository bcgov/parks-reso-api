'use strict';
const { runScan, TABLE_NAME, dynamodb } = require('../lambda/dynamoUtil');

exports.up = async function (dbOptions) {
  await updateAllPasses();
};

// add creationDate and isOverbooked to all passes. 
async function updateAllPasses() {
  const scanObj = {
    TableName: TABLE_NAME,
    ConsistentRead: true,
    ExpressionAttributeNames: {
      '#pk': 'pk'
    },
    ExpressionAttributeValues: {
      ':pk': { S: 'pass::' }
    },
    FilterExpression: 'begins_with(#pk, :pk)'
  };

  let errors = [];
  let completed = [];

  try {
    const passes = await runScan(scanObj);

    for (const pass of passes) {

      const updateObj = {
        TableName: TABLE_NAME,
        Key: {
          pk: { S: pass.pk },
          sk: { S: pass.sk }
        },
        ExpressionAttributeNames: {
          '#isOverbooked': 'isOverbooked',
          '#creationDate': 'creationDate'
        },
        ExpressionAttributeValues: {
          ':isOverbooked': { BOOL: false},
          ':creationDate': { S: pass.date }
        },
        UpdateExpression: 'set #isOverbooked = :isOverbooked, #creationDate = :creationDate',
        ReturnValues: 'ALL_NEW'
      };
      try {
        const passData = await dynamodb.updateItem(updateObj).promise();
        completed.push(passData.Attributes?.sk);
      } catch (err) {
        console.log('ERROR:', err);
        errors.push(pass.sk);
      };
    }
  } catch (err) {
    console.log('ERROR:', err);
    return null;
  };
  console.log("------------------------------------------------------------------");
  console.log(`Successfully updated ${completed.length} passes. \n`)
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
