const AWS = require('aws-sdk');
const { runQuery, TABLE_NAME, META_TABLE_NAME, TIMEZONE, dynamodb, getParks, getFacilities, getPark } = require('../dynamoUtil');
const { gcnSend } = require('../gcNotifyUtils');
const { rcPost } = require('../rocketChatUtils');
const { sendResponse } = require('../responseUtil');
const { DateTime } = require('luxon');
const { logger } = require('../logger');
const { sendSMSMessage } = require('../smsUtil');

// Default look-ahead days.
const LOOK_AHEAD_DAYS = 1;
// Maximum number of emails sent in a single bulk call (default for GCN is 50000).
const MAX_BULK_SIZE = 50000;
// Index of short dates.
const PASS_SHORTDATE_INDEX = process.env.PASS_SHORTDATE_INDEX || 'shortPassDate-index';

exports.handler = async (event, context) => {
  logger.debug('Send Reminder Emails', event);

  // environment variables are cast as strings
  if (process.env.GC_NOTIFY_IS_SENDING_REMINDERS !== 'true') {
    logger.info(`Email reminders are currently disabled.`);
    return sendResponse(200, { msg: `Email reminders are currently disabled.` });
  }

  // Get all passes that will be active at the look-ahead time. 
  try {
    // Determine look-ahead date
    // Done this way to account for rollovers at the end of months & years
    // We have a shortPassDate-index to query the short date, in PT, that the passes are for. 
    // Using the shortPassDate-index to query short dates is only valid because all the parks live in PT. 
    // If this code is used in other contexts, timezone may have to be considered when querying passes. 
    // As a default: The cronjob will fire at 00:00 UTC
    const todayPST = DateTime.now().setZone(TIMEZONE); // today's datetime in PT
    const futurePST = todayPST.plus({ days: LOOK_AHEAD_DAYS });// add LOOK_AHEAD_DAYS to datetime
    const lookAheadPST = futurePST.toISODate() // Look-ahead short date in PT

    // Construct query for all passes reserved for the look-ahead date (PT)
    // Query on index 'shortPassDate-index' to collect passes for all parks at once
    let queryObj = {
      TableName: TABLE_NAME,
      IndexName: PASS_SHORTDATE_INDEX,
      ExpressionAttributeValues: {
        ':status': { S: 'reserved' },
        ':shortPassDate': { S: lookAheadPST },
      },
      KeyConditionExpression: 'shortPassDate = :shortPassDate',
      FilterExpression: 'passStatus = :status'
    };
    const passData = await runQuery(queryObj);
    if (passData) {
      logger.info(passData.length + ' pass(es) fetched.');
    } else {
      logger.info('No passes found.');
    }

    // Construct array of data to pass to GCNotify.
    // Entries must follow the order of the bulkReminderRows array:
    // Note: an empty list will have length = 1.
    const headerRow = [["email address", "park", "facility", "date", "type", "registrationNumber", "cancellationLink", "hasQRCode"]];

    // An object containing the passes to be sent via GCN, divided into MAX_BULK_SIZE chunks.
    let bulkReminderObject = [];

    let parkTracker = [];

    const parks = await getParks();
    parkTracker = [...parks];

    for(const park of parks) {
      const facilities = await getFacilities(park.sk);
      const foundIndex = await parkTracker.findIndex(x => x.sk == park.sk);
      const oldParkObj = parkTracker[foundIndex];
      let newParkObj = oldParkObj;
      newParkObj.facilities = [...facilities];
      parkTracker[foundIndex] = newParkObj;
    }

    if (passData) {
      for (let i = 0; i < passData.length; i += MAX_BULK_SIZE) {
        let bulkReminderChunk = [...headerRow];
        let passChunk = passData.slice(i, i + MAX_BULK_SIZE);
        for (let pass of passChunk) {
          const row = [
            pass.email || null,
            pass.parkName || null,
            pass.facilityName || null,
            pass.shortPassDate || null,
            pass.type || null,
            pass.sk || null,
            buildCancellationLink(pass),
            await isQRCodeEnabled(parkTracker, pass.pk.split('::')[1], pass.facilityName)
          ];
          bulkReminderChunk.push(row);
        }
        bulkReminderObject.push(bulkReminderChunk);
      }
    }
    if (passData){
      for (let pass of passData){
        if (pass.phoneNumber != null){
          await sendSMSMessage(pass, buildCancellationLink(pass));
        }
      }
    }
    bulkJobSuccesses = 0;
    bulkJobFailures = 0;

    if (bulkReminderObject.length > 0) {
      // There are passes in the system.
      for (const chunk of bulkReminderObject) {
        let resData;
        let jobError = '';
        try {
          // Try to send a bulk batch of reminder emails.
          let gcnSendObj = {
            name: `DUP bulk reminders: sent ${DateTime.utc().toISO()}.`,
            template_id: process.env.GC_NOTIFY_REMINDER_TEMPLATE_ID,
            rows: chunk
          };
          logger.info("Sending to GC Notify");
          const res = await gcnSend(process.env.GC_NOTIFY_API_BULK_PATH, process.env.GC_NOTIFY_API_KEY, gcnSendObj);
          if (res.errors) {
            resData = res?.data?.response?.data;
            jobError = 'GC Notify encountered a problem while trying to send a bulk email to DUP users.';
            logger.error(jobError);
            bulkJobFailures++;
          } else {
            resData = res?.data?.data?.data;
            bulkJobSuccesses++;
          }
        } catch (err) {
          jobError = `The service was unsuccessful in leveraging GC Notify to send a bulk email: ${err}`;
          resData = String(err);
          logger.error(jobError, err)
          bulkJobFailures++;
        }
        try {
          // Post a summary of job success/failure to db.
          let jobObj = await postBulkReminderSummary(resData, jobError, chunk);
          if (jobError) {
            // Post alert to RocketChat channel if job fails.
            sendRocketChatAlert(
              `A bulk email reminder job has failed: ${jobError}`,
              [
                {
                  title: 'Job key:',
                  value: `pk: ${jobObj?.pk}\nsk: ${jobObj?.sk}`,
                  short: true
                },
                {
                  title: 'Number of users affected',
                  value: `${chunk.length - 1}`,
                  short: true
                }
              ]
            );
          }
        } catch (err) {
          logger.error('Failed to document the bulk email job:', err);
        }
      }
    } else {
      logger.info('No passes found for reminder service.')
    }
    const totalJobs = bulkJobSuccesses + bulkJobFailures;
    logger.info(`${totalJobs} job(s) run (${bulkJobSuccesses} succeeded, ${bulkJobFailures} failed).`)
  } catch (err) {
    // Something unknown went wrong.
    sendRocketChatAlert(
      `A bulk email reminder job has failed: An unknown error occurred.`,
      [
        {
          title: 'Error:',
          value: `${err}`,
          short: false
        }
      ]
    );
    return sendResponse(400, { msg: 'Something went wrong.', title: 'Operation Failed' });
  }
}

