const AWS = require('aws-sdk');
const fs = require('fs');
const TABLE_NAME = 'parksreso';
const { updateConsoleProgress } = require('./pksk-migration/parks/common');

let startTime = new Date().getTime();
let intervalStartTime = new Date().getTime();

const parkPks = ['pass::0007', 'pass::0008', 'pass::0015', 'pass::0363'];

const dynamoDB = new AWS.DynamoDB.DocumentClient();

async function queryDynamoDB(pk) {
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: '#pk = :pk',
    FilterExpression: '#checkedIn = :checkedIn AND #date BETWEEN :startDate AND :endDate',
    ExpressionAttributeNames: {
      '#pk': 'pk', // Update this with your primary key attribute name
      '#checkedIn': 'checkedIn',
      '#date': 'date'
    },
    ExpressionAttributeValues: {
      ':pk': pk,
      ':checkedIn': true,
      ':startDate': '2023-05-01T00:00:00Z', // ISO date for May 1, 2023
      ':endDate': '2023-10-31T23:59:59Z' // ISO date for October 31, 2023
    }
  };

  let items = [];
  try {
    do {
      const data = await dynamoDB.query(params).promise();
      items = [...items, ...data.Items];
      params.ExclusiveStartKey = data.LastEvaluatedKey;
      updateConsoleProgress(startTime, intervalStartTime, 'Park progress', parkPks.indexOf(pk) + 1, parkPks.length, 1);
    } while (params.ExclusiveStartKey);
    return items
  } catch (error) {
    console.error("Unable to query. Error:", JSON.stringify(error, null, 2));
  }
}

async function run () {
  const garibaldi = await queryDynamoDB(parkPks[0]);
  const goldenEars = await queryDynamoDB(parkPks[1]);
  const mtSeymour = await queryDynamoDB(parkPks[2]);
  const joffre = await queryDynamoDB(parkPks[3]);

  console.log("garibaldi:", garibaldi.length);
  console.log("goldenEars:", goldenEars.length);
  console.log("mtSeymour:", mtSeymour.length);
  console.log("joffre:", joffre.length);

  const allData = [...garibaldi, ...goldenEars, ...mtSeymour, ...joffre];

  if (allData.length === 0) {
    console.log('No data to write to CSV');
    return;
  }

  // Define the order of the properties
  const headers = ['pk', 'sk', 'checkedInTime', 'creationDate', 'date', 'parkName', 'facilityName', 'facilityType', 'isOverbooked', 'firstName', 'lastName', 'numberOfGuests', 'email', 'registrationNumber', 'shortPassDate', 'type']; // Replace these with your actual property names

  const data = [
    headers,
    ...allData.map(item => headers.map(header => `"${item[header]}"`))
  ];

  let csvContent = data.map(e => e.join(",")).join("\n");

  fs.writeFile('output.csv', csvContent, (err) => {
    if (err) {
      console.error('Error writing to file', err);
    } else {
      console.log('Successfully wrote to output.csv');
    }
  });
};

run().then(() => {
  console.log("Done");
});
