'use strict';
const AWS = require('aws-sdk');
const { TABLE_NAME, dynamodb, getFacilities, runQuery } = require('../../../lambda/dynamoUtil');
const { logger } = require('../../../lambda/logger');
const { getOldParks, updateConsoleProgress } = require('./common')

// This is a migration script built for BRS-794 which aims to update the primary keys of park and 
// facilities in the database to be unique indentifiers instead of a name. 
// This script should run before the delete script.
// Create copies of parks, facilities, and reservation objects in the DB using parks ORCS as park sk.
// Objects will ONLY create if they do not already exist, so this script can be run multiple times. 

let startTime = new Date().getTime();
let intervalStartTime = new Date().getTime();

async function createNew() {

  // create new db objects since we cannot update primary keys
  await createNewParks();
  await createNewFacilities();
  await createNewResObjects();
  await createNewPasses();

};

async function createNewParks() {
  console.log('********************');
  console.log('Creating new parks with ORCS sort key...');

  const parks = await getOldParks();
  let failParksList = [];
  let successParksList = []

  try {
    intervalStartTime = new Date().getTime();
    for (const park of parks) {
      updateConsoleProgress(startTime, intervalStartTime, 'Park progress', parks.indexOf(park) + 1, parks.length, 1);

      // ignore parks that already have new orcs sk.
      if (park.sk !== park.orcs) {

        // create new park object
        let newPark = { ...park };

        if (park.orcs) {
          newPark.sk = park.orcs

          // post new park object
          const parkPostObj = {
            TableName: TABLE_NAME,
            Item: AWS.DynamoDB.Converter.marshall(newPark),
            ConditionExpression: "pk <> :pk AND sk <> :sk",
            ExpressionAttributeValues: {
              ":pk": { S: newPark.pk },
              ":sk": { S: newPark.sk }
            }
          }
          try {
            await dynamodb.putItem(parkPostObj).promise();
            successParksList.push(newPark);
          } catch (err) {
            // post failed, item likely already exists
            failParksList.push({ parkSk: newPark.sk, reason: 'PUT Failed: ' + err })
          }
        } else {
          // old park is malformed
          failParksList.push({ parkSk: park.sk, reason: 'Missing/Invalid ORCS' });
        }
      } else {
        // item already exists
        failParksList.push({ parkSk: park.sk, reason: 'Already updated' });
      }
    }
    if (failParksList.length) {
      logger.debug('Failed park creations:\n', failParksList);
    }
  } catch (error) {
    logger.debug('Error creating new parks:', error);
  }
  console.log('\nNew parks created:', successParksList?.length || 0);
  console.log('********************\n');
}

async function createNewFacilities() {
  console.log('********************');
  console.log('Creating new facilites with new parks orcs partition key...');

  let failFacilitiesList = [];
  let successFacilitiesList = []

  const oldParks = await getOldParks();

  try {
    for (const park of oldParks) {
      const facilities = await getFacilities(park.sk);
      intervalStartTime = new Date().getTime();
      for (const facility of facilities) {
        updateConsoleProgress(startTime, intervalStartTime, `${park.sk} - facility progress`, facilities.indexOf(facility) + 1, facilities.length, 1);

        // ignore facilities that already have new orcs pk integration.
        if (facility.pk !== `facility::${park.orcs}`) {

          //create new facility object
          let newFacility = { ...facility };
          if (park.orcs) {
            newFacility.pk = `facility::${park.orcs}`;
            // post new park object
            const facilityPostObj = {
              TableName: TABLE_NAME,
              Item: AWS.DynamoDB.Converter.marshall(newFacility),
              ConditionExpression: "pk <> :pk AND sk <> :sk",
              ExpressionAttributeValues: {
                ":pk": { S: newFacility.pk },
                ":sk": { S: newFacility.sk }
              }
            }
            try {
              await dynamodb.putItem(facilityPostObj).promise();
              successFacilitiesList.push(newFacility);
            } catch (err) {
              // post failed, item likely already exists
              failFacilitiesList.push({ facilitySk: newFacility.sk, reason: 'PUT failed: ' + err })
            }
          } else {
            // malformed parent park object
            failFacilitiesList.push({ facilitySk: facility.sk, reason: 'Parent park is missing ORCS' });
          }
        } else {
          // item already exists
          failFacilitiesList.push({ facilitySk: facility.sk, reason: 'Already updated' });
        }
      }
      // newline for every park
      process.stdout.write('\n')
    }
    if (failFacilitiesList.length) {
      logger.debug('Failed facility creations:\n', failFacilitiesList);
    }
  } catch (error) {
    logger.debug('Error creating new facilities:', error);
  }
  console.log('\nNew facilities created:', successFacilitiesList?.length || 0);
  console.log('********************\n');
}

