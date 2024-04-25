const { DateTime } = require("luxon");
const { getParks, getFacilities, TIMEZONE, logger, sendResponse} = require("/opt/baseLayer");
const { createMetric, postAllMetrics } = require("/opt/metricsUtil");
const { getFutureReservationObjects } = require('/opt/reservationUtil');


const today = DateTime.now().setZone(TIMEZONE);

exports.handler = async (event, context) => {
  logger.debug('Running metrics collection service');

  try {
    const metrics = await createAllMetrics();
    await postAllMetrics(metrics);
    logger.info('Metrics collection complete.');
    return sendResponse(200, { msg: `Metrics updated.`, title: 'Operation successful.' });
  } catch (error) {
    logger.error(error);
    return sendResponse(400, { msg: `Something went wrong collecting metrics data.`, title: 'Operation failed.', error: error })
  }
}

async function createAllMetrics() {
  // For each subarea, get up-to-date metrics
  let metricsObj = [];
  try {
    // We need to get a list of all dates into the future starting from today that have data.
    // We can do this by getting a list of all the future reservations Objects for each park and extracting the date.
    // If there are no reservation objects, we can assume theres nothing to track. 
    const parks = await getParks();
    for (const park of parks) {
      const facilities = await getFacilities(park.sk);
      for (const facility of facilities) {
        // Get future reservation objects for that park/facility
        const futureResObjs = await getFutureReservationObjects(park.sk, facility.name);
        let todayFlag = false;
        if (futureResObjs) {
          for (const date of futureResObjs) {
            // Create a metrics item for each future date
            if (date.sk === today.toISODate()) {
              // We have a reservationObject for today
              todayFlag = true;
            }
            const futureResMetric = await createMetric(park, facility, date.sk);
            metricsObj.push(futureResMetric);
          }
        }
        if (!todayFlag) {
          // We need to update today's metrics object no matter what
          const todayMetric = await createMetric(park, facility, today.toISODate());
          metricsObj.push(todayMetric);
        }
      }
    }

    logger.debug('Metrics object:', metricsObj);
    logger.info(`Metrics object (${metricsObj.length} items) successfully created.`)
    return metricsObj;
  } catch (error) {
    throw error;
  }
}


