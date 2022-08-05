const AWS = require('aws-sdk');
const { logger } = require('./logger');
const { dynamodb, TABLE_NAME, TIMEZONE, runQuery } = require('./dynamoUtil');
const { DateTime } = require('luxon');

async function getFutureReservationObjects(parkName, facilityName) {
  let futureResObjects = [];
  const todaysShortDate = DateTime.now().setZone(TIMEZONE).toISODate();
  const reservationsObjectQuery = {
    TableName: TABLE_NAME,
    ExpressionAttributeValues: {
      // TODO: change this to use orcs
      ':pk': { S: `reservations::${parkName}::${facilityName}` },
      ':date': { S: todaysShortDate }
    },
    KeyConditionExpression: 'pk = :pk AND sk >= :date'
  };
  try {
    futureResObjects = await runQuery(reservationsObjectQuery);
  } catch (error) {
    logger.error('Error in getFutureReservationObjects', reservationsObjectQuery);
    logger.error(error);
    throw { msg: 'Something went wrong.', title: 'Operation Failed' };
  }
  return futureResObjects;
}

async function processReservationObjects(resObjs, timesToUpdate, timesToRemove) {
  for (let i = 0; i < resObjs.length; i++) {
    let resObj = resObjs[i];
    for (let k = 0; k < timesToRemove.length; k++) {
      const timeToRemove = timesToRemove[k];
      try {
        // send all passes to overbooked
        await updatePassObjectsAsOverbooked(
          resObj.pk.split('::').pop(),
          resObj.sk,
          timeToRemove.time,
          resObj.capacities[timeToRemove.time]?.baseCapacity + resObj.capacities[timeToRemove.time]?.capacityModifier
        );
      } catch (error) {
        logger.error('Error removing passes in updatePassObjectsOverbooked():', error);
      }
      try {
        // update future removed booking times to 0 capacity, 0 availability
        await updateReservationsObjectCapacity(
          resObj.pk,
          resObj.sk,
          timeToRemove.time,
          0,
          0
        );
      } catch (error) {
        logger.error('Error removing passes in updatereservationObjectCapacity():', error);
        throw error;
      }
    }
    for (let j = 0; j < timesToUpdate.length; j++) {
      const timeToUpdate = timesToUpdate[j];
      const oldResAvailability = resObj.capacities[timeToUpdate.time]?.availablePasses ?? 0;

      let newBaseCapacity = timeToUpdate.newCapacity;
      let passDiff = timeToUpdate.passDiff;
      let newResAvailability = oldResAvailability + passDiff;

      // If newResAvailability is negative, then we have overbooked passes.
      if (newResAvailability < 0) {
        try {
          // If we detect there's going to be an overflow, grab all overflow passes.
          newResAvailability = await updatePassObjectsAsOverbooked(
            resObj.pk.split('::').pop(),
            resObj.sk,
            timeToUpdate.time,
            newResAvailability * -1
          );
        } catch (error) {
          logger.error('Error occured while executing updatePassObjectsAsOverbooked()');
          throw error;
        }
      } else {
        // If we are increasing capacity, we need to pull overbooked passes.
        let overbookedPasses = [];
        try {
          if (resObj.capacities[timeToUpdate.time]) {
            overbookedPasses = await checkForOverbookedPasses(resObj.pk.split('::').pop(), resObj.sk, timeToUpdate.time);
          }
        } catch (error) {
          logger.error('Error occured while executing checkForOverbookedPasses()');
          throw error;
        }
        if (overbookedPasses.length > 0) {
          try {
            const restoredPassQuantity = await reverseOverbookedPasses(overbookedPasses, newResAvailability);
            newResAvailability -= restoredPassQuantity;
          } catch (error) {
            logger.error('Error occured while executing reverseOverbookedPasses()');
            throw error;
          }
        }
      }
      try {
        await updateReservationsObjectCapacity(
          resObj.pk,
          resObj.sk,
          timeToUpdate.time,
          newBaseCapacity,
          newResAvailability
        );
      } catch (error) {
        logger.error('Error occured while executing updateReservationsObjectCapacity()', error);
        throw error;
      }
    }
  }
}

async function updateReservationsObjectCapacity(pk, sk, type, newBaseCapacity, newResAvailability) {
  // TODO: update this to include modifiers when ready
  const mapType = AWS.DynamoDB.Converter.marshall({
    capacityModifier: 0,
    baseCapacity: newBaseCapacity,
    availablePasses: newResAvailability
  });
  const updateReservationsObject = {
    TableName: TABLE_NAME,
    Key: {
      pk: { S: pk },
      sk: { S: sk }
    },
    ExpressionAttributeValues: {
      ':type': { M: mapType }
    },
    ExpressionAttributeNames: {
      '#type': type,
    },
    UpdateExpression:
      'SET capacities.#type = :type'
  };
  logger.debug('updateReservationsObject:', updateReservationsObject);
  const res = await dynamodb.updateItem(updateReservationsObject).promise();
  logger.debug('Reservation object updated:' + res);
  return;
}