async function createNewResObjects() {
  console.log('********************');
  console.log('Creating new reservation objects with new parks orcs partition key...\n');

  let failResObjList = [];
  let successResObjList = [];

  const oldParks = await getOldParks();
  try {
    for (const park of oldParks) {
      const facilities = await getFacilities(park.sk)

      for (const facility of facilities) {
        // run query for all resobjects
        const resObjQuery = {
          TableName: TABLE_NAME,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: {
            ':pk': { S: `reservations::${park.name}::${facility.sk}` }
          }
        }

        let res;
        try {
          res = await runQuery(resObjQuery);
        } catch (err) {
          logger.debug('Error getting old reservation objects;', err);
        }

        intervalStartTime = new Date().getTime();
        for (const reservation of res) {
          updateConsoleProgress(startTime, intervalStartTime, `${facility.sk} (${park.sk}) - resObj progress`, res.indexOf(reservation) + 1, res.length, 1);

          // ignore reservation objects that already have new orcs pk integration.
          if (reservation.pk !== `reservations::${park.orcs}::${facility.sk}`) {

            let newReservationObj = { ...reservation };
            newReservationObj.pk = `reservations::${park.orcs}::${facility.sk}`
            const reservationPostObj = {
              TableName: TABLE_NAME,
              Item: AWS.DynamoDB.Converter.marshall(newReservationObj),
              ConditionExpression: "pk <> :pk AND sk <> :sk",
              ExpressionAttributeValues: {
                ":pk": { S: newReservationObj.pk },
                ":sk": { S: newReservationObj.sk }
              }
            }
            try {
              await dynamodb.putItem(reservationPostObj).promise();
              successResObjList.push(newReservationObj)
            } catch (err) {
              // put failed, item likely already exists
              failResObjList.push({ facilitySk: facility.sk, reason: 'PUT failed: ' + err })
            }
          } else {
            // item already exists
            failResObjList.push({ ResObjSk: reservation.sk, reason: 'Already updated' });
          }
        }
        if (res.length > 0) {
          // newline for every facility
          process.stdout.write('\n')
        }
      }
    }
    if (failResObjList.length) {
      logger.debug('Failed resObj creations:\n', failResObjList);
    }
  } catch (error) {
    console.log('Error creating new reservation objects:', error);
  }
  console.log('\nNew reservation objects created:', successResObjList?.length || 0);
  console.log('********************\n');
}

async function createNewPasses() {
  console.log('********************');
  console.log('Creating new passes with new parks orcs partition key...\n');

  let failPassList = [];
  let successPassList = [];

  const oldParks = await getOldParks();

  try {
    for (const park of oldParks) {
      // fetch all passes
      let passQuery = {
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': { S: `pass::${park.name}` }
        }
      }

      let passes;
      try {
        passes = await runQuery(passQuery);
      } catch (err) {
        logger.debug('Error getting passes for ', park.name, err);
      }
      intervalStartTime = new Date().getTime();
      for (const pass of passes) {
        updateConsoleProgress(startTime, intervalStartTime, `${park.sk} - pass progress`, passes.indexOf(pass) + 1, passes.length, 100);

        // ignore passes that already have new orcs pk integration, May occur if migration is interrupted.
        if (pass.pk !== `pass::${park.orcs}`) {

          let newPass = { ...pass };
          // include parkName in pass data - needed for GCN props
          newPass['parkName'] = park.name;
          newPass.pk = `pass::${park.orcs}`;
          const passPostObj = {
            TableName: TABLE_NAME,
            Item: AWS.DynamoDB.Converter.marshall(newPass),
            ConditionExpression: "pk <> :pk AND sk <> :sk",
            ExpressionAttributeValues: {
              ":pk": { S: newPass.pk },
              ":sk": { S: newPass.sk }
            }
          }
          try {
            await dynamodb.putItem(passPostObj).promise();
            successPassList.push(newPass);
          } catch (err) {
            // PUT failed, item likely already exists
            failPassList.push({ passSk: newPass.sk, reason: 'PUT failed: ' + err });
          }
        } else {
          failPassList.push({ passSk: pass.sk, reason: 'Already updated' });
        }
      }
      if (passes.length > 0) {
        process.stdout.write('\n')
      }
    }
    if (failPassList.length) {
      logger.debug('Failed pass creations:\n', failPassList);
    }
  } catch (err) {
    console.log('Error creating new passes:', err);
  }
  console.log('\nNew passes created:', successPassList?.length || 0);
  console.log('********************\n');
}

createNew();
