const { sendResponse, logger } = require('/opt/baseLayer');
const { getParkAccess, decodeJWT, resolvePermissions } = require('/opt/permissionLayer');
const { setFacilityLock, unlockFacility } = require('/opt/facilityLayer');
const { createNewReservationsObj, processReservationObjects, getReservationObject } = require('/opt/reservationLayer');
const { DateTime } = require('luxon');

// Example Payload:
// {
//     date: 2022-08-04,
//     bookingTimes: {
//         AM: 20,
//         PM: -20,
//         DAY: 0,
//         WHATEVER: 0
//     },
//     parkOrcs: '0007'
//     facility: 'Cheakamus'
// }
exports.handler = async (event, context) => {
  if (!event || !event.headers) {
    logger.info('Unauthorized');
    return sendResponse(403, { msg: 'Unauthorized' }, context);
  }

  if (event.httpMethod !== 'PUT') {
    logger.info('Not Implemented');
    return sendResponse(405, { msg: 'Not Implemented' }, context);
  }

  const token = await decodeJWT(event);
  const permissionObject = resolvePermissions(token);

  if (permissionObject.isAuthenticated !== true) {
    logger.info('Unauthorized');
    return sendResponse(403, { msg: 'Unauthorized' }, context);
  }

  let obj = null;

  try {
    logger.debug(event.body);
    obj = JSON.parse(event.body);
  } catch (e) {
    logger.error('e', e);
    return sendResponse(400, e, context);
  }

  const { date, bookingTimes, parkOrcs, facility } = obj;

  // date must be a valid shortDate:
  try {
    checkDate = DateTime.fromFormat(date, 'yyyy-mm-dd');
    if (checkDate.invalid) {
      logger.info('Provided date must be valid shortDate');
      throw 'Provided date must be valid shortDate';
    }
  } catch (error) {
    logger.error('ERR:', error);
    return sendResponse(400, { msg: error });
  }

  try {
    await getParkAccess(parkOrcs, permissionObject);
  } catch (error) {
    logger.error('ERR:', error);
    return sendResponse(403, { msg: error.msg });
  }

  try {
    // Set facility lock and get facility
    // This also locks reservation objects for that facility to be messed with.
    // This can be assumed because any other possible way to edit reservation objects are protected by the same facility lock
    logger.info('Locking facility');
    const currentFacility = await setFacilityLock(`facility::${parkOrcs}`, facility);

    // Apply the update to the locked facility
    const res = await updateModifier(date, bookingTimes, parkOrcs, currentFacility);
    logger.info('Unlocking facility');

    // Unlock before returning.
    await unlockFacility(`facility::${parkOrcs}`, facility);

    return sendResponse(200, res);
  } catch (err) {
    logger.error('err', err);
    // Attempt to unlock the facility if we broke after it locked.
    await unlockFacility(`facility::${parkOrcs}`, facility);
    return sendResponse(400, err, context);
  }
};

/**
 * Updates the capacity modifier for a facility's reservation object on a specific date.
 *
 * @async
 * @function updateModifier
 * @param {string} date - The date for which the reservation object is being updated (in YYYY-MM-DD format).
 * @param {Object} modTimes - An object containing time slots (e.g., "AM", "PM") as keys and their respective capacity modifiers as values.
 * @param {string} parkOrcs - The unique identifier for the park.
 * @param {Object} currentFacility - The facility object containing details about the facility.
 * @param {string} currentFacility.name - The name of the facility.
 * @param {Object} currentFacility.bookingTimes - An object representing the active booking times for the facility.
 * @throws Will throw an error if the current facility is invalid, if a new total capacity is negative, or if any other error occurs during processing.
 * @returns {Promise<Object|undefined>} A promise that resolves to the result of the reservation object update, or undefined if no updates were made.
 */
async function updateModifier(date, modTimes, parkOrcs, currentFacility) {
  try {
    if (!currentFacility || !currentFacility.name || !currentFacility.bookingTimes) {
      throw 'Could not GET current facility';
    }

    const reservationsObjectPK = `reservations::${parkOrcs}::${currentFacility.name}`;
    // Create a new reservation object if it doesn't exist for the given date
    await createNewReservationsObj(currentFacility, reservationsObjectPK, date);

    // This is safe because we are only getting one reservation object per date.
    const reservationObj = (await getReservationObject(parkOrcs, currentFacility.name, date))[0];

    // Make sure all modifiers are actually booking types we have active in the facility and check that
    // the new total capacity is not negative.
    let timesToUpdate = [];
    for (const time in modTimes) {
      // If no time slot exists, we skip
      if (time in currentFacility.bookingTimes) {
        const currentCapacity = Number(reservationObj.capacities[time].baseCapacity) + Number(reservationObj.capacities[time].capacityModifier);
        const newTotalCapacity = currentCapacity + Number(modTimes[time]);

        logger.debug("Time AM/PM:", time); // AM / PM
        logger.debug("Current Capacity:", currentCapacity);
        logger.debug("Modifier:", Number(modTimes[time]));
        logger.debug("New Total Capacity:", newTotalCapacity);

        if (newTotalCapacity < 0) {
          throw `New total capacity for ${time} is negative`;
        }

        timesToUpdate.push({
          time: time,
          modifierToSet: Number(modTimes[time])
        });
      }
    }
    let res;
    if (timesToUpdate.length > 0) {
      // We only have one reservation object, so we pass in an array with one object.
      res = await processReservationObjects([reservationObj], timesToUpdate, []);
    }
    return res;

  } catch (error) {
    logger.error("Error updating modifier");
    throw error;
  }
}
