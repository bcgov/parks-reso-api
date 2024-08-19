const REGION = process.env.AWS_REGION || 'local-env';
<<<<<<< HEAD:__tests__/global/settings.js
const ENDPOINT = 'http://localhost:8000';
=======
const ENDPOINT = 'http://172.17.0.2:8000';
>>>>>>> 00b1f9f... Sam Build Files:samNode/__tests__/settings.js
const TABLE_NAME = process.env.TABLE_NAME || 'parksreso-tests';
const TIMEZONE = 'America/Vancouver';

module.exports = {
  REGION,
  ENDPOINT,
  TABLE_NAME,
  TIMEZONE
};
