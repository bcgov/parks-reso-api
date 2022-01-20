'use strict';
const AWS = require('aws-sdk');

exports.up = async function (dbOptions) {
  const TABLE_NAME = process.env.MIGRATIONS_TABLE_NAME || 'parksreso';
  const dynamodb = new AWS.DynamoDB(dbOptions);
  exports.dynamodb = new AWS.DynamoDB();

  const args = process.argv;
  let showFailures = false;

  // TODO: Set this as a config in dbOptions
  if (args.includes('show-failures')) {
    showFailures = true;
  }

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

  async function updatePasses(passList) {
    console.log('collected ' + passList.length + ' passes...');
    let updatedItems = [];
    let failedItems = [];
    let failureCount = 0;
    let skippedCount = 0;
    for (let item of passList) {
      if (item.date && item.pk && item.sk && !item.shortPassDate) {
        const updateObj = {
          TableName: TABLE_NAME,
          Key: {
            pk: { S: item.pk },
            sk: { S: item.sk }
          },
          UpdateExpression: 'set #shortPassDate = :shortPassDate',
          ExpressionAttributeNames: {
            '#shortPassDate': 'shortPassDate'
          },
          ExpressionAttributeValues: {
            ':shortPassDate': { S: new Date(item.date).toISOString().split('T')[0] }
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

  async function run() {
    const allPasses = await getAllPasses();
    await updatePasses(allPasses);
    console.log('--------');
    console.log('Done.');
  }

  run();
};

exports.down = async function (dbOptions) {};
