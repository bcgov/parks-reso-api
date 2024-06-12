const AWS = require('aws-sdk');
const { dynamodb, TABLE_NAME, getParks, getFacilities } = require('./lambda/dynamoUtil');
// Install inquirer @v8.0.0 to avoid EMCAScript error
const inquirer = require('inquirer');
const { DateTime, Interval, Duration } = require('luxon');
const { cancel } = require('aws-crt');
const { sk } = require('date-fns/locale');
const fs = require('fs');

async function run() {
  console.log('*** Check pass sellout time ***');
  try {

    // Get facility
    let facility = await getFacility();
    // Get date
    let date = await getDate();
    // Get pass type
    let passType = await getPassType(facility);

    // Get reservation obj
    let reservation = await getReservation(facility, date);
    // run calcuation
    if (!reservation.Count) {
      throw new Error(`No reservations found for ${date} at ${facility.name}`);
    }

    // Unmarshall the reservation object
    reservation = reservation.Items.map((item) => AWS.DynamoDB.Converter.unmarshall(item));

    // Get passes
    let passes = await getPasses(facility, date, passType);

    // Sort passes by status
    let passStatuses = sortPassesByStatus(passes.Items);

    // If the facility is fully booked, the sellout time is the time the last reserved pass WAS CREATED, not committed.
    const allPasses = passes.Items.map((pass) => AWS.DynamoDB.Converter.unmarshall(pass));
    let count = [...allPasses].reduce((acc, pass) => acc + pass.numberOfGuests, 0);

    // Sort passes by creation time
    let sortedPasses = sortByCreatedTime(allPasses);

    // Create capacity change event array
    const events = createCapacityChangeEventArray(sortedPasses);

    // Estimate sellout time
    const selloutTime = estSelloutTime(events, passType, reservation[0]);
    showPassBreakdown(passStatuses, selloutTime, facility, passType, date, events);

  } catch (error) {
    console.log('error:', error);
  }

}

/**
 * Retrieves the facility information by prompting the user to select a facility.
 *
 * @returns {Promise<Object>} A promise that resolves to the selected facility object.
 * @throws {Error} If there is an error selecting the facility.
 */
async function getFacility() {
  let facilities = [];
  const parks = await getParks();
  for (const park of parks) {
    const parkFacilities = await getFacilities(park.orcs);
    facilities = facilities.concat(parkFacilities);
  }
  let facility;
  try {
    facility = await inquirer.prompt([
      {
        type: 'list',
        name: 'facility',
        message: 'Select facility:',
        choices: facilities.map(facility => {
          return {
            name: facility.name,
            value: {
              pk: facility.pk,
              sk: facility.sk,
              name: facility.name,
              passTypes: Object.keys(facility.bookingTimes)
            }
          };
        })
      }
    ]);
    return facility.facility;
  } catch (error) {
    throw new Error('Error selecting facility:', error);
  }
}

/**
 * Retrieves a valid date from the user.
 * @returns {Promise<string>} The selected date in the format 'YYYY-MM-DD'.
 * @throws {Error} If there is an error selecting the date.
 */
async function getDate() {
  let date;
  try {
    while (!date || date.invalid) {
      userDate = await inquirer.prompt([
        {
          type: 'input',
          name: 'date',
          message: 'Enter date (YYYY-MM-DD):'
        }
      ]);
      date = DateTime.fromFormat(userDate.date, 'yyyy-LL-dd').setZone('America/Vancouver');
      console.log('date:', date);
      if (date.invalid) {
        console.log('Invalid date. Please try again.');
      }
    }
    return userDate.date;
  } catch (error) {
    throw new Error('Error selecting date:', error);
  }
}

/**
 * Retrieves the pass type for a given facility.
 *
 * @param {Object} facility - The facility object.
 * @returns {Promise<string>} - The selected pass type.
 * @throws {Error} - If there is an error selecting the pass type.
 */
async function getPassType(facility) {
  let passType;
  console.log('facility.passTypes:', facility.passTypes);
  try {
    passType = await inquirer.prompt([
      {
        type: 'list',
        name: 'passType',
        message: 'Select pass type:',
        choices: facility.passTypes
      }
    ]);
    return passType.passType;
  } catch (error) {
    throw new Error('Error selecting passtype:', error);
  }
}

/**
 * Retrieves a reservation object for a given facility and date.
 * @param {Object} facility - The facility object.
 * @param {string} date - The date of the reservation.
 * @returns {Promise<Object>} - A promise that resolves to the reservation object.
 * @throws {Error} - If there is an error getting the reservation object.
 */
async function getReservation(facility, date) {
  let orcs = facility.pk.split('::')[1];
  const query = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk AND sk = :sk',
    ExpressionAttributeValues: {
      ':pk': { S: `reservations::${orcs}::${facility.sk}` },
      ':sk': { S: date }
    }
  };
  try {
    const reservation = await dynamodb.query(query).promise();
    return reservation;
  } catch (error) {
    throw new Error('Error getting reservation object:', error);
  }
}

/**
 * Retrieves passes from the database based on the specified facility, date, and pass type.
 * @param {Object} facility - The facility object containing the facility name.
 * @param {string} date - The date in string format.
 * @param {string} passType - The type of pass.
 * @returns {Promise<Object>} - A promise that resolves to the passes retrieved from the database.
 * @throws {Error} - If there is an error collecting passes from the database.
 */
