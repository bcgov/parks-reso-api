const AWS = require('aws-sdk');

const { getParks, runQuery, getFacilities } = require('../lambda/dynamoUtil');

const TABLE_NAME = process.env.TABLE_NAME || 'parksreso';

const options = {
  region: 'ca-central-1',
  endpoint: 'http://localhost:8000'
};

const dynamodb = new AWS.DynamoDB(options);

// remove all passes and reservation objects so we can reduce the local DB size when favorable.
// obviously this is an extremely destructive operation so use with caution.

async function deletePasses() {
  try {
    console.log('Deleting passes...')
    // get all passes
    const parks = await getParks();
    let passes = [];

    for (const park of parks) {
      const passPk = `pass::${park.sk}`;
      const passQueryObj = {
        TableName: TABLE_NAME,
        ConsistentRead: true,
        ExpressionAttributeValues: {
          ':pk': { S: passPk },
        },
        KeyConditionExpression: 'pk = :pk',
      };
      try {
        const parkPasses = await runQuery(passQueryObj);
        if (parkPasses.length > 0) {
          passes.push(parkPasses);
        }
      } catch (err) {
        console.log('ERROR getting Passes:', err);
      }
    };

    await deleteAll(passes);
  } catch (err) {
    console.log('Error deleting passes:', err);
  }
}

async function deleteResObjects() {
  try {
    console.log('Deleting reservation objects...')
    // get all passes
    // get all resObjects
    const parks = await getParks();
    let facilities = [];
    for (let park of parks) {
      facilities = facilities.concat(await getFacilities(park.sk));
    };

    let resObjs = [];

    for (const facility of facilities) {
      const resObjPk = `reservation::${facility.parkName}::${facility.name}`;
      const resObjQueryObj = {
        TableName: TABLE_NAME,
        ConsistentRead: true,
        ExpressionAttributeValues: {
          ':pk': { S: resObjPk },
        },
        KeyConditionExpression: 'pk = :pk',
      };
      try {
        const facilityResObjs = await runQuery(resObjQueryObj);
        if (facilityResObjs.length > 0) {
          resObjs.push(facilityResObjs);
        }
      } catch (err) {
        console.log('ERROR getting Reservation Objects:', err);
      }
    };

    await deleteAll(resObjs);
  } catch (err) {
    console.log('Error deleting reservation objects:', err);
  }
}

async function deleteAll(lists) {
  let totalComplete = 0;
  let totalErrors = 0;

  for (list of lists) {
    let completed = 0;
    let errors = 0;
    let max = list.length;
    console.log(`Deleting items with pk: ${list[0].pk}`)
    while (list.length) {
      const obj = list.pop();
      const deleteObj = {
        TableName: TABLE_NAME,
        Key: {
          pk: { S: obj.pk },
          sk: { S: obj.sk },
        },
      }
      try {
        const res = await dynamodb.deleteItem(deleteObj).promise();
        completed++;
        totalComplete++;
        if (completed % 100 == 0) {
          const percent = (completed / max) * 100;
          process.stdout.write(` Deleting... ${completed}/${max} completed (${percent.toFixed(1)}%)\r`);
        }
      } catch (err) {
        console.log('ERROR deleting object:', err);
        errors++;
        totalErrors++;
      }
    }
    process.stdout.clearLine()
  }
  console.log('Total complete:', totalComplete);
  console.log('Total Errors:', totalErrors);
}

async function run() {
  await deletePasses();
  await deleteResObjects();
};

run();