const dynamoUtil = require('../dynamoUtil');
const jwt = require('jsonwebtoken');
/**
 * Purges expired JWTs from the system.
 * @returns {Promise<void>} A promise that resolves when the purge process is complete.
 */
exports.handler = async (event, context) => {
    const items = await dynamoUtil.getAllStoredJWTs(true);
    console.log(`Going through ${items.length} expired items.`);
    for (const item of items) {
      console.log(`Processing item`);
      if(item.expiration){
          try {
              console.log(item)
              await dynamoUtil.deleteJWT(item.pk, item.sk);
              const token = jwt.decode(item.sk);
              const orcNumber = token.pk.replace(/^0+/, '');
              await dynamoUtil.restoreAvailablePass(orcNumber, token.shortPassDate, token.facilityName, token.numberOfGuests, token.type)
          } catch (error) {
              console.error('Error Deleting JWT:', error);  
            }
      }
    }
}