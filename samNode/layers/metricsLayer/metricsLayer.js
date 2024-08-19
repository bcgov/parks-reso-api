const AWS = require('/opt/baseLayer');
const { DateTime } = require("luxon");
const { METRICS_TABLE_NAME,
  TABLE_NAME,
  TIMEZONE,
  runQuery,
  dynamoClient,
  getOne,
  logger,
  marshall,
  unmarshall,
  TransactWriteItemsCommand } = require("/opt/baseLayer");
const { checkPassesRequired } = require("/opt/reservationLayer");

const MAX_TRANSACTION_SIZE = 25;

async function createMetric(park, facility, date) {
  const today = DateTime.now().setZone(TIMEZONE);
  const currentDate = today.toISODate();
  let capacities = {};
  
  // Get passes for park/facility/date DB:
  let hourlyData = [];
  const [passes, resObj] = await Promise.all([getPassesForDate(facility, date), getReservationObjectForDate(park.sk, facility.sk, date)]);

  for (const time in facility.bookingTimes) {
    capacities[time] = {
      baseCapacity: resObj?.capacities?.[time].baseCapacity ??
        (facility.bookingTimes[time].max || 0),
      capacityModifier: resObj?.capacities?.[time].capacityModifier || 0,
      availablePasses: resObj?.capacities?.[time].availablePasses ??
        (facility?.bookingTimes?.[time]?.max || 0),
      overbooked: resObj?.capacities?.[time].overbooked || 0,
      checkedIn: 0,
      passStatuses: {}
    }
  }

  if (date <= currentDate) {
    // create 24h of hourly data object
    for (let hour = 0; hour <= 23; hour++) {
      hourlyData.push({
        hour: hour,
        checkedIn: 0,
      })
    }
  }

  if (passes.length) {
    for (const pass of passes) {
      if (Object.keys(capacities).indexOf(pass.type) === -1) {
        // The pass belongs to a timeslot that no longer exists.
        capacities[pass.type] = {
          slotDeleted: true,
          baseCapacity: 0,
          capacityModifier: 0,
          availablePasses: 0,
          overbooked: 0,
          passStatuses: {}
        }
      }
      if (capacities[pass.type].slotDeleted) {
        // If timeslot doesn't exist, count pass as overbooked
        capacities[pass.type].overbooked += pass.numberOfGuests;
      }
      if (pass.checkedIn) {
        // Increase total checked in counter
        capacities[pass.type].checkedIn += pass.numberOfGuests;
      }
      if (pass.passStatus) {
        if (!capacities[pass.type].passStatuses[pass.passStatus]) {
          capacities[pass.type].passStatuses[pass.passStatus] = 0;
        }
        capacities[pass.type].passStatuses[pass.passStatus] += pass.numberOfGuests
      }
      // collect hourly data 
      if (pass.checkedInTime && hourlyData.length) {
        const checkInHour = DateTime.fromISO(pass.checkedInTime).get('hour');
        // hourlyData index === 0-23 hour
        hourlyData[checkInHour]['checkedIn'] += pass.numberOfGuests;
      }
    }
  }

  // Get total pass count:
  let totalUsedPasses = 0;
  let totalCancelledPasses = 0;
  let totalCapacity = 0;

  for (const time in capacities) {
    totalCapacity += capacities[time].baseCapacity;
    totalCapacity += capacities[time].capacityModifier;
    totalUsedPasses += capacities[time].passStatuses['active'] || 0;
    totalUsedPasses += capacities[time].passStatuses['reserved'] || 0;
    totalUsedPasses += capacities[time].passStatuses['expired'] || 0;
    totalCancelledPasses += capacities[time].passStatuses['cancelled'] || 0;
  }

  let metricsObj = {
    pk: `metrics::${park.sk}::${facility.sk}`,
    sk: date,
    lastUpdated: today.toISO(),
    totalPasses: totalUsedPasses,
    cancelled: totalCancelledPasses,
    fullyBooked: totalUsedPasses >= totalCapacity ? true : false,
    capacities: capacities,
    status: resObj?.status || facility.status.state || null,
    passesRequired: resObj?.passesRequired || checkPassesRequired(facility, date) || null,
    specialClosure: !!park.specialClosure
  }

  if (hourlyData.length) {
    metricsObj['hourlyData'] = hourlyData;
  }

  return metricsObj;
}

async function postAllMetrics(metrics) {
  // Use AWS TransactWrite as the number of metrics objects could be quite large.
  // The incoming metrics object should not contain collisions, so TransactWrite ok.
  // We will be overwriting existing metrics objects of the same primary key to keep things up to date.

  // Create the transactions
  let transactions = [];
  let errors = [];
  let successes = 0;
  try {
    for (let i = 0; i < metrics.length; i += MAX_TRANSACTION_SIZE) {
      let transactionChunk = { TransactItems: [] };
      const metricsChunk = metrics.slice(i, i + MAX_TRANSACTION_SIZE);
      for (const metric of metricsChunk) {
        try {
          let metricsPutObj = {
            TableName: METRICS_TABLE_NAME,
            Item: marshall(metric)
          }
          transactionChunk.TransactItems.push({
            Put: metricsPutObj
          });
        } catch (error) {
          errors.push(error);
        }
      }
      transactions.push(transactionChunk);
    }
    logger.info('Metrics transactions created.');
  } catch (error) {
    logger.error(error);
  }

  // Execute the transactions
  try {
    let command;
    for (const transaction of transactions) {
      try {
        command = new TransactWriteItemsCommand(transaction)
        await dynamoClient.send(command);
        successes += transaction.TransactItems.length;
      } catch (error) {
        errors.push(error);
        logger.error(error);
      }
    }
    logger.info('Metrics items written to database.');
  } catch (error) {
    logger.error(error);
  }

  if (errors.length) {
    logger.error(errors);
  }
  logger.info('Successes:', successes);
  return successes;
}

async function getPassesForDate(facility, date) {
  try {
    const passQueryObj = {
      TableName: TABLE_NAME,
      IndexName: 'manualLookup-index',
      KeyConditionExpression: 'shortPassDate = :shortPassDate AND facilityName = :facilityName',
      ExpressionAttributeValues: {
        ':shortPassDate': { S: date },
        ':facilityName': { S: facility.sk }
      }
    }
    const passes = await runQuery(passQueryObj, false);
    return passes;
  } catch (error) {
    logger.error(`Error retrieving passes for ${facility?.facilityName}: ${error}`);
    return;
  }
}

async function getReservationObjectForDate(parkSk, facilitySk, date) {
  try {
    const reservation = await getOne(`reservations::${parkSk}::${facilitySk}`, date);
    return unmarshall(reservation);
  } catch (error) {
    logger.error(`Error retrieving reservation object for ${facilitySk}: ${error}`);
    return;
  }
}

module.exports = {
  createMetric,
  postAllMetrics
}