async function checkForOverbookedPasses(facilityName, shortPassDate, type) {
  const passesQuery = {
    TableName: TABLE_NAME,
    IndexName: 'shortPassDate-index',
    ExpressionAttributeValues: {
      ':shortPassDate': { S: shortPassDate },
      ':facilityName': { S: facilityName },
      ':passType': { S: type },
      ':isOverbooked': { BOOL: true },
      ':reservedStatus': { S: 'reserved' },
      ':activeStatus': { S: 'active' }
    },
    ExpressionAttributeNames: {
      '#theType': 'type'
    },
    KeyConditionExpression: 'shortPassDate =:shortPassDate AND facilityName =:facilityName',
    FilterExpression: '#theType =:passType AND isOverbooked =:isOverbooked AND passStatus IN (:reservedStatus, :activeStatus)'
  };
  let passes = [];
  try {
    passes = await runQuery(passesQuery);
    passes.sort((a, b) => new Date(a.creationDate) - new Date(b.creationDate));
  } catch (error) {
    logger.error('Error occured while getting overbooked passes in reverseOverbookedPasses');
    logger.error(passesQuery);
    logger.error(error);
    throw { msg: 'Something went wrong.', title: 'Operation Failed' };
  }
  return passes;
}

async function reverseOverbookedPasses(passes, passDiff) {
  // Figure out which passes we want to reverse
  let passTally = 0;
  for (let i = 0; i < passes.length; i++) {
    const pass = passes[i];
    if (passTally + pass.numberOfGuests > passDiff) {
      break;
    }
    passTally += pass.numberOfGuests;

    // Reverse the pass
    const updatePassObject = {
      TableName: TABLE_NAME,
      Key: {
        pk: { S: pass.pk },
        sk: { S: pass.sk }
      },
      ExpressionAttributeValues: {
        ':isOverbooked': AWS.DynamoDB.Converter.input(false)
      },
      UpdateExpression: 'SET isOverbooked = :isOverbooked',
      ReturnValues: 'ALL_NEW'
    };
    try {
      const res = await dynamodb.updateItem(updatePassObject).promise();
      logger.debug('Reversed pass overbooked status', res);
    } catch (error) {
      logger.error('Error occured while updating pass in reverseOverbookedPasses');
      logger.error(updatePassObject);
      throw { msg: 'Something went wrong.', title: 'Operation Failed' };
    }
  }
  return passTally;
}

async function updatePassObjectsAsOverbooked(facilityName, shortPassDate, type, numberOfPassesOverbooked) {
  const passesQuery = {
    TableName: TABLE_NAME,
    IndexName: 'shortPassDate-index',
    ExpressionAttributeValues: {
      ':shortPassDate': { S: shortPassDate },
      ':facilityName': { S: facilityName },
      ':passType': { S: type },
      ':false': { BOOL: false }
    },
    ExpressionAttributeNames: {
      '#theType': 'type'
    },
    KeyConditionExpression: 'shortPassDate =:shortPassDate AND facilityName =:facilityName',
    FilterExpression: '#theType =:passType AND isOverbooked =:false'
  };
  let passes;
  try {
    passes = await runQuery(passesQuery);
    passes.sort((a, b) => new Date(b.creationDate) - new Date(a.creationDate));
  } catch (error) {
    logger.error('Error occured while getting overbooked passes in updatePassObjectsAsOverbooked');
    logger.error(passesQuery);
    logger.error(error);
    throw { msg: 'Something went wrong.', title: 'Operation Failed' };
  }

  const overbookObj = await getOverbookedPassSet(passes, numberOfPassesOverbooked);
  const overbookedPasses = overbookObj.overbookedPasses;
  logger.debug('Overbooked passes:', overbookedPasses);

  for (let i = 0; i < overbookedPasses.length; i++) {
    const pass = overbookedPasses[i];
    const updatePassObject = {
      TableName: TABLE_NAME,
      Key: {
        pk: { S: pass.pk },
        sk: { S: pass.sk }
      },
      ExpressionAttributeValues: {
        ':isOverbooked': AWS.DynamoDB.Converter.input(true)
      },
      UpdateExpression: 'SET isOverbooked = :isOverbooked',
      ReturnValues: 'ALL_NEW'
    };
    try {
      const res = await dynamodb.updateItem(updatePassObject).promise();
      logger.debug('Pass set to overbooked', res);
    } catch (error) {
      logger.error('Error occured while updating pass in updatePassObjectsAsOverbooked');
      logger.error(updatePassObject);
      throw { msg: 'Something went wrong.', title: 'Operation Failed' };
    }
  }
  // Return remainder.
  // We might not get a perfect number of passes due to group so this number could be > 0
  return overbookObj.remainder;
}

async function getOverbookedPassSet(passes, numberOfPassesOverbooked) {
  let overbookObj = {
    overbookedPasses: [],
    remainder: 0
  };
  let cancelledGuestTally = 0;
  for (let i = 0; i < passes.length; i++) {
    const pass = passes[i];
    cancelledGuestTally += pass.numberOfGuests;
    overbookObj.overbookedPasses.push(pass);
    if (numberOfPassesOverbooked <= cancelledGuestTally) {
      break;
    }
  }
  overbookObj.remainder = cancelledGuestTally - numberOfPassesOverbooked;
  return overbookObj;
}

module.exports = {
  getFutureReservationObjects,
  processReservationObjects
}