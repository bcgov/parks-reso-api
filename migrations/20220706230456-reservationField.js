'use strict';
const AWS = require('aws-sdk');
const { TABLE_NAME, dynamodb, runQuery } = require('../lambda/dynamoUtil');

exports.up = async function (dbOptions) {
  await createReservationObject();
};

async function createReservationObject() {
  console.log('Creating Reservation Objects and Updating Facilities\n');

  let facilityErrors = [];
  let resObjErrors = [];
  let facilityCompleted = [];
  let resObjCompleted = [];

  //get parks
  const parkQueryObj = {
    TableName: TABLE_NAME,
    ConsistentRead: true,
    ExpressionAttributeValues: {
      ':pk': {S: 'park'}
    },
    KeyConditionExpression: 'pk =:pk'
  };

  let parks;
  try {
    parks = await runQuery(parkQueryObj);
  } catch (error) {
    console.log('Error getting parks:', error);
  }
  if (parks.length === 0) {
    console.log('No parks found');
    throw 'No parks found';
  }

  //get facilities
  for (const park of parks) {
    const facilityPk = `facility::${park.sk}`;
    const facilityQueryObj = {
      TableName: TABLE_NAME,
      ExpressionAttributeValues: {
        ':pk': {S: facilityPk}
      },
      KeyConditionExpression: 'pk =:pk'
    };

    let facilities;
    try {
      facilities = await runQuery(facilityQueryObj);
    } catch (error) {
      console.log('Error getting facilities:', error);
    }

    //migration
    for (let i = 0; i < facilities.length; i++) {
      const facility = facilities[i];
      const parkName = facility.pk.substring(facility.pk.indexOf('::') + 2);

      //get AM, PM and date
      for (const key in facility.reservations) {
        const facilityReservation = facility.reservations[key];
        let reservationsPutObj = {
          TableName: TABLE_NAME
        };
        const marshalledReservationsObj = {
          pk: { S: `reservations::${parkName}::${facility.name}` },
          sk: { S: key }
        };

        //set capacities
        let capacities = {};
        for (const item in facilityReservation) {
          if (facility.bookingTimes[item]) {
            capacities[item] = {
              M: AWS.DynamoDB.Converter.marshall({
                baseCapacity: facility.bookingTimes[item].max,
                capacityModifier: 0,
                availablePasses: facility.bookingTimes[item].max - facilityReservation[item]
              })
            };
          }
        }
        marshalledReservationsObj['capacities'] = { M: capacities };
        reservationsPutObj['Item'] = marshalledReservationsObj;

        //create reservation objects
        try {
          await dynamodb.putItem(reservationsPutObj).promise();
          console.log('Reservations obj created:', reservationsPutObj.Item.pk.S);
          resObjCompleted.push(reservationsPutObj.Item.pk.S);
        } catch (error) {
          console.log('Error creating reservations obj:', reservationsPutObj);
          console.log('Error:', error);
          resObjErrors.push(reservationsPutObj.Item.pk.S);
        }
      }

      const updateFacilityObj = {
        TableName: TABLE_NAME,
        Key: {
          pk: { S: facility.pk },
          sk: { S: facility.sk }
        },
        ExpressionAttributeNames: {
          '#reservations': 'reservations'
        },
        UpdateExpression: 'REMOVE #reservations',
        ReturnValues: 'ALL_NEW'
      };

      //update facilities
      try {
        const res = await dynamodb.updateItem(updateFacilityObj).promise();
        console.log('Facility updated:', res.Attributes?.pk?.S, res.Attributes?.sk?.S);
        facilityCompleted.push(res.Attributes?.pk?.S);
      } catch (error) {
        console.log('Error removing reservations from facility:', updateFacilityObj);
        console.log('Error:', error);
        facilityErrors.push(parkName, '::', facility.name);
      }
    }
  }
  console.log('------------------------------------------------------------------');
  console.log(`Successfully created ${resObjCompleted.length} reservation objects. \n`);
  console.log(`Successfully updated ${facilityCompleted.length} facilities. \n`);
  console.log(`Failed to create ${resObjErrors.length} reservation objects.\n`);
  console.log(`Failed to update ${facilityErrors.length} facilities.\n `);
  //log reservation object errors
  let firstTime = true;
  for (const item of resObjErrors) {
    if (firstTime) {
      console.log('Failed Reservation Objects:');
      firstTime = false;
    }
    process.stdout.write(`${item}`);
  }
  //log facility errors
  firstTime = true;
  for (const item of facilityErrors) {
    if (firstTime) {
      console.log('Failed Facility Updates:');
      firstTime = false;
    }
    process.stdout.write(`${item}`);
  }
  console.log('------------------------------------------------------------------');
}

exports.down = async function (dbOptions) {};
