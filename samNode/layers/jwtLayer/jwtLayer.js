const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'defaultSecret';
const { logger } = require('/opt/baseLayer');

const ALGORITHM = process.env.ALGORITHM || 'HS384';

/**
 * Verifies the authenticity of a JSON Web Token (JWT).
 *
 * @param {string} token - The JWT to be verified.
 * @returns {Object} - An object containing the verification result and decoded token data.
 *                    If the token is valid, the object will have the following properties:
 *                    - valid: true
 *                    - registrationNumber: The registration number associated with the token.
 *                    - facility: The facility associated with the token.
 *                    - orcs: The ORCS associated with the token.
 *                    - bookingDate: The booking date associated with the token.
 *                    - passType: The pass type associated with the token.
 *                    If the token is invalid, the object will have the following property:
 *                    - valid: false
 */
function verifyJWT(token) {
  try {
    const decoded = jwt.verify(token, SECRET, { algorithm: ALGORITHM });
    logger.info('JWT decoded.');
    return {
      valid: true,
      registrationNumber: decoded.registrationNumber,
      facility: decoded.facility,
      orcs: decoded.orcs,
      bookingDate: decoded.bookingDate,
      passType: decoded.passType
    };
  } catch (e) {
    logger.error(e);
    return {
      valid: false
    };
  }
}


function generateRegistrationNumber(count) {
  // TODO: Make this better
  let regyNum = Math.random().toString().substr(count);
  return regyNum
}

module.exports = {
  verifyJWT,
  generateRegistrationNumber
};
