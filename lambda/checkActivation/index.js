const { DateTime } = require('luxon');

const { setStatus,
  getPassesByStatus,
  getParks,
  getFacilities,
  RESERVED_STATUS,
  ACTIVE_STATUS,
  EXPIRED_STATUS,
  DEFAULT_PM_OPENING_HOUR,
  PASS_TYPE_PM,
  TIMEZONE } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');
const { logger } = require('../logger');

exports.handler = async (event, context) => {
  logger.debug('Event:', event, context);
  logger.debug('Server Time Zone:',
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'undefined',
    `(${DateTime.now().toISO()})`
  );
  try {
    const currentPSTDateTime = DateTime.now().setZone(TIMEZONE);
    const endOfPSTDayUTCDateTime = currentPSTDateTime.endOf('day').toUTC();

    logger.debug("Checking against date:", endOfPSTDayUTCDateTime.toISO());

    const filter = {
      FilterExpression: '#theDate <= :theDate',
      ExpressionAttributeValues: {
        ':theDate': { S: endOfPSTDayUTCDateTime.toISO() }
      },
      ExpressionAttributeNames: {
        '#theDate': 'date'
      }
    };

    logger.debug("Getting passes by status:", RESERVED_STATUS, filter);

    const passes = await getPassesByStatus(RESERVED_STATUS, filter);
    logger.info("Reserved Passes:", passes.length);

    // Query the passStatus-index for passStatus = 'reserved'
    // NB: Filter on date <= endOfToday for fixing previous bad data.
    // What period are we in? AM/PM?
    const startPMHourPSTDateTime = currentPSTDateTime.set({
      hour: DEFAULT_PM_OPENING_HOUR,
      minute: 0,
      second: 0,
      millisecond: 0
    });
    const startDayPSTDateTime = currentPSTDateTime.startOf('day');

    // 1. If currentTimeLocal < DEFAULT_PM_OPENING_HOUR => AM
    // 2. If currentTimeLocal >= DEFAULT_PM_OPENING_HOUR => PM
    const isAM = currentPSTDateTime < startPMHourPSTDateTime ? true : false;
    // const isAM = compareAsc(currentTime, noonTime) <= 0 ? true : false;

    let passesToActiveStatus = [];
    let passesToExpiredStatus = [];

    // Get all facilities for opening hour lookups.
    let facilities = [];
    logger.info("Getting parks");
    const parks = await getParks();
    logger.info("Getting facilities");
    for (let i = 0; i < parks.length; i++) {
      const results = await getFacilities(parks[i].sk);
      facilities = facilities.concat(results);
    }

    // For each pass determine if we're in the AM/DAY for that pass or the PM.  Push into active
    // accordingly, or set it to expired if it's anything < today
    logger.info("Processing Passes:", passes.length);
    for (let i = 0; i < passes.length; i++) {
      let pass = passes[i];

      // pass dates are saved in UTC.
      const passPSTDateTime = DateTime.fromISO(pass.date).setZone(TIMEZONE);
      const passParkSk = pass.pk.split('::')[1];
      const passFacilityName = pass.facilityName;

      // TODO: Fixme into a MAP for better lookups.
      let openingHourTimeForFacility = 7;
      const theFacility = facilities.filter(fac => fac.pk === 'facility::' + passParkSk && fac.sk === passFacilityName);

      if (theFacility && theFacility.length > 0 && theFacility[0].bookingOpeningHour !== undefined && theFacility[0].bookingOpeningHour !== null) {
        openingHourTimeForFacility = theFacility[0].bookingOpeningHour;
      }

      const openingHourPSTDateTime = currentPSTDateTime.set({
        hour: openingHourTimeForFacility,
        minute: 0,
        second: 0,
        millisecond: 0
      });
      
      const isWithinOpeningHour = currentPSTDateTime >= openingHourPSTDateTime ? true : false;

      if (isAM === true && pass.type !== PASS_TYPE_PM && isWithinOpeningHour) {
        passesToActiveStatus.push(pass);
      } else if (isAM === false && pass.type === PASS_TYPE_PM) {
        passesToActiveStatus.push(pass);
      }

      // If we added an item to passesToActiveStatus that was date < begginingOfToday, set to expired, woops!
      if (passPSTDateTime < startDayPSTDateTime){
        // Prune from the active list
        passesToActiveStatus = passesToActiveStatus.filter(item => item.sk !== pass.sk && item.date !== pass.date);

        // Push this one instead to an expired list.
        passesToExpiredStatus.push(pass);
      }
    }
    logger.info("Passes => active:", passesToActiveStatus.length);
    logger.info("Passes => expired:", passesToExpiredStatus.length);

    await setStatus(passesToActiveStatus, ACTIVE_STATUS);
    await setStatus(passesToExpiredStatus, EXPIRED_STATUS);

    logger.info("Passes updated successfully");

    return sendResponse(200, {}, context);
  } catch (err) {
    logger.error(err);

    return sendResponse(500, {}, context);
  }
};
