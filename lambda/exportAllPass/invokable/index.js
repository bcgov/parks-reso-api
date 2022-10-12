const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const { runScan, TABLE_NAME } = require("../../dynamoUtil");
const { updateJobEntry } = require("../functions");
const { logger } = require('../../logger');

const FILE_NAME = process.env.FILE_NAME || "DUP_Export";

const DISABLE_PROGRESS_UPDATES =
  process.env.DISABLE_PROGRESS_UPDATES &&
    process.env.DISABLE_PROGRESS_UPDATES === "true"
    ? true
    : false;

let JOB_ID;
let S3_KEY;

exports.handler = async (event, context) => {
  logger.debug("EXPORT", event || {});

  let queryObj = {
    TableName: TABLE_NAME,
  };

  try {
    if (event?.jobId && event?.roles) {
      JOB_ID = event.jobId;
      S3_KEY = JOB_ID + "/" + FILE_NAME + ".csv";

      queryObj.ExpressionAttributeValues = {};
      queryObj.ExpressionAttributeValues[':pk'] = { S: 'pass::' };
      queryObj.FilterExpression = 'contains (pk, :pk)';

      await updateJobWithState(0, "Fetching all passes.", 10);

      let scanResults = [];
      let passData;
      do {
          passData = await runScan(queryObj, true);
          passData.data.forEach((item) => scanResults.push(item));
          queryObj.ExclusiveStartKey = passData.LastEvaluatedKey;
      } while (typeof passData.LastEvaluatedKey !== "undefined");
      
      const csvData = csvjson.toCSV(scanResults);
      
      logger.debug(scanResults.length + " records found");
      await updateJobWithState(0, "Uploading file", 50);

      const params = {
        Bucket: process.env.S3_BUCKET_DATA,
        Key: S3_KEY,
        Body: csvData
      }

      let res = null;
      try {
        // Upload file
        res = await s3.putObject(params).promise();
        await updateJobWithState(7, "Export ready.", 100);

      } catch (err) {
        logger.error(err);
      }

      logger.debug("=== Export successful ===");
    }
  } catch (err) {
    logger.error(err);
  }
};

async function updateJobWithState(
  state,
  messageOverride = null,
  percentageOverride = null
) {
  let jobObj = {
    sk: JOB_ID,
    progressPercentage: 0,
    key: S3_KEY,
    progressDescription: "",
  };
  if (!DISABLE_PROGRESS_UPDATES) {
    switch (state) {
      case 1:
        jobObj.progressPercentage = percentageOverride || 0;
        jobObj.progressDescription =
          messageOverride || "Fetching entries from Database.";
        break;
      case 2:
        jobObj.progressPercentage = percentageOverride || 20;
        jobObj.progressDescription = messageOverride || "Fetch complete.";
        break;
      case 3:
        jobObj.progressPercentage = percentageOverride || 35;
        jobObj.progressDescription =
          messageOverride || "Grouping activities by subarea and date.";
        break;
      case 4:
        jobObj.progressPercentage = percentageOverride || 65;
        jobObj.progressDescription =
          messageOverride || "Generating rows for report.";
        break;
      case 5:
        jobObj.progressPercentage = 80;
        jobObj.progressDescription = "Generating report.";
        break;
      case 6:
        jobObj.progressPercentage = 90;
        jobObj.progressDescription = "Uploading document to S3.";
        break;
      case 7:
        jobObj.progressPercentage = 100;
        jobObj.progressDescription = "Job Complete. Your document is ready.";
        jobObj.dateGenerated = new Date().toISOString();
      default:
        break;
    }
    await updateJobEntry(jobObj, TABLE_NAME);
  } else if (state === 7) {
    jobObj.progressPercentage = 100;
    jobObj.progressDescription = "Job Complete. Your document is ready.";
    jobObj.dateGenerated = new Date().toISOString();
    await updateJobEntry(jobObj, TABLE_NAME);
  }
  CURRENT_PROGRESS_PERCENT = jobObj.progressPercentage;
}
