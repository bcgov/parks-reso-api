const { sendResponse } = require('../responseUtil');
const { decodeJWT, resolvePermissions, getParkAccess } = require('../permissionUtil');
const { TIMEZONE } = require('../dynamoUtil');
const { logger } = require('../logger');
const { setFacilityLock, unlockFacility } = require('../facilityUtils');
const { createNewReservationsObj } = require('../writeReservation');
const { processReservationObjects, getReservationObject } = require('../reservationObjUtils');
const { DateTime } = require('luxon');

// Example Payload:
// {
//     date: 2022-08-04T19:00:00.000Z,
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

  try {
    logger.debug(event.body);
    const obj = JSON.parse(event.body);

    try {
      await getParkAccess(obj.parkName, permissionObject);
    } catch (error) {
      logger.error('ERR:', error);
      return sendResponse(403, { msg: error.msg });
    }
    const res = await updateModifier(obj);
    return sendResponse(200, res);
  } catch (err) {
    logger.error('err', err);
    await unlockFacility(`facility::${obj.parkName}`, obj.facility);
    return sendResponse(400, err, context);
  }
};

async function updateModifier(obj) {
  const { date, bookingTimes, parkName, facility } = obj;

  const bookingPSTDateTime = DateTime.fromISO(date)
    .setZone(TIMEZONE)
    .set({
      hour: 12,
      minutes: 0,
      seconds: 0,
      milliseconds: 0
    })
    .toISODate();

  const reservationsObjectPK = `reservations::${parkName}::${facility}`;

  // Set facility lock and get facility
  // This also locks reservation objects for that facility to be messed with.
  // This can be assumed because any other possible way to edit reservation objects are protected by the same facility lock
  const currentFacility = await setFacilityLock(`facility::${parkName}`, facility);

  // Apply modifier - ReservationObjUtil will handle available pass logic.
  //// Ensure the res obj exists
  await createNewReservationsObj(currentFacility.bookingTimes, reservationsObjectPK, bookingPSTDateTime);
  //// Get modifier via date
  const reservationObj = await getReservationObject(parkName, facility, date);

  // Make sure all modifiers are actually booking types we have active in the facility
  //// Build timesToUpdate
  let timesToUpdate = [];
  for (const time in bookingTimes) {
    // If no time slot exists, we skip
    if (time in currentFacility.bookingTimes) {
      timesToUpdate.push({
        time: time,
        modifierToSet: Number(bookingTimes[time])
      });
    }
  }

  //// Update res objects
  let res;
  if (timesToUpdate.length > 0) {
    res = await processReservationObjects(reservationObj, timesToUpdate, []);
  }

  // Unlock facility
  await unlockFacility(`facility::${parkName}`, facility);

  return res;
}
