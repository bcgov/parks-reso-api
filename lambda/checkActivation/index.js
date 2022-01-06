const { formatISO } = require('date-fns');
const { utcToZonedTime } = require('date-fns-tz');

const { runQuery, setStatus, getConfig, getParks, getFacilities, TABLE_NAME } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');

const ACTIVE_STATUS = 'active';
const RESERVED_STATUS = 'reserved';
const PASS_TYPE_AM = 'AM';
const PASS_TYPE_PM = 'PM';
const PASS_TYPE_DAY = 'DAY';
const TIMEZONE = 'America/Vancouver';
const PM_ACTIVATION_HOUR = 12;

exports.handler = async (event, context) => {
  console.log('Event:', event, context);
  try {
    const utcNow = Date.now();
    const localNow = utcToZonedTime(utcNow, TIMEZONE);
    console.log(`UTC: ${utcNow}; local (${TIMEZONE}): ${localNow}`);

    const [config] = await getConfig();
    const parks = await getParks();
    for (const park of parks) {
      let activatedCount = 0;

      const facilities = await getFacilities(park.sk);
      for (const facility of facilities) {
        activatedCount += await activateFacilityPasses(config, park, facility, localNow);
      }

      console.log(`Activated ${activatedCount} passes for ${park.sk}`);
    }

    return sendResponse(200, {}, context);
  } catch (err) {
    console.error(err);

    return sendResponse(500, {}, context);
  }
};

async function getCurrentPasses(passType, localNow, parkSk, facilityName) {
  const activeDateSelector = formatISO(localNow, { representation: 'date' });

  console.log(`Loading ${passType} passes on ${activeDateSelector} for ${parkSk} ${facilityName}`);

  const passesQuery = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeNames: {
      '#dateselector': 'date',
      '#passType': 'type'
    },
    ExpressionAttributeValues: {
      ':pk': { S: `pass::${parkSk}` },
      ':facilityName': { S: facilityName },
      ':activeDate': { S: activeDateSelector },
      ':reservedStatus': { S: RESERVED_STATUS },
      ':passType': { S: passType }
    },
    FilterExpression:
      'begins_with(#dateselector, :activeDate) AND #passType = :passType AND passStatus = :reservedStatus AND facilityName = :facilityName'
  };

  return await runQuery(passesQuery);
}

async function activateFacilityPasses(config, park, facility, localNow) {
  const localHour = localNow.getHours();
  const defaultOpeningHour = config.BOOKING_OPENING_HOUR || 7;

  let activatedCount = 0;
  const facilityBookingOpeningHour = facility.bookingOpeningHour || defaultOpeningHour;
  const isFacilityAmOpen = localHour >= facilityBookingOpeningHour;
  const isFacilityPmOpen = localHour >= PM_ACTIVATION_HOUR;

  for (const passType of [PASS_TYPE_AM, PASS_TYPE_PM, PASS_TYPE_DAY]) {
    let isOpen = false;
    switch (passType) {
      case PASS_TYPE_AM:
        isOpen = isFacilityAmOpen;
        break;
      case PASS_TYPE_PM:
        isOpen = isFacilityPmOpen;
        break;
      case PASS_TYPE_DAY:
        // DAY passes open at the same time as AM
        isOpen = isFacilityAmOpen;
        break;
    }

    if (isOpen) {
      console.log(`Facility ${facility.sk} is open for ${passType} passes`);
      const passes = await getCurrentPasses(passType, localNow, park.sk, facility.name);
      await setStatus(passes, ACTIVE_STATUS);
      activatedCount += passes.length;
    } else {
      console.log(`Facility ${facility.sk} is not open for ${passType} passes`);
    }
  }

  return activatedCount;
}
