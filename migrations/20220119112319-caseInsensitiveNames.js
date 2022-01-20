'use strict';
const AWS = require('aws-sdk');

exports.up = async function (dbOptions) {
  /*
Case-insensitive names - this migration is to update existing passes with new search fields: searchFirstName & searchLastName. 
These fields are copies of the firstName and lastName fields cast to lowercase characters since DynamoDB does not support case-insensitive string searching.
Passes will not update if they do not contain both firstName and lastName fields.

To run locally: Ensure your dyanmodb-local db is running in a docker instance or similar.

`export IS_OFFLINE=1`
`node caseInsensitiveNames.js`

To run in AWS environment: Configure AWS credentials to target AWS env.

`export IS_OFFLINE=0`
`node caseInsensitiveNames.js`

To revert changes (removes searchFirstName & searchLastName fields from all passes), add revert argument:

`node caseInsensitiveNames.js revert`

To list passes that failed to update or revert, add show-failures argument :

`node caseInsensitiveNames.js show-failures`
*/
  const TABLE_NAME = process.env.MIGRATIONS_TABLE_NAME || 'parksreso';

  const args = process.argv;
  let revert = false;
  let showFailures = false;

  // TODO: Set this as a config in dbOptions
  if (args.includes('show-failures')) {
    showFailures = true;
  }

  // TODO: Set this as a config in dbOptions
  if (args.includes('revert')) {
    revert = true;
  }

  const dynamodb = new AWS.DynamoDB(dbOptions);

  exports.dynamodb = new AWS.DynamoDB();

  // Scan for all passes
  async function getAllPasses() {
    const scanObj = {
      TableName: TABLE_NAME,
      ConsistentRead: true,
      ExpressionAttributeNames: {
        '#pk': 'pk'
      },
      ExpressionAttributeValues: {
        ':beginsWith': {
          S: 'pass::'
        }
      },
      FilterExpression: 'begins_with(#pk, :beginsWith)'
    };

    try {
      const res = await runScan(scanObj);
      return res;
    } catch (err) {
      console.log('Error getting passes:', err);
      return null;
    }
  }

  async function runScan(scan, paginated = false) {
    const data = await dynamodb.scan(scan).promise();
    var unMarshalled = data.Items.map(item => {
      return AWS.DynamoDB.Converter.unmarshall(item);
    });
    if (paginated) {
      return {
        LastEvaluatedKey: data.LastEvaluatedKey,
        data: unMarshalled
      };
    } else {
      return unMarshalled;
    }
  }

  async function runUpdate(update, paginated = false) {
    const data = await dynamodb.updateItem(update).promise();
    if (paginated) {
      return {
        LastEvaluatedKey: data.LastEvaluatedKey,
        data: data
      };
    } else {
      return data;
    }
  }

  // add searchFirstName and searchLastName fields to all passes
  async function updatePasses(passList) {
    console.log('collected ' + passList.length + ' passes...');
    let updatedItems = [];
    let failedItems = [];
    let failureCount = 0;
    let skippedCount = 0;
    for (let item of passList) {
      if (item.firstName && item.lastName && item.pk && item.sk) {
        const updateObj = {
          TableName: TABLE_NAME,
          Key: {
            pk: { S: item.pk },
            sk: { S: item.sk }
          },
          UpdateExpression: 'set #searchFirstName = :searchFirstName, #searchLastName = :searchLastName',
          ExpressionAttributeNames: {
            '#searchFirstName': 'searchFirstName',
            '#searchLastName': 'searchLastName'
          },
          ExpressionAttributeValues: {
            ':searchFirstName': { S: item.firstName.toLowerCase() },
            ':searchLastName': { S: item.lastName.toLowerCase() }
          },
          ReturnValues: 'ALL_NEW'
        };
        try {
          const data = await runUpdate(updateObj);
          updatedItems.push(data);
        } catch (err) {
          failureCount++;
          console.log('Error updating pass sk: ' + item.sk + '. ' + err);
          break;
        }
      } else {
        skippedCount++;
      }
    }
    if (failureCount > 0) {
      if (showFailures) {
        console.log('Failures:\n', failedItems);
      } else {
        console.log('run "node caseInsensitiveNames.js showFailures" to list failed items.');
      }
    }
    console.log('--------');
    console.log('updated ' + updatedItems.length + ' items.');
    console.log(failureCount + ' failures.');
    console.log(skippedCount + ' passes were skipped for missing necessary fields.');
  }

  // remove searchFirstName and searchLastName fields from all passes
  async function revertPasses(passList) {
    console.log('collected ' + passList.length + ' passes...');
    let updatedItems = [];
    let failedItems = [];
    let failureCount = 0;
    let skippedCount = 0;
    for (let item of passList) {
      if (item.searchFirstName && item.searchLastName && item.pk && item.sk) {
        const revertObj = {
          TableName: TABLE_NAME,
          Key: {
            pk: { S: item.pk },
            sk: { S: item.sk }
          },
          UpdateExpression: 'remove #searchFirstName, #searchLastName',
          ExpressionAttributeNames: {
            '#searchFirstName': 'searchFirstName',
            '#searchLastName': 'searchLastName'
          },
          ReturnValues: 'ALL_NEW'
        };
        try {
          const data = await runUpdate(revertObj);
          updatedItems.push(data);
        } catch (err) {
          console.log('Error removing pass sk: ' + item.sk + '. ' + err);
          failedItems.push(item);
          failureCount++;
          break;
        }
      } else {
        skippedCount++;
      }
    }
    if (failureCount > 0) {
      if (showFailures) {
        console.log(failedItems);
      } else {
        console.log('run "node caseInsensitiveNames.js showFailures" to list failed items.');
      }
    }
    console.log('--------');
    console.log('reverted ' + updatedItems.length + ' items.');
    console.log(failureCount + ' failures.');
    console.log(skippedCount + ' passes were skipped for missing necessary fields.');
  }

  async function run() {
    const allPasses = await getAllPasses();
    if (revert) {
      console.log('REVERTING case-insensitive search fields for firstName & lastName...');
      await revertPasses(allPasses);
    } else {
      console.log('ADDING case-insensitive search fields for firstName & lastName...');
      await updatePasses(allPasses);
    }
    console.log('--------');
    console.log('Done.');
  }

  run();
};

exports.down = async function (dbOptions) {};
