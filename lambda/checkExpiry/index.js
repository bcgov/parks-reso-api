const { DateTime } = require('luxon');
const { getPassesByStatus,
  setStatus,
  ACTIVE_STATUS,
  EXPIRED_STATUS,
  PASS_TYPE_EXPIRY_HOURS,
  PASS_TYPE_AM,
  TIMEZONE } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');
const { logger } = require('../logger');

exports.handler = async (event, context) => {
  logger.debug('Check Expiry', event, context);
  logger.debug('Server Time Zone:',
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'undefined',
    `(${DateTime.now().toISO()})`
  );
  try {
    const currentPSTDateTime = DateTime.now().setZone(TIMEZONE);
    // Any active passes before this time will be moved to expired. Same day passes will be handled differently.
    const yesterdayEndPSTDateTime = currentPSTDateTime.minus({ days: 1 }).endOf('day');

    let passesToChange = [];
    const passes = await getPassesByStatus(ACTIVE_STATUS);
    logger.info("Active Passes", passes.length);
    logger.debug("Active Passes:", passes);

    for (pass of passes) {
      // NOTE: Pass dates are stored in UTC.

      // If it is beyond 6pm (18:00 PST/PDT), move every active pass to expired.
      if (currentPSTDateTime.hour >= 18) {
        logger.debug("Expiring:", pass);
        passesToChange.push(pass);
        continue;
      }

      // If pass date converted to PST is before the end of yesterday, it's definitely expire (AM/PM/DAY)
      const passPSTDateTime = DateTime.fromISO(pass.date).setZone(TIMEZONE);
      if (passPSTDateTime <= yesterdayEndPSTDateTime){
        logger.debug("Expiring:", pass);
        passesToChange.push(pass);
        continue;
      }

      // If AM, see if we're currently in the afternoon or later compared to the pass date's noon time.
      const passAMExpiryPSTDateTime = currentPSTDateTime.startOf('day').plus({hours: PASS_TYPE_EXPIRY_HOURS.AM});
      if (pass.type === PASS_TYPE_AM && currentPSTDateTime >= passAMExpiryPSTDateTime){
        logger.debug("Expiring:", pass);
        passesToChange.push(pass);
      }
    }

    logger.info("Passes To Change:", passesToChange.length)

    // Set passes => expired
    if (passesToChange.length !== 0) {
      await setStatus(passesToChange, EXPIRED_STATUS);
    }

    logger.info("Passes Changed.")

    return sendResponse(200, {}, context);
  } catch (err) {
    logger.error(err);
    // TODO: Notification to RC.
    return sendResponse(500, {}, context);
  }
};