async function isQRCodeEnabled(parks, parkSk, facility) {
  const foundIndex = await parks.findIndex(x => x.sk === parkSk);
  const park = parks[foundIndex];
  const foundFacilityIndex = await park.facilities.findIndex(f => f.sk === facility);
  return park.facilities[foundFacilityIndex].qrcode ? true : false;
}

// Construct pass cancellation links to include in reminder emails.
function buildCancellationLink(pass) {
  const cancellationLink = process.env.PUBLIC_FRONTEND +
    process.env.PASS_CANCELLATION_ROUTE +
    '?passId=' +
    pass.sk +
    '&email=' +
    pass.email +
    '&park=' +
    pass.pk.split('::')[1] +
    '&date=' +
    pass.shortPassDate +
    '&type=' +
    pass.type;
  return cancellationLink;
}

async function postBulkReminderSummary(data, jobError, passArray) {
  let passes = [];
  let postItem;
  try {
    if (passArray && jobError) {
      // We want a list of passes.
      for (let i = 1; i < passArray.length; i++) {
        passes.push(passArray[i][5]);
      }
    }
    postItem = {
      pk: 'sendReminderSummary',
      sk: DateTime.utc().toISO(),
      status: jobError ? 'fail' : 'success',
      response: data,
      passes: passes,
    };
    let postObj = {
      TableName: META_TABLE_NAME,
      Item: AWS.DynamoDB.Converter.marshall(postItem),
      ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
    };
    await dynamodb.putItem(postObj).promise();
    logger.debug('Posted bulkReminderSummary to database:', postItem);
    return postItem;
  } catch (err) {
    sendRocketChatAlert(
      `A bulk email reminder job has failed: The system was unable to save a record of the bulk email job to DynamoDB.`,
      [
        {
          title: 'Error:',
          value: `${err}`,
          short: true
        },
        {
          title: 'Number of users affected:',
          value: `${passArray?.length - 1}`,
          short: true
        }
      ]
    );
    logger.error('Failed to save bulkReminderSummary to database:', err);
    return postItem;
  }
}

function sendRocketChatAlert(text, fields) {
  // Post alert to RocketChat channel if job fails.
  request = {
    postTitle: '@all **Day Use Pass - Bulk Email Service**',
    postText: text,
    author_name: 'Day Use Pass',
    author_icon: 'https://bcparks.ca/_shared/images/logos/logo-bcparks-v-200.png',
    color: '#2D834F',
    fields: fields
  }
  rcPost(process.env.RC_ALERT_WEBHOOK_URL, process.env.RC_ALERT_WEBHOOK_TOKEN, request);
}