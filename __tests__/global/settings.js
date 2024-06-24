const REGION = process.env.AWS_REGION || 'local-env';
const ENDPOINT = process.env.DB_ENDPOINT_OVERRIDE || 'http://localhost:8000';
const TABLE_NAME = process.env.TABLE_NAME || 'parksreso-tests';
const TIMEZONE = 'America/Vancouver';

module.exports = {
  REGION,
  ENDPOINT,
  TABLE_NAME,
  TIMEZONE
};
