const { formatISO, subDays, getHours } = require('date-fns');
const { utcToZonedTime } = require('date-fns-tz');

const { runQuery, setStatus, getParks } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');

const TABLE_NAME = process.env.TABLE_NAME || 'parksreso';
const TIMEZONE = 'America/Vancouver';
const ACTIVE_STATUS = 'active';
const EXPIRED_STATUS = 'expired';
const PASS_TYPE_EXPIRY_HOURS = {
  AM: 12,
  PM: 0,
  DAY: 0
};

exports.handler = async (event, context) => {
  console.log('Event', event, context);
  try {
    const utcNow = Date.now();
    const localNow = utcToZonedTime(utcNow, TIMEZONE);
    const localHour = getHours(localNow);
    const yesterday = subDays(new Date(localNow), 1);
    console.log(`UTC: ${utcNow}; local (${TIMEZONE}): ${localNow}; yesterday: ${yesterday}`);

    for (const passType in PASS_TYPE_EXPIRY_HOURS) {
      const expiryHour = PASS_TYPE_EXPIRY_HOURS[passType];
      if (localHour < expiryHour) {
        console.log(`${passType} passes don't expire yet`);
        continue;
      }

      // If expiring at midnight, check yesterday's passes.
      const expiryDate = expiryHour === 0 ? yesterday : localNow;
      const parks = await getParks();
      for (const park of parks) {
        const passes = await getExpiredPasses(passType, expiryDate, park.sk);
        await setStatus(passes, EXPIRED_STATUS);
      }
    }

    return sendResponse(200, {}, context);
  } catch (err) {
    console.error(err);

    return sendResponse(500, {}, context);
  }
};

async function getExpiredPasses(passType, passDate, parkSk) {
  const dateSelector = formatISO(passDate, { representation: 'date' });

  console.log(`Loading ${passType} passes on ${dateSelector} for ${parkSk}`);

  const passesQuery = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeNames: {
      '#dateselector': 'date',
      '#passType': 'type'
    },
    ExpressionAttributeValues: {
      ':pk': { S: `pass::${parkSk}` },
      ':activeDate': { S: dateSelector },
      ':activeStatus': { S: ACTIVE_STATUS },
      ':passType': { S: passType }
    },
    FilterExpression: 'begins_with(#dateselector, :activeDate) AND #passType = :passType AND passStatus = :activeStatus'
  };

  return await runQuery(passesQuery);
}
