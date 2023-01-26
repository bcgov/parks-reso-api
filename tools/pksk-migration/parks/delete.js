'use strict';
const { TABLE_NAME, dynamodb, getFacilities, runQuery } = require('../../../lambda/dynamoUtil');
const { logger } = require('../../../lambda/logger');
const { getOldParks, updateConsoleProgress } = require('./common');

// This is a migration script built for BRS-794 which aims to update the primary keys of park and 
// facilities in the database to be unique indentifiers instead of a name. 
// This script should be run after the create script. 
// This migration will remove all database items that use the old primary key for parks/facilities in their own keys.

let startTime = new Date().getTime();
let intervalStartTime = new Date().getTime();

async function deleteOld() {

  // order of these is important
  await deleteOldPasses();
  await deleteOldResObjects();
  await deleteOldFacilities();
  await deleteOldParks();

};

async function deleteOldParks() {
  console.log('********************');
  console.log('Deleting old parks without ORCS sort key...\n');

  const parks = await getOldParks();
  let failParksList = [];
  let successParksList = [];

  try {
    intervalStartTime = new Date().getTime();
    for (const park of parks) {
      updateConsoleProgress(startTime, intervalStartTime, 'Park delete', parks.indexOf(park) + 1, parks.length, 1);
      const parkDeleteObj = {
        TableName: TABLE_NAME,
        Key: {
          pk: { S: park.pk },
          sk: { S: park.sk }
        }
      }
      try {
        await dynamodb.deleteItem(parkDeleteObj).promise();
        successParksList.push(park);
      } catch (err) {
        // delete failed
        failParksList.push({ parkSk: park.sk, reason: 'DELETE failed: ' + err });
      }
    }
  } catch (err) {
    logger.debug('Error deleting old parks:', err);
  }
  console.log('\n\nOld parks deleted:', successParksList?.length || 0);
  console.log('********************\n');
}

async function deleteOldFacilities() {
  console.log('********************');
  console.log('Deleting old facilities without ORCS sort key...\n');
  let failFacilitiesList = [];
  let successFacilitiesList = [];

  const parks = await getOldParks();
  try {
    for (const park of parks) {
      const facilities = await getFacilities(park.sk);
      intervalStartTime = new Date().getTime();
      for (const facility of facilities) {
        updateConsoleProgress(startTime, intervalStartTime, `${park.sk} - facility delete`, facilities.indexOf(facility) + 1, facilities.length, 1);

        const facilityDeleteObj = {
          TableName: TABLE_NAME,
          Key: {
            pk: { S: facility.pk },
            sk: { S: facility.sk }
          }
        }
        try {
          await dynamodb.deleteItem(facilityDeleteObj).promise();
          successFacilitiesList.push(facility);
        } catch (err) {
          // delete failed
          failFacilitiesList.push({ facilitySk: facility.sk, reason: 'DELETE failed: ' + err });
        }
      }
      // newline for every park
      process.stdout.write('\n')
    }
  } catch (err) {
    logger.debug('Error deleting old facilities:', error);
  }
  console.log('\nOld facilities deleted:', successFacilitiesList?.length || 0);
  console.log('********************\n');
}

async function deleteOldResObjects() {
  console.log('********************');
  console.log('Deleting old reservation objects without ORCS sort key...\n');
  let failResObjList = [];
  let successResObjList = [];

  const parks = await getOldParks();
  try {
    for (const park of parks) {
      const facilities = await getFacilities(park.sk);
      for (const facility of facilities) {

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

          updateConsoleProgress(startTime, intervalStartTime, `${facility.sk} (${park.sk}) - reservation object delete`, res.indexOf(reservation) + 1, res.length, 1);

          const resObjDeleteObj = {
            TableName: TABLE_NAME,
            Key: {
              pk: { S: reservation.pk },
              sk: { S: reservation.sk }
            }
          }
          try {
            await dynamodb.deleteItem(resObjDeleteObj).promise();
            successResObjList.push(reservation);
          } catch (err) {
            // delete failed
            failResObjList.push({ reservationSk: reservation.sk, reason: 'DELETE failed: ' + err });
          }
        }
        if (res.length > 0) {
          // newline for every facility
          process.stdout.write('\n')
        }
      }
    }
  } catch (err) {
    logger.debug('Error deleting old reservation objects:', err);
  }
  console.log('\nOld reservation objects deleted:', successResObjList?.length || 0);
  console.log('********************\n');
}

async function deleteOldPasses() {
  console.log('********************');
  console.log('Deleting old passes without ORCS sort key...\n');
  let failPassList = [];
  let successPassList = [];

  const parks = await getOldParks();
  try {
    for (const park of parks) {

      const passQueryObj = {
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': { S: `pass::${park.name}` }
        }
      }

      let passes;
      try {
        passes = await runQuery(passQueryObj);
      } catch (err) {
        logger.debug('Error getting old passes', err);
      }

      intervalStartTime = new Date().getTime();

      for (const pass of passes) {

        updateConsoleProgress(startTime, intervalStartTime, `${park.sk} - pass delete`, passes.indexOf(pass) + 1, passes.length, 100);

        const passDeleteObj = {
          TableName: TABLE_NAME,
          Key: {
            pk: { S: pass.pk },
            sk: { S: pass.sk }
          }
        }
        try {
          await dynamodb.deleteItem(passDeleteObj).promise();
          successPassList.push(pass);
        } catch (err) {
          // delete failed
          failPassList.push({ passSk: pass.sk, reason: 'DELETE failed: ' + err });
        }
      }
      if (passes.length > 0) {
        process.stdout.write('\n')
      }
    }
  } catch (err) {
    logger.debug('Error deleting old passes:', error);
  }
  console.log('\nOld passes deleted:', successPassList?.length || 0);
  console.log('********************\n');
}

deleteOld();