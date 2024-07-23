const IS_OFFLINE = process.env.IS_OFFLINE && process.env.IS_OFFLINE === "true" ? true : false;

const options = {};
if (IS_OFFLINE) {
  options.region = "local";
  // For local we use port 3002 because we're hitting an invokable
  options.endpoint = "http://localhost:3002";
}

const { runQuery,
  TABLE_NAME,
  sendResponse,
  checkWarmup,
  logger,
  marshall,
  s3Client,
  getSignedUrl,
  GetObjectCommand,
  dynamoClient,
  lambda } = require('/opt/baseLayer');
const { decodeJWT, resolvePermissions } = require('/opt/permissionLayer');
const { convertRolesToMD5 } = require('/opt/exportAllPassLayer');
const { PutItemCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');

const bucket = process.env.S3_BUCKET_DATA || "parks-dup-assets-tools";

const EXPORT_FUNCTION_NAME =
  process.env.EXPORT_FUNCTION_NAME || "dup-api-exportAllPassInvokable";

const EXPIRY_TIME = process.env.EXPORT_EXPIRY_TIME
  ? Number(process.env.EXPORT_EXPIRY_TIME)
  : 60 * 15; // 15 minutes

exports.handler = async (event, context) => {
  logger.info('Export all pass', event);

  if (event?.httpMethod === 'OPTIONS') {
    return sendResponse(200, {}, context);
  }

  if (checkWarmup(event)) {
    return sendResponse(200, {});
  }

  try {
    const token = await decodeJWT(event);
    const permissionObject = resolvePermissions(token);
    if (permissionObject.isAdmin !== true) {
      logger.info("Unauthorized");
      return sendResponse(403, { msg: 'Unauthorized' });
    }

    const sk = convertRolesToMD5(permissionObject.roles, "export-");

    if (event?.queryStringParameters?.getJob) {
      logger.info("Requesting status of job:", event?.queryStringParameters?.getJob)
      let queryObj = {
        TableName: TABLE_NAME,
        ExpressionAttributeValues: {
          ":pk": { S: "job" },
          ":sk": { S: sk },
        },
        KeyConditionExpression: "pk =:pk and sk =:sk",
      };
      const res = (await runQuery(queryObj))[0];
      // If the getJob flag is set, that means we are trying to download the report
      if (!res) {
        logger.info("Job doesn't exist")
        // Job does not exist.
        return sendResponse(200, { status: "Job not found" }, context);
      } else if (res.progressPercentage === 100) {
        logger.info("Job is 100% complete, returning signed URL")
        // Job is 100% complete, return signed url
        let URL = "";
        if (!IS_OFFLINE) {
          logger.debug('S3_BUCKET_DATA:', bucket);
          logger.debug('key:', res.key);
          let command = new GetObjectCommand({ Bucket: bucket, Key: res.key });
          URL = await getSignedUrl(
            s3Client,
            command,
            { expiresIn: EXPIRY_TIME });
        }
        delete res.pk;
        delete res.sk;
        delete res.key;
        return sendResponse(
          200,
          { status: "Job complete", signedURL: URL, jobObj: res },
          context
        );
      } else {
        logger.info("Send back the latest job", res);
        // Send back the latest job obj.
        delete res.pk;
        delete res.sk;
        delete res.key;
        return sendResponse(
          200,
          { status: res.progressDescription, jobObj: res },
          context
        );
      }
    } else {
      // We are trying to create a report.
      const putObject = {
        TableName: TABLE_NAME,
        ExpressionAttributeValues: {
          ":percent": { N: "100" },
        },
        ConditionExpression:
          "(attribute_not_exists(pk) AND attribute_not_exists(sk)) OR progressPercentage = :percent",
        Item: marshall({
          pk: "job",
          sk: sk,
          progressPercentage: 0,
          progressDescription: "Initializing report.",
        }),
      };
      logger.debug(putObject);
      try {
        let command = PutItemCommand(putObject);
        let res = await dynamoClient.send(command);
        // Check if there's already a report being generated.
        // If there are is no instance of a job or the job is 100% complete, generate a report.
        logger.debug("Creating a new export job.");
        await createJob(sk, permissionObject);
        return sendResponse(200, { status: "Export job created", sk: sk }, context);
      } catch (error) {
        // A job already exists.
        let queryObj = {
          TableName: TABLE_NAME,
          ExpressionAttributeValues: {
            ":pk": { S: "job" },
            ":sk": { S: sk },
          },
          KeyConditionExpression: "pk =:pk and sk =:sk",
        };
        const res = (await runQuery(queryObj))[0];
        if (res.progressDescription === 'Job Failed') {
          let command = DeleteItemCommand(queryObj);
          await dynamoClient.deleteItem(command);
          await createJob(sk, permissionObject);
        }
        logger.error(error);
        return sendResponse(200, { status: "Job is already running", sk: sk }, context);
      }
    }
  } catch (err) {
    logger.error(err);
    return sendResponse(400, err, context);
  }
};

async function createJob(sk, permissionObject) {
  const params = {
    FunctionName: EXPORT_FUNCTION_NAME,
    InvocationType: "Event",
    LogType: "None",
    Payload: JSON.stringify({
      jobId: sk,
      roles: permissionObject.roles,
    }),
  };
  // Invoke generate report function
  await // The `.promise()` call might be on an JS SDK v2 client API.
  // If yes, please remove .promise(). If not, remove this comment.
  lambda.invoke(params).promise();
}
