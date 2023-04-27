const AWS = require('aws-sdk');
const { logger } = require('./logger');
const { dynamodb, TABLE_NAME, TIMEZONE, runQuery } = require('./dynamoUtil');
const { DateTime } = require('luxon');

// TODO: provide these as vars in Parameter Store
const LOW_CAPACITY_THRESHOLD = process.env.LOW_CAPACITY_THRESHOLD || 0.25;
const MODERATE_CAPACITY_THRESHOLD = process.env.MODERATE_CAPACITY_THRESHOLD || 0.75;
const PARKING_MAX_PER_PASS = 1;
const TRAIL_MAX_PER_PASS = 4;

function formatPublicReservationObject(reservations, facility, bookingWindow) {
  let publicObj = buildPublicTemplate(facility, bookingWindow);
  for (let reservation of reservations) {
    for (const [key, value] of Object.entries(reservation.capacities)) {
      const bookingSlot = {
        capacity: getCapacityLevel(value.baseCapacity, value.availablePasses, value.capacityModifier),
        max: checkMaxPasses(facility, value.availablePasses)
      };
      publicObj[reservation.sk][key] = bookingSlot;
    }
  }
  return publicObj;
}

// Build empty public template to be populated with real reservation data if it exists.
function buildPublicTemplate(facility, bookingWindow) {
  let template = {};
  for (let date of bookingWindow) {
    let dateEntry = {};
    for (const key of Object.keys(facility.bookingTimes)) {
      dateEntry[key] = {
        capacity: 'High',
        max: checkMaxPasses(facility)
      };
      template[date] = dateEntry;
    }
  }
  return template;
}

// Get capacity level (high, med, low, none) of a facility.
function getCapacityLevel(base, available, modifier) {
  const capacity = base + modifier;
  const booked = capacity - available;
  const percentage = booked / capacity;
  if (percentage < LOW_CAPACITY_THRESHOLD) {
    return 'High';
  } else if (percentage < MODERATE_CAPACITY_THRESHOLD) {
    return 'Moderate';
  } else if (percentage < 1) {
    return 'Low';
  } else {
    return 'Full';
  }
}

function checkMaxPasses(facility, availablePasses = null) {
  let max = 1;
  switch (facility.type) {
    case 'Parking':
      max = PARKING_MAX_PER_PASS;
      break;
    case 'Trail':
      max = TRAIL_MAX_PER_PASS;
      break;
  }
  if (availablePasses > max) {
    return max;
  }
  return availablePasses ?? max;
}

async function createNewReservationsObj(
  facility,
  reservationsObjectPK,
  bookingPSTShortDate
) {
  if (!facility.bookingTimes || !facility.status.state) {
    logger.debug("Invalid facility object", facility);
    throw 'Invalid facility object';
  }

  const bookingTimeTypes = Object.keys(facility.bookingTimes);

  let rawReservationsObject = {
    pk: reservationsObjectPK,
    sk: bookingPSTShortDate,
    capacities: {},
    status: facility.status.state
  };

  // We are initing capacities
  for (let i = 0; i < bookingTimeTypes.length; i++) {
    const property = bookingTimeTypes[i];
    rawReservationsObject.capacities[property] = {
      baseCapacity: facility.bookingTimes[property].max,
      capacityModifier: 0,
      availablePasses: facility.bookingTimes[property].max
    };
  }

  // Attempt to create a new reservations object
  const reservationsObject = {
    TableName: TABLE_NAME,
    Item: AWS.DynamoDB.Converter.marshall(rawReservationsObject),
    ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)'
  };

  let res = null;
  try {
    res = await dynamodb.putItem(reservationsObject).promise();
    logger.debug(res);
  } catch (err) {
    // If this fails, that means the object already exists.
    // We can continue to our allocated increment logic.
    logger.info('Reservation object already exists');
    logger.debug(rawReservationsObject);
  }
  return res;
};

