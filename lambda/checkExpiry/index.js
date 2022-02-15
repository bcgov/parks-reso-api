const { compareAsc, addHours, endOfYesterday, startOfDay } = require('date-fns');
const { utcToZonedTime } = require('date-fns-tz');
const { runQuery, setStatus, TABLE_NAME } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');

const timeZone = 'America/Vancouver';
const ACTIVE_STATUS = 'active';
const EXPIRED_STATUS = 'expired';
const PASS_TYPE_EXPIRY_HOURS = {
  AM: 12,
  PM: 0,
  DAY: 0
};

exports.handler = async (event, context) => {
  console.log('Check Expiry', event, context);
  try {
    const endOfYesterdayTime = endOfYesterday();
    const currentTime = utcToZonedTime(new Date(), timeZone);

    let passesToChange = [];
    const passes = await getActivePasses();
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
      if (pass.type === 'AM' && compareAsc(currentTime, noonTime) > 0) {
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

async function getActivePasses() {
  console.log(`Loading passes`);

  const passesQuery = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'passStatus = :activeStatus',
    IndexName: 'passStatus-index',
    ExpressionAttributeValues: {
      ':activeStatus': { S: ACTIVE_STATUS }
    }
  };

  // Grab all the results, don't skip any.
  let results = [];
  let passData;
  do {
    passData = await runQuery(passesQuery, true);
    passData.data.forEach((item) => results.push(item));
    passesQuery.ExclusiveStartKey  = passData.LastEvaluatedKey;
  } while(typeof passData.LastEvaluatedKey !== "undefined");

  return results;
}
