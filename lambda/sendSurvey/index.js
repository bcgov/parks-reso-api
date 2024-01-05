const AWS = require('aws-sdk');
const { runQuery, TABLE_NAME, META_TABLE_NAME, TIMEZONE, dynamodb } = require('../dynamoUtil');
const { gcnSend } = require('../gcNotifyUtils');
const { webhookPost } = require('../webhookUtils');
const { sendResponse } = require('../responseUtil');
const { DateTime } = require('luxon');
const { logger } = require('../logger');

// Default look-ahead days.
const LOOK_BEHIND_DAYS = 1;
// Maximum number of emails sent in a single bulk call (default for GCN is 50000).
const MAX_BULK_SIZE = 50000;
// Index of short dates.
const PASS_SHORTDATE_INDEX = process.env.PASS_SHORTDATE_INDEX || 'shortPassDate-index';
// Fallback to helpshapebc homepage if no feedback survey provided
const FEEDBACK_SURVEY_URL = process.env.FEEDBACK_SURVEY_URL || 'https://helpshapebc.gov.bc.ca/';
const GC_NOTIFY_IS_SENDING_SURVEYS = process.env.GC_NOTIFY_IS_SENDING_SURVEYS || 'false';

exports.handler = async (event, context) => {
  logger.debug('Send Feedback Survey Emails', event);

  // environment variables are cast as strings
  if (GC_NOTIFY_IS_SENDING_SURVEYS !== 'true') {
    return sendResponse(200, { msg: `Feedback survey emails are currently disabled.` });
  }

  // Get all passes that are expired for yesterday's sessions
  try {
    // We have a shortPassDate-index to query the short date, in PT, that the passes are for. 
    // Using the shortPassDate-index to query short dates is only valid because all the parks live in PT. 
    // If this code is used in other contexts, timezone may have to be considered when querying passes. 
    // As a default: The cronjob will fire at 20:00 UTC
    const todayPST = DateTime.now().setZone(TIMEZONE); // today's datetime in PT
    const yesterdayPST = todayPST.minus({ days: LOOK_BEHIND_DAYS });// add LOOK_AHEAD_DAYS to datetime
    const yesterdayDatePST = yesterdayPST.toISODate() // Look-ahead short date in PT

    // Construct query for all passes reserved for the look-ahead date (PT)
    // Query on index 'shortPassDate-index' to collect passes for all parks at once
    // TODO: remove hard-coded Mt. Seymour only query.
    let queryObj = {
      TableName: TABLE_NAME,
      IndexName: PASS_SHORTDATE_INDEX,
      ExpressionAttributeValues: {
        ':status': { S: 'expired' },
        ':pk': {S: 'pass::0015'},
        ':shortPassDate': { S: yesterdayDatePST },
      },
      KeyConditionExpression: 'shortPassDate = :shortPassDate',
      FilterExpression: 'passStatus = :status AND pk = :pk'
    };
    const passData = await runQuery(queryObj);
    if (passData.length) {
      logger.info(passData.length + ' pass(es) fetched.');
    } else {
      logger.info('No passes found.');
    }

    // Construct array of data to pass to GCNotify.
    // Entries must follow the order of the bulkEmail array.
    // registrationNumber is not used in the email template but will be used in our metadata tracking
    // Note: an empty list will have length = 1.
    const headerRow = [["email address", "firstName", "park", "surveyLink", "registrationNumber"]];

    // An object containing the passes to be sent via GCN, divided into MAX_BULK_SIZE chunks.
    let bulkEmailObject = [];

    if (passData.length) {
      for (let i = 0; i < passData.length; i += MAX_BULK_SIZE) {
        let bulkEmailChunk = [...headerRow];
        let passChunk = passData.slice(i, i + MAX_BULK_SIZE);
        for (let pass of passChunk) {
          const row = [
            pass.email || null,
            pass.firstName || null,
            pass.parkName || null,
            FEEDBACK_SURVEY_URL,
            pass.sk || null,
          ];
          bulkEmailChunk.push(row);
        }
        bulkEmailObject.push(bulkEmailChunk);
      }
    }

    bulkJobSuccesses = 0;
    bulkJobFailures = 0;

    if (bulkEmailObject.length > 0) {
      // There are passes in the system.
      for (const chunk of bulkEmailObject) {
        let resData;
        let jobError = '';
        try {
          // Try to send a bulk batch of reminder emails.
          let gcnSendObj = {
            name: `DUP bulk feedback survey emails: sent ${DateTime.utc().toISO()}.`,
            template_id: process.env.GC_NOTIFY_SURVEY_TEMPLATE_ID,
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
          let jobObj = await postBulkSummary(resData, jobError, chunk);
          if (jobError) {
            // Post alert to webhook if job fails.
            await webhookPost(
              process.env.WEBHOOK_URL,
              "Day Use Pass - Bulk Email Service",
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
      logger.info('No passes found for feedback survey service.')
    }
    const totalJobs = bulkJobSuccesses + bulkJobFailures;
    logger.info(`${totalJobs} job(s) run (${bulkJobSuccesses} succeeded, ${bulkJobFailures} failed).`)
  } catch (err) {
    // Something unknown went wrong.
    try {
      await webhookPost(
        process.env.WEBHOOK_URL,
        "Day Use Pass - Bulk Email Service",
        `A bulk feedback survey email job has failed: An unknown error occurred.`,
        [
          {
            title: 'Error:',
            value: `${err}`,
            short: false
          }
        ]
      );
    } catch (e) {
      // Catch and fall through
      logger.debug(e);
    }
    return sendResponse(400, { msg: 'Something went wrong.', title: 'Operation Failed' });
  }
}

async function postBulkSummary(data, jobError, passArray) {
  let passes = [];
  let postItem;
  try {
    if (passArray && jobError) {
      // collect and save reservation numbers
      for (let i = 1; i < passArray.length; i++) {
        passes.push(passArray[i][4]);
      }
    }
    postItem = {
      pk: 'feedbackSurveySummary',
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
    logger.debug('Posted bulk feedbackSurveySummary to database:', postItem);
    return postItem;
  } catch (err) {
    try {
      await webhookPost(
        process.env.WEBHOOK_URL,
        "Day Use Pass - Bulk Email Service",
        `A bulk feedback survey email job has failed: The system was unable to save a record of the bulk email job to DynamoDB.`,
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
    } catch (e) {
      // Catch and fall through
      logger.debug(e);
    }
    logger.error('Failed to save bulk feedback survey email job to database:', err);
    return postItem;
  }
}