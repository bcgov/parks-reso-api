// A short developer script to create metrics objects for past dates.
// This script runs the metrics job manually for a set date range instead of looking at today & the future.
// It will overwrite any items it collides with, same as the metrics job does.

const { DateTime, Interval } = require('luxon');
const { TIMEZONE, getParks, getFacilities, logger, sendResponse } = require('/opt/baseLayer');
const { createMetric, postAllMetrics } = require('/opt/metricsLayer');

exports.handler = async (event, context) => {
  logger.info('DUP METRICS BACKFILL', event);

  let startDate = event?.startDate;
  let endDate = event?.endDate;

  try {
    if (!startDate || !endDate) {
      throw "Invalid parameters. Must include startDate and endDate.";
    } else {
      // Validate dates
      if (startDate > endDate) {
        throw `End date (${endDate}) must be greater than or equal to the start date (${startDate})`;
      }
    }

    // Create array of dates from interval
    const interval = Interval.fromDateTimes(
      DateTime.fromISO(startDate).setZone(TIMEZONE).startOf('day'),
      DateTime.fromISO(endDate).setZone(TIMEZONE).endOf('day')
    ).splitBy({ day: 1 }).map(d => d.start.toISODate());

    logger.info(`Gathering metrics for ${interval.length} days.`);

    // For each facility, create a metrics object on every date in interval.
    let metricsObj = [];
    try {
      const parks = await getParks();
      for (const park of parks) {
        const facilities = await getFacilities(park.sk);
        for (const facility of facilities) {
          for (const date of interval) {
            logger.info(` Gathering metrics: ${metricsObj.length + 1}\r`);
            const metric = await createMetric(park, facility, date);
            metricsObj.push(metric);
          }
        }
      }
      process.stdout.write(`\n`);
    } catch (error) {
      // Error creating metrics objects
      logger.error(error);
    }

    logger.info(`Creating ${metricsObj.length} new metrics items.`);

    try {
      logger.info('Please wait while the metrics are created and uploaded...');
      let result = await postAllMetrics(metricsObj);
      logger.info(`Success: ${result} items created.`);
    } catch (error) {
      // Error posting metrics objects
      logger.error(error);
    }

    logger.info('DUP METRICS BACKFILL - COMPLETE');
    logger.info('********************');
    return sendResponse(200, { msg: `Metrics updated.`, title: 'Operation successful.' });
  } catch (error) {
    return sendResponse(400, { msg: `Something went wrong collecting metrics data.`, title: 'Operation failed.', error: error })
  }
};