async function getFutureReservationObjects(parkSk, facilityName) {
  let futureResObjects = [];
  const todaysShortDate = DateTime.now().setZone(TIMEZONE).toISODate();
  const reservationsObjectQuery = {
    TableName: TABLE_NAME,
    ExpressionAttributeValues: {
      // TODO: change this to use orcs
      ':pk': { S: `reservations::${parkSk}::${facilityName}` },
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

async function processReservationObjects(resObjs, timesToUpdate, timesToRemove, status = null) {
  let resArray = [];
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
        resArray.push({
          msg: 'Timeslot removed.',
          data: await updateReservationsObjectCapacity(resObj.pk, resObj.sk, timeToRemove.time, 0, 0, 0)
        });
      } catch (error) {
        logger.error('Error removing passes in updatereservationObjectCapacity():', error);
        throw error;
      }
    }
    for (let j = 0; j < timesToUpdate.length; j++) {
      const timeToUpdate = timesToUpdate[j];

      if (timeToUpdate.capacityToSet == null && timeToUpdate.modifierToSet == null) {
        logger.error('Neither a new base capacity or a new modifier was provided. Skipping.');
        continue;
      }

      let oldResAvailability, oldBaseCapacity, newBaseCapacity, oldModifier, newModifier, newResAvailability;
      try {
        if (resObj.capacities[timeToUpdate.time]) {
          // time slot exists in res obj
          oldResAvailability = resObj.capacities[timeToUpdate.time].availablePasses;
          oldBaseCapacity = resObj.capacities[timeToUpdate.time].baseCapacity;
          oldModifier = resObj.capacities[timeToUpdate.time].capacityModifier;
        } else {
          // new time slot
          oldResAvailability = 0;
          oldBaseCapacity = 0;
          oldModifier = 0;
        }

        newBaseCapacity = timeToUpdate.capacityToSet ?? oldBaseCapacity;
        newModifier = timeToUpdate.modifierToSet ?? oldModifier;

        if (newBaseCapacity + newModifier < 0) {
          logger.error('New total capacity cannot be negative');
          continue;
        }

        //a1 = a0 + c1 - c0 + m1 - m0 + f(p)
        newResAvailability = oldResAvailability + newBaseCapacity - oldBaseCapacity + newModifier - oldModifier;
      } catch (error) {
        logger.error('Error calculating newResAvailability', error);
        throw error;
      }

      // If newResAvailability is negative, then we have overbooked passes.
      // This logic handles the `+ f(p)` portion of the formula
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
            overbookedPasses = await checkForOverbookedPasses(
              resObj.pk.split('::').pop(),
              resObj.sk,
              timeToUpdate.time
            );
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
        resArray.push({
          msg: 'Timeslot updated.',
          data: await updateReservationsObjectCapacity(
            resObj.pk,
            resObj.sk,
            timeToUpdate.time,
            newBaseCapacity,
            newModifier,
            newResAvailability
          )
        });
      } catch (error) {
        logger.error('Error occured while executing updateReservationsObjectCapacity()', error);
        throw error;
      }
    }
    // update reservation object with changed metadata fields
    if (status) {
      try {
        resArray.push({
          msg: 'Metadata updated',
          data: await updateReservationsObjectMeta(resObj.pk, resObj.sk, status)
        });
      } catch (error) {
        logger.error('Error occured while executing updateReservationsObjectStatus()', error);
        throw error;
      }
    }
  }
  logger.debug('resArray:', resArray);
  return resArray;
}

// Can be populated with more metadata fields in the future if necessary
async function updateReservationsObjectMeta(pk, sk, status) {
  const updateReservationsObject = {
    TableName: TABLE_NAME,
    Key: {
      pk: { S: pk },
      sk: { S: sk }
    },
    ExpressionAttributeValues: {
      ':status': { S: status }
    },
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    UpdateExpression: 'SET #status = :status',
    ReturnValues: 'ALL_NEW'
  };
  logger.debug('updateReservationsObject:', updateReservationsObject);
  const res = await dynamodb.updateItem(updateReservationsObject).promise();
  logger.debug('Reservation object updated:' + res);
  return res.Attributes;
}

async function updateReservationsObjectCapacity(pk, sk, type, newBaseCapacity, newModifier, newResAvailability) {
  const mapType = AWS.DynamoDB.Converter.marshall({
    capacityModifier: Number(newModifier),
    baseCapacity: Number(newBaseCapacity),
    availablePasses: Number(newResAvailability)
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
      '#type': type
    },
    UpdateExpression: 'SET capacities.#type = :type',
    ReturnValues: 'ALL_NEW'
  };
  logger.debug('updateReservationsObject:', updateReservationsObject);
  const res = await dynamodb.updateItem(updateReservationsObject).promise();
  logger.debug('Reservation object updated:' + res);
  return res.Attributes;
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
    FilterExpression:
      '#theType =:passType AND isOverbooked =:isOverbooked AND passStatus IN (:reservedStatus, :activeStatus)'
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

async function reverseOverbookedPasses(passes, newResAvailability) {
  // Figure out which passes we want to reverse
  let passTally = 0;
  for (let i = 0; i < passes.length; i++) {
    const pass = passes[i];
    if (passTally + pass.numberOfGuests > newResAvailability) {
      continue;
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
  let i = 0;
  do {
    const pass = passes[i];
    cancelledGuestTally += pass.numberOfGuests;
    overbookObj.overbookedPasses.push(pass);
    i += 1;
  } while (i < passes.length && cancelledGuestTally < numberOfPassesOverbooked);
  overbookObj.remainder = cancelledGuestTally - numberOfPassesOverbooked;
  return overbookObj;
}

async function getReservationObject(parkSk, facilityName, bookingPSTDateTime) {
  const todaysShortDate = DateTime.now().setZone(TIMEZONE).toISODate();

  if (bookingPSTDateTime < todaysShortDate) {
    throw 'You can only edit future modifiers.';
  }

  const reservationsObjectQuery = {
    TableName: TABLE_NAME,
    ExpressionAttributeValues: {
      ':pk': { S: `reservations::${parkSk}::${facilityName}` },
      ':date': { S: bookingPSTDateTime }
    },
    KeyConditionExpression: 'pk = :pk AND sk = :date'
  };
  try {
    return await runQuery(reservationsObjectQuery);
  } catch (error) {
    logger.error('Error in getFutureReservationObjects', reservationsObjectQuery);
    logger.error(error);
    throw { msg: 'Something went wrong.', title: 'Operation Failed' };
  }
}

module.exports = {
  getReservationObject,
  getFutureReservationObjects,
  processReservationObjects,
  formatPublicReservationObject,
  createNewReservationsObj
};
