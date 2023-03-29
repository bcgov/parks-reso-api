// A short developer script to create metrics objects for past dates.
// This script runs the metrics job manually for a set date range instead of looking at today & the future.
// It will overwrite any items it collides with, same as the metrics job does.

const { DateTime, Interval } = require('luxon');
const { TIMEZONE, getParks, getFacilities } = require('../lambda/dynamoUtil');
const { logger } = require('../lambda/logger');
const { createMetric, postAllMetrics } = require('../lambda/metricsUtils');

async function run() {
  console.log('********************');
  console.log('DUP METRICS BACKFILL\n');

  let startDate;
  let endDate;

  try {
    if (process.argv.length <= 3) {
      console.log("Invalid parameters.");
      console.log("");
      console.log("Usage: node backfillMetrics.js <startDate> <endDate>");
      console.log("");
      console.log("Options");
      console.log("    <startDate>: The beginning of the date range to backfill (format: YYYY-MM-DD in PST)");
      console.log("    <endDate>: The end of the date range to backfill (format: YYYY-MM-DD in PST)");
      console.log("");
      console.log("example: node migrate.js 2021-11-30 2023-03-22");
      console.log("");
      return;
    } else {
      // Validate dates
      startDate = process.argv[2];
      endDate = process.argv[3];
      if (startDate > endDate) {
        throw `End date (${endDate}) must be greater than or equal to the start date (${startDate})`;
      }

    }

    // Create array of dates from interval
    const interval = Interval.fromDateTimes(
      DateTime.fromISO(startDate).setZone(TIMEZONE).startOf('day'),
      DateTime.fromISO(endDate).setZone(TIMEZONE).endOf('day')
    ).splitBy({ day: 1 }).map(d => d.start.toISODate());

    console.log(`Gathering metrics for ${interval.length} days.`);

    // For each facility, create a metrics object on every date in interval.
    let metricsObj = [];
    try {
      const parks = await getParks();
      for (const park of parks) {
        const facilities = await getFacilities(park.sk);
        for (const facility of facilities) {
          for (const date of interval) {
            process.stdout.write(` Gathering metrics: ${metricsObj.length + 1}\r`);
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

    console.log(`Creating ${metricsObj.length} new metrics items.`);

    try {
      console.log('Please wait while the metrics are created and uploaded...');
      let result = await postAllMetrics(metricsObj);
      console.log(`Success: ${result} items created.`);
    } catch (error) {
      // Error posting metrics objects
      logger.error(error);
    }

    console.log('\nDUP METRICS BACKFILL - COMPLETE');
    console.log('********************');
  } catch (error) {
    logger.error(error);
  }
}

run();