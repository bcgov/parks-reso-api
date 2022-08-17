const { sendResponse } = require('../responseUtil');
const { decodeJWT, resolvePermissions, getParkAccess } = require('../permissionUtil');
const { logger } = require('../logger');
const { setFacilityLock, unlockFacility } = require('../facilityUtils');
const { createNewReservationsObj } = require('../writeReservation');
const { processReservationObjects, getReservationObject } = require('../reservationObjUtils');
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
//     parkName: 'Garibaldi Provincial Park'
//     facility: 'Cheakamus'
// }
exports.handler = async (event, context) => {
  if (!event || !event.headers) {
    return sendResponse(403, { msg: 'Unauthorized' }, context);
  }

  if (event.httpMethod !== 'PUT') {
    return sendResponse(405, { msg: 'Not Implemented' }, context);
  }

  const token = await decodeJWT(event);
  const permissionObject = resolvePermissions(token);

  if (permissionObject.isAuthenticated !== true) {
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

  const { date, bookingTimes, parkName, facility } = obj;

  // date must be a valid shortDate:
  try {
    checkDate = DateTime.fromFormat(date, 'yyyy-mm-dd');
    if (checkDate.invalid){
      throw 'Provided date must be valid shortDate';
    }
  } catch (error) {
    logger.error('ERR:', error);
    return sendResponse(400, {msg: error});
  }

  try {
    await getParkAccess(parkName, permissionObject);
  } catch (error) {
    logger.error('ERR:', error);
    return sendResponse(403, { msg: error.msg });
  }

  try {
    // Set facility lock and get facility
    // This also locks reservation objects for that facility to be messed with.
    // This can be assumed because any other possible way to edit reservation objects are protected by the same facility lock
    const currentFacility = await setFacilityLock(`facility::${parkName}`, facility);

    // Apply the update to the locked facility
    const res = await updateModifier(date, bookingTimes, parkName, currentFacility);

    // Unlock before returning.
    await unlockFacility(`facility::${parkName}`, facility);

    return sendResponse(200, res);
  } catch (err) {
    logger.error('err', err);
    // Attempt to unlock the facility if we broke after it locked.
    await unlockFacility(`facility::${parkName}`, facility);
    return sendResponse(400, err, context);
  }
};

async function updateModifier(date, modTimes, parkName, currentFacility) {
  try {
    if (!currentFacility || !currentFacility.name || !currentFacility.bookingTimes) {
      throw 'Could not GET current facility';
    }

    const reservationsObjectPK = `reservations::${parkName}::${currentFacility.name}`;
    
    // Apply modifier - ReservationObjUtil will handle available pass logic.
    //// Ensure the res obj exists
    await createNewReservationsObj(currentFacility, reservationsObjectPK, date);
    //// Get modifier via date
    const reservationObj = await getReservationObject(parkName, currentFacility.name, date);
    // Make sure all modifiers are actually booking types we have active in the facility
    //// Build timesToUpdate
    let timesToUpdate = [];
    for (const time in modTimes) {
      // If no time slot exists, we skip
      if (time in currentFacility.bookingTimes) {
        timesToUpdate.push({
          time: time,
          modifierToSet: Number(modTimes[time])
        });
      }
    }
    //// Update res objects
    let res;
    if (timesToUpdate.length > 0) {
      res = await processReservationObjects(reservationObj, timesToUpdate, []);
    }
    return res;

  } catch (error) {
    logger.error("Error updating modifier");
    throw error;
  }
    
}
