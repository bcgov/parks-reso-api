const axios = require('axios');
const { logger } = require('./logger');

const DATA_REGISTRY_URL = process.env.DATA_REGISTRY_URL;
const DATA_REGISTER_NAME_API_KEY = process.env.DATA_REGISTER_NAME_API_KEY;

async function getCurrentNameData(identifier) {
  const url = DATA_REGISTRY_URL + `/parks/${identifier}/name?status=current`
  try {
    const data = await axios({
      method: 'get',
      url: url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'None',
        'x-api-key': DATA_REGISTER_NAME_API_KEY
      }
    })
    return data;
  } catch (err) {
    logger.error(`Failed to get current name data for ${identifier}.`, err);
    throw err;
  }
}

async function getCurrentDisplayNameById(identifier) {
  // cast identifier as number
  try {
    let data = await getCurrentNameData(Number(identifier));
    let item = data?.data?.data?.items[0];
    return item?.displayName || null;
  } catch (err) {
    logger.error('Failed to get current display name by id.', err);
    throw err;
  }
}

module.exports = {
  getCurrentNameData,
  getCurrentDisplayNameById
}