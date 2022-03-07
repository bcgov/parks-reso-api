const { compareAsc, addHours, endOfYesterday, startOfDay } = require('date-fns');
const { utcToZonedTime } = require('date-fns-tz');
const { getPassesByStatus,
        setStatus,
        ACTIVE_STATUS,
        EXPIRED_STATUS,
        PASS_TYPE_EXPIRY_HOURS,
        PASS_TYPE_AM,
        timeZone } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');

exports.handler = async (event, context) => {
  console.log('Check Expiry', event, context);
  try {
    const endOfYesterdayTime = endOfYesterday();
    const currentTime = utcToZonedTime(new Date(), timeZone);

    let passesToChange = [];
    const passes = await getPassesByStatus(ACTIVE_STATUS);
    console.log("Active Passes:", passes);

    for(pass of passes) {
      const zonedPassTime = utcToZonedTime(pass.date, timeZone);
      // If it's zoned date is before the end of yesterday, it's definitely expired (AM/PM/DAY)
      if (compareAsc(zonedPassTime, endOfYesterdayTime) <= 0) {
        console.log("Expiring:", pass);
        passesToChange.push(pass);
      }

      // If AM, see if we're currently in the afternoon or later compared to the pass date's noon time.
      const noonTime = addHours(startOfDay(zonedPassTime), PASS_TYPE_EXPIRY_HOURS.AM);
      if (pass.type === PASS_TYPE_AM && compareAsc(currentTime, noonTime) > 0) {
        console.log("Expiring:", pass);
        passesToChange.push(pass);
      }
    }

    // Set passes => expired
    if (passesToChange.length !== 0) {
      await setStatus(passesToChange, EXPIRED_STATUS);
    }

    return sendResponse(200, {}, context);
  } catch (err) {
    console.error(err);

    return sendResponse(500, {}, context);
  }
};
