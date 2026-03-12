const REGION = process.env.AWS_REGION || 'local-env';
const ENDPOINT = process.env.DYNAMODB_ENDPOINT_URL || 'http://172.17.0.2:8000';
const TABLE_NAME = process.env.TABLE_NAME || 'parksreso-tests';
const TIMEZONE = 'America/Vancouver';

module.exports = {
  REGION,
  ENDPOINT,
  TABLE_NAME,
  TIMEZONE
};
