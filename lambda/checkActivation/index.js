const { endOfToday, compareAsc, addHours, startOfDay } = require('date-fns');
const { utcToZonedTime, zonedTimeToUtc } = require('date-fns-tz');

const { setStatus,
        getPassesByStatus,
        getParks,
        getFacilities,
        RESERVED_STATUS,
        ACTIVE_STATUS,
        EXPIRED_STATUS,
        PASS_TYPE_PM,
        timeZone } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');

exports.handler = async (event, context) => {
  console.log('Event:', event, context);
  try {
    const theDate = zonedTimeToUtc(endOfToday(), timeZone);

    console.log("Checking against date:", theDate);

    const filter = {
      FilterExpression: '#theDate <=:theDate',
      ExpressionAttributeValues: {
        ':theDate': { S: theDate.toISOString() }
      },
      ExpressionAttributeNames: {
        '#theDate': 'date'
      }
    };

    console.log("Getting passes by status:", RESERVED_STATUS, filter);

    const passes = await getPassesByStatus(RESERVED_STATUS, filter);
    console.log("Reserved Passes:", passes.length);

    // Query the passStatus-index for passStatus = 'reserved'
    // NB: Filter on date <= endOfToday for fixing previous bad data.
    // What period are we in? AM/PM?
    const currentTime = utcToZonedTime(new Date(), timeZone);
    const noonTime = addHours(startOfDay(currentTime), 12);
    const startOfDayLocalTime = startOfDay(currentTime);

    // 1. If currentTimeLocal < noon => AM
    // 2. If currentTimeLocal >= noon => PM
    const isAM = compareAsc(currentTime, noonTime) <= 0 ? true : false;

    let passesToActiveStatus = [];
    let passesToExpiredStatus = [];

    // Get all facilities for opening hour lookups.
    let facilities = [];
    const parks = await getParks();
    for(let i=0;i<parks.length;i++) {
      const results = await getFacilities(parks[i].sk);
      facilities = facilities.concat(results);
    }
    // console.log("Facilities:", facilities);

    // For each pass determine if we're in the AM/DAY for that pass or the PM.  Push into active
    // accordingly, or set it to expired if it's anything < today
    for (let i=0;i < passes.length;i++) {
      let pass = passes[i];

      const passParkName = pass.pk.split('::')[1];
      const passFacilityName = pass.facilityName;

      // TODO: Fixme into a MAP for better lookups.
      let openingHourTimeForFacility = 7;
      const theFacility = facilities.filter(fac => fac.pk === 'facility::' + passParkName && fac.sk === passFacilityName);

      if (theFacility && theFacility.length > 0 && theFacility[0].bookingOpeningHour !== undefined && theFacility[0].bookingOpeningHour !== null) {
        openingHourTimeForFacility = theFacility[0].bookingOpeningHour;
      }

      const isWithinOpeningHour = compareAsc(currentTime, addHours(startOfDayLocalTime, openingHourTimeForFacility)) >= 0 ? true : false;

      if (isAM === true && pass.type !== PASS_TYPE_PM && isWithinOpeningHour) {
        passesToActiveStatus.push(pass);
      } else if (isAM === false && pass.type === PASS_TYPE_PM) {
        passesToActiveStatus.push(pass);
      }

      // If we added an item to passesToActiveStatus that was date < begginingOfToday, set to expired, woops!
      if (compareAsc(new Date(pass.date), startOfDayLocalTime) <= 0) {
        // Prune from the active list
        passesToActiveStatus = passesToActiveStatus.filter(item => item.sk !== pass.sk && item.date !== pass.date);

        // Push this one instead to an expired list.
        passesToExpiredStatus.push(pass);
      }
    }
    console.log("Passes => active:", passesToActiveStatus.length);
    console.log("Passes => expired:", passesToExpiredStatus.length);

    await setStatus(passesToActiveStatus, ACTIVE_STATUS);
    await setStatus(passesToExpiredStatus, EXPIRED_STATUS);

    return sendResponse(200, {}, context);
  } catch (err) {
    console.error(err);

    return sendResponse(500, {}, context);
  }
};
