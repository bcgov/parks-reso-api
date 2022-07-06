'use strict';
const { TABLE_NAME, dynamodb, runQuery } = require('../lambda/dynamoUtil');

exports.up = async function (dbOptions) {
  await updateAllPasses();
};

// add creationDate and isOverbooked to all passes. 
async function updateAllPasses() {

  console.log('Adding creationDate and isOverbooked attributes to all passes')

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

  // get all passes for every park
  try {
    const parks = await runQuery(parkQueryObj);

    let passes = [];

    for (const park of parks) {
      const passPk = `pass::${park.sk}`;
      const passQueryObj = {
        TableName: TABLE_NAME,
        ConsistentRead: true,
        ExpressionAttributeNames: {
          '#pk': 'pk'
        },
        ExpressionAttributeValues: {
          ':pk': { S: passPk }
        },
        KeyConditionExpression: '#pk = :pk'
      };

      try {
        const parkPasses = await runQuery(passQueryObj);
        if (parkPasses.length > 0) {
          passes = passes.concat(parkPasses);
        }
      } catch (err) {
        console.log('ERROR:', err);
      }
    }

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
          ':isOverbooked': { BOOL: false },
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