async function getPasses(facility, date, passType) {
  const query = {
    TableName: TABLE_NAME,
    IndexName: 'manualLookup-index',
    KeyConditionExpression: 'shortPassDate = :date AND facilityName = :facility',
    ExpressionAttributeNames: {
      '#type': 'type'
    },
    FilterExpression: '#type = :type',
    ExpressionAttributeValues: {
      ':date': { S: date },
      ':facility': { S: facility.name },
      ':type': { S: passType }
    }
  };
  try {
    const passes = await dynamodb.query(query).promise();
    return passes;
  } catch (error) {
    throw new Error('Error collecting passes:', error);
  }
}

/**
 * Sorts an array of passes by their status.
 *
 * @param {Array} passes - The array of passes to be sorted.
 * @returns {Object} - An object containing arrays of passes grouped by status.
 */
function sortPassesByStatus(passes) {
  let statuses = {};
  for (const pass of passes) {
    if (!statuses[pass.passStatus.S]) {
      statuses[pass.passStatus.S] = [];
    }
    statuses[pass.passStatus.S].push(AWS.DynamoDB.Converter.unmarshall(pass));
  }
  return statuses;
}

/**
 * Sorts an array of passes by their creation date in ascending order.
 *
 * @param {Array} passes - The array of passes to be sorted.
 * @returns {Array} - The sorted array of passes.
 */
function sortByCreatedTime(passes) {
  let sortedPasses = passes.sort((a, b) => {
    return a.creationDate.localeCompare(b.creationDate);
  });
  return sortedPasses;
}

/**
 * Creates an array of capacity change events based on the given passes.
 *
 * @param {Array} passes - An array of passes.
 * @returns {Array} - An array of capacity change events sorted by date.
 */
function createCapacityChangeEventArray(passes) {
  const events = [];
  for (const pass of passes) {
    let auditTrail = pass.audit;
    for (const auditEvent of auditTrail) {
      if (auditEvent?.passStatus === 'cancelled') {
        events.push({
          date: auditEvent.dateUpdated,
          sk: pass.sk,
          passStatus: pass.passStatus,
          auditStatus: auditEvent.passStatus,
          numberOfGuests: pass.numberOfGuests,
          change: -1 * pass.numberOfGuests
        });
      } else if (auditEvent?.passStatus === 'hold') {
        events.push({
          date: pass.creationDate,
          sk: pass.sk,
          passStatus: pass.passStatus,
          auditStatus: auditEvent.passStatus,
          numberOfGuests: pass.numberOfGuests,
          change: pass.numberOfGuests
        });
      }
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Estimates the sellout time based on the given events, facility, pass type, and reservation.
 *
 * @param {Array} events - The array of events.
 * @param {string} passType - The pass type.
 * @param {Object} reservation - The reservation object.
 * @param {Object} reservation.capacities - The capacities object.
 * @param {number} reservation.capacities.baseCapacity - The base capacity.
 * @param {number} reservation.capacities.capacityModifier - The capacity modifier.
 * @returns {Date|null} - The estimated sellout time or null if no sellout occurs.
 */
function estSelloutTime(events, passType, reservation) {
  // Get capacity
  const capacity = reservation.capacities[passType].baseCapacity + reservation.capacities[passType].capacityModifier;
  let runningCapacity = capacity;
  let selloutTime;
  for (const event of events) {
    runningCapacity -= event.change;
    event.capacity = runningCapacity;
    if (runningCapacity <= 0 && !selloutTime) {
      selloutTime = event.date;
    }
  }
  return selloutTime;
}

/**
 * Displays the breakdown of passes and their statuses.
 *
 * @param {Object} passes - The passes object containing pass statuses.
 * @param {string} selloutTime - The sellout time of the passes.
 * @param {Object} facility - The facility object.
 * @param {string} passType - The type of pass.
 * @param {string} date - The date of the passes.
 * @param {Object} events - The events object.
 * @returns {Promise<void>} - A promise that resolves when the breakdown is displayed.
 */
async function showPassBreakdown(passes,  selloutTime, facility, passType, date, events) {
  let statuses = {};
  let total = 0;
  for (const status of Object.keys(passes)) {
    statuses[status] = passes[status].reduce((acc, pass) => acc + pass.numberOfGuests, 0);
    total += statuses[status];
  }
  statuses['total'] = total;
  console.log('************');
  console.log(`${facility.name} (${passType}) on ${date}`);
  console.log('statuses:', statuses);
  if (selloutTime) {
    const time = DateTime.fromISO(selloutTime).setZone('America/Vancouver');
    const open = time.startOf('day').plus({ hours: 7 });
    const interval = Interval.fromDateTimes(open, time);
    const duration = interval.toDuration();
    console.log(`Sold out at ${time.toFormat('HH:mm:ss')} (${duration.as('minutes')} minutes)`);
  } else {
    console.log('Not yet sold out.');
  }
  console.log('************');
  let csv = await inquirer.prompt(
    {
      type: 'confirm',
      name: 'csv',
      message: 'Export breakdown as csv?:',
    }
  );
  if (csv.csv) {
    exportAsCsv(events, facility, passType, date);
  }
}

function exportAsCsv(events, facility, passType, date){
  let csv = 'date,sk,passStatus,auditStatus,numberOfGuests,change,capacity\n';
  for (const event of events) {
    csv += `${event.date},${event.sk},${event.passStatus},${event.auditStatus},${event.numberOfGuests},${event.change},${event.capacity}\n`;
  }
  fs.writeFile(`selloutTime_${facility.name}_${passType}_${date}.csv`, csv, (err) => {
    if (err) {
      console.log('err:', err);
    }
  })
}

// Avoid AWS SDK V2 warning text
setTimeout(() => {
  run();
}, 500);