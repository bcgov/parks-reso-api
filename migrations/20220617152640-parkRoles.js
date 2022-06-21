'use strict';
const AWS = require('aws-sdk');
const { runQuery, TABLE_NAME, dynamodb } = require('../lambda/dynamoUtil');

const readXlsxFile = require('read-excel-file/node');

const schema = {
  'ORCS Number': {
    prop: 'ORCS Number',
    type: String
  },
  'Park': {
    prop: 'Park',
    type: String
  },
  'Park Sub Area': {
    prop: 'Park Sub Area',
    type: String
  },
  'Frontcountry Camping': {
    prop: 'Frontcountry Camping',
    type: String
  },
  'Backcountry Camping': {
    prop: 'Backcountry Camping',
    type: String
  },
  'Group Camping': {
    prop: 'Group Camping',
    type: String
  },
  'Day Use': {
    prop: 'Day Use',
    type: String
  },
  'Boating': {
    prop: 'Boating',
    type: String
  },
  'Frontcountry Cabins': {
    prop: 'Frontcountry Cabins',
    type: String
  },
  'Backcountry Cabins': {
    prop: 'Backcountry Cabins',
    type: String
  },
  'Section': {
    prop: 'Section',
    type: String
  },
  'Management Area': {
    prop: 'Management Area',
    type: String
  },
  'Bundle': {
    prop: 'Bundle',
    type: String
  },
  'Region': {
    prop: 'Region',
    type: String
  },
  'Sub Area ID': {
    prop: 'Sub Area ID',
    type: String
  }
}

exports.up = async function (dbOptions) {
  await updateAllParks();
};

async function updateAllParks() {
  const queryObj = {
    TableName: TABLE_NAME,
    ConsistentRead: true,
    ExpressionAttributeValues: {
      ':pk': {
        S: 'park'
      }
    },
    KeyConditionExpression: 'pk =:pk'
  };

  let errors = []
  let completed = [];

  try {
    const parks = await runQuery(queryObj);

    for(const park of parks) {
      const orcsToAdd = await getOrcsToAdd(park.name.replace(' Provincial', ''));

      const roles = ['sysadmin', `${orcsToAdd}`];

      const updateObj = {
        TableName: TABLE_NAME,
        Key: {
          pk: { S: park.pk },
          sk: { S: park.sk }
        },
        UpdateExpression: 'set orcs = :orcs, #roles = :roles',
        ExpressionAttributeNames: {
          '#roles': 'roles'
        },
        ExpressionAttributeValues: {
          ':orcs': AWS.DynamoDB.Converter.input(orcsToAdd),
          ':roles': AWS.DynamoDB.Converter.input(roles)
        },
        ReturnValues: 'ALL_NEW'
      };
      try {
        const parkData = await dynamodb.updateItem(updateObj).promise();
        console.log("Updated Park:", parkData.Attributes?.name.S, ", orcs => ", parkData.Attributes?.orcs.S);
        completed.push(parkData.Attributes?.name.S);
      } catch (e) {
        console.log("E:", e)
        console.error("Failed to update park: ", park.name);
        errors.push(park.name);
      }
    }
  } catch (err) {
    console.error(err);
    return null;
  }
  console.log("------------------------------------------------------------------");
  console.log(`Successfully updated ${completed.length} parks.\n`);
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

async function getOrcsToAdd(parkName) {
  console.log("getting for:", parkName);
  let { rows } = await readXlsxFile('tools/Park Name Comparisons.xlsx', { schema });
  for (const row of rows) {
    if (row['Park'] === parkName) {
      // Grab the ORCS
      return row['ORCS Number'];
    }
  }
}

exports.down = async function (dbOptions) {};
