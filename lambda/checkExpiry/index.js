const { compareAsc, addHours, endOfYesterday, startOfDay } = require('date-fns');
const { utcToZonedTime } = require('date-fns-tz');
const { DateTime } = require('luxon');
const { getPassesByStatus,
  setStatus,
  ACTIVE_STATUS,
  EXPIRED_STATUS,
  PASS_TYPE_EXPIRY_HOURS,
  PASS_TYPE_AM,
  TIMEZONE } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');

exports.handler = async (event, context) => {
  console.log('Check Expiry', event, context);
  console.log('Server Time Zone:',
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'undefined',
    `(${DateTime.now().toISO()})`
  );
  try {
    const currentPSTDateTime = DateTime.now().setZone(TIMEZONE);
    const yesterdayEndPSTDateTime = currentPSTDateTime.minus({ days: 1 }).endOf('day');

    let passesToChange = [];
    const passes = await getPassesByStatus(ACTIVE_STATUS);
    console.log("Active Passes:", passes);

    for (pass of passes) {
      // NOTE: Pass dates are stored in UTC. 
      // If pass date converted to PST is before the end of yesterday, it's definitely expire (AM/PM/DAY)
      const passPSTDateTime = DateTime.fromISO(pass.date).setZone(TIMEZONE);
      if (passPSTDateTime <= yesterdayEndPSTDateTime){
        console.log("Expiring:", pass);
        passesToChange.push(pass);
      }

      // If AM, see if we're currently in the afternoon or later compared to the pass date's noon time.
      const passAMExpiryPSTDateTime = currentPSTDateTime.startOf('day').plus({hours: PASS_TYPE_EXPIRY_HOURS.AM});
      if (pass.type === PASS_TYPE_AM && currentPSTDateTime >= passAMExpiryPSTDateTime){
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
