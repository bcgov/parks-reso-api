'use strict';
const AWS = require('aws-sdk');

exports.up = async function (dbOptions) {
  /*
resCount Refactoring - this migration updates existing facilities to turn the 'reservations' column 
(which was previously an array) into individual records.  This allows the system to exclude records 
in the past.  

To run locally: Ensure your dyanmodb-local db is running in a docker instance or similar.

`yarn migrate up`

To run in AWS environment: Configure AWS credentials to target AWS env.

`yarn migrate up`
*/
  const TABLE_NAME = process.env.TABLE_NAME || 'parksreso';
  const dynamodb = new AWS.DynamoDB(dbOptions);

  // get all the parks
  let parksQueryObj = {
    TableName: TABLE_NAME,
    ExpressionAttributeValues: {
      ':pk': { S: 'park' }
    },
    KeyConditionExpression: 'pk =:pk'
  };
  const parks = await dynamodb.query(parksQueryObj).promise();

  // loop through the parks
  for (let park of parks.Items) {
    // get the facilities for each park
    let facilitiesQueryObj = {
      TableName: TABLE_NAME,
      ExpressionAttributeValues: {
        ':pk': { S: `facility::${park.sk.S}` }
      },
      KeyConditionExpression: 'pk =:pk'
    };
    const facilities = await dynamodb.query(facilitiesQueryObj).promise();

    // loop through the facilities
    for (const facility of facilities.Items) {
      let rowsInserted = 0;
      const parkName = facility.pk.S.split('::')[1];
      const facilityName = facility.sk.S;
      console.log(`${parkName}::${facilityName}`);

      // rewrite the reservations array items from each facility as individual 'rescount' records
      if (facility.reservations) {
        const reservations = facility.reservations.M;

        for (const dateselector of Object.keys(reservations)) {
          // only use dates in YYYY-MM-DD format (there is some irregular data in the dev environment)
          if (dateselector.length === 10 && dateselector.indexOf('-') > -1) {
            // insert a rescount record for each park/facility/date
            let insertResCount = {
              TableName: TABLE_NAME
            };
            insertResCount.Item = {};
            insertResCount.Item['pk'] = { S: `rescount::${parkName}::${facilityName}` };
            insertResCount.Item['sk'] = { S: dateselector };
            insertResCount.Item['reservations'] = reservations[dateselector];

            try {
              await dynamodb.putItem(insertResCount).promise();
              rowsInserted++;
            } catch (e) {
              console.log('error adding rescount', e);
            }
          }
        }

        console.log(`  - ${rowsInserted} rows inserted`);

        // remove the reservations from the facility
        facility.reservations = undefined;
        const updateObj = {
          TableName: TABLE_NAME,
          Item: facility
        };

        try {
          await dynamodb.putItem(updateObj).promise();
          console.log('  - reservations column removed');
        } catch (e) {
          console.log('error removing reservations column', e);
        }
      }
    }
  }
};

exports.down = async function (dbOptions) {};
