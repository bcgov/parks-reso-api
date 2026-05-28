const AWS = require('aws-sdk');
const fs = require('fs');
const { DateTime } = require('luxon');

const TABLE_NAME = process.env.TABLE_NAME || 'parksreso';
const INDEX_NAME = 'shortPassDate-index';
const FILE_NAME = 'capacityReport';
let options = {
  region: 'ca-central-1'
}

if (process.env.IS_OFFLINE) {
  options.endpoint = 'http://localhost:8000';
}

const dynamodb = new AWS.DynamoDB(options);

async function runQuery(query) {
  let data = [];
  let pageData = [];
  do {
    if (pageData?.LastEvaluatedKey) {
      query.ExclusiveStartKey = pageData.LastEvaluatedKey;
    };
    pageData = await dynamodb.query(query).promise();
    data = data.concat(pageData.Items.map(item => {
      return AWS.DynamoDB.Converter.unmarshall(item);
    }));
  } while (pageData?.LastEvaluatedKey);
  return data;
}

function checkDates(dates) {
  for (const date of dates) {
    dateObj = DateTime.fromFormat(date, 'yyyy-LL-dd');
    if (dateObj.invalid) {
      throw `'${date}' is not a valid date.`;
    }
  }
}

async function getReservationObjs(park, facility, startDate, endDate) {
  try {
    const reservationQuery = {
      TableName: TABLE_NAME,
      ExpressionAttributeValues: {
        ':pk': { S: `reservations::${park}::${facility}` },
        ':startDate': { S: startDate },
        ':endDate': { S: endDate }
      },
      KeyConditionExpression: 'pk = :pk AND sk BETWEEN :startDate AND :endDate',
    }
    const res = await runQuery(reservationQuery);
    if (res.length === 0) {
      throw `No reservation objects found for: 
      park: ${park}
      facility: ${facility}
      startDate: ${startDate}
      endDate: ${endDate}`
    }
    return res;
  } catch (error) {
    throw `Error collecting reservation objects - ${error}`;
  }
}

async function getCancellations(facility, date, type) {
  try {
    const cancellationQuery = {
      TableName: TABLE_NAME,
      IndexName: INDEX_NAME,
      ExpressionAttributeValues: {
        ':shortPassDate': { S: date },
        ':facilityName': { S: facility },
        ':passStatus': { S: 'cancelled' },
        ':type': { S: type }
      },
      ExpressionAttributeNames: {
        '#type': 'type'
      },
      KeyConditionExpression: 'shortPassDate = :shortPassDate AND facilityName = :facilityName',
      FilterExpression: 'passStatus = :passStatus AND #type = :type'
    }
    const res = await runQuery(cancellationQuery);
    return res;
  } catch (error) {
    throw `Error collecting cancelled pass information - ${error}`;
  }
}

function exportAsJSON(data) {
  try {
    const jsonData = JSON.stringify(data, null, 2);
    const filename = `./${FILE_NAME}${DateTime.utc().toISO()}.json`
    fs.writeFileSync(filename, jsonData);
    console.log(`Successfully wrote to file: ${filename}`);
  } catch (error) {
    throw `Error writing json file - ${error}`;
  }
}

function exportAsCSV(data) {
  try {
    let content = [['Park', 'Facility', 'Date', 'Status', 'AM base capacity', 'AM capacity modifier', 'AM available passes', 'AM cancellations', 'PM base capacity', 'PM capacity modifier', 'PM available passes', 'PM cancellations', 'All-Day base capacity', 'All-Day capacity modifier', 'All-Day available passes', 'All-Day cancellations']];
    for (const row of data) {
      content.push([row.park, row.facility, row.date, row.status,
      row.capacities?.AM?.baseCapacity ?? 'N/A',
      row.capacities?.AM?.capacityModifier ?? 'N/A',
      row.capacities?.AM?.availablePasses ?? 'N/A',
      row.capacities?.AM?.cancellations ?? 'N/A',
      row.capacities?.PM?.baseCapacity ?? 'N/A',
      row.capacities?.PM?.capacityModifier ?? 'N/A',
      row.capacities?.PM?.availablePasses ?? 'N/A',
      row.capacities?.PM?.cancellations ?? 'N/A',
      row.capacities?.DAY?.baseCapacity ?? 'N/A',
      row.capacities?.DAY?.capacityModifier ?? 'N/A',
      row.capacities?.DAY?.availablePasses ?? 'N/A',
      row.capacities?.DAY?.cancellations ?? 'N/A',
      ]);
    }
    let csvData = '';
    for (const csvRow of content) {
      csvData += csvRow.join(',') + "\r\n";
    };
    const filename = `./${FILE_NAME}${DateTime.utc().toISO()}.csv`
    fs.writeFileSync(filename, csvData);
    console.log(`Successfully wrote to file: ${filename}`);
  } catch (error) {
    throw `Error writing csv file - ${error}`;
  }
}

async function main() {
  if (process.argv.length <= 5) {
    console.log("Capacity report generation: Invalid parameters");
    console.log("");
    console.log("Usage: node capacityReport.js <filetype> <park> <facility> <startDate> <endDate>");
    console.log("Ensure you are connected to the proper AWS LZ2 environment before running.");
    console.log("");
    console.log("Options");
    console.log("    <filetype>: csv/json");
    console.log("    <park>: The name of the park");
    console.log("    <facility>: The name of the facility");
    console.log("    <startDate>: Starting date in shortdate form (YYYY-MM-DD)");
    console.log("    <endDate>: (Optional) Ending date in shortdate form (YYYY-MM-DD). If not provided, the summary will use the startDate as the only day.");
    console.log("");
    console.log("example: node capacityReport.js csv \"Joffre Lakes Provincial Park\" \"Joffre Lakes\" 2022-11-29\" 2022-11-30");
    console.log("");
    return;
  }
  try {
    const filetype = process.argv[2];
    const park = process.argv[3];
    const facility = process.argv[4];
    const startDate = process.argv[5];
    let endDate = process.argv[6] ? process.argv[6] : null;
    if (!endDate) {
      endDate = startDate;
    }
    checkDates([startDate, endDate]);
    const reservations = await getReservationObjs(park, facility, startDate, endDate);
    for (let reservation of reservations) {
      for (const type of Object.keys(reservation.capacities)) {
        const cancellations = await getCancellations(facility, reservation.sk, type);
        reservation.capacities[type]['cancellations'] = String(cancellations.length);
      }
      reservation['park'] = reservation.pk.split('::')[1];
      reservation['facility'] = reservation.pk.split('::')[2];
      reservation['date'] = reservation.sk;
      delete reservation.pk;
      delete reservation.sk;
    }
    switch (filetype) {
      case 'csv': {
        exportAsCSV(reservations);
        break;
      };
      case 'json': {
        exportAsJSON(reservations);
        break;
      };
      default: {
        throw 'You must specify csv/json filetype'
      };
    }
  } catch (error) {
    console.log('ERROR:', error);
    return;
  }
}

main();