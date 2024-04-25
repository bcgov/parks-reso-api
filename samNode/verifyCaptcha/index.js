const { sendResponse, checkWarmup, logger } = require('/opt/baseLayer');

const AWS = require('aws-sdk');
const jose = require('node-jose');
const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'defaultSecret';
const JWT_SIGN_EXPIRY = process.env.JWT_SIGN_EXPIRY || '5'; // In minutes
const PRIVATE_KEY = process.env.PRIVATE_KEY
  ? JSON.parse(process.env.PRIVATE_KEY)
  : {
    kty: 'oct',
    kid: 'gBdaS-G8RLax2qObTD94w',
    use: 'enc',
    alg: 'A256GCM',
    k: 'FK3d8WvSRdxlUHs4Fs_xxYO3-6dCiUarBwiYNFw5hv8'
  };
const AWS_REGION = process.env.AWS_DEFAULT_REGION || 'ca-central-1';
const ALGORITHM = process.env.ALGORITHM || 'HS384';


exports.handler = async (event, context) => {
    try {
        if (checkWarmup(event)) {
            return sendResponse(200, {});
        }
    
        const postBody = JSON.parse(event.body);
        const result = await verifyCaptcha(postBody);
      
        if (result?.valid !== true) {
            logger.info('Failed to verify captcha');
            logger.debug(result);
            return sendResponse(400, { msg: 'Failed to verify captcha' }, context);
        }
      
        return sendResponse(200, result);
    } catch (error) {
        logger.error('Error verifying captcha:', error);
        return sendResponse(500, { message: 'Internal Server Error' });
    }
};

////////////////////

async function verifyCaptcha(payload) {
  const validation = payload.validation;
  const answer = payload.answer;

  // Normal mode, decrypt token
  const body = await decrypt(validation, PRIVATE_KEY);
  let decryptedJWT = null;
  try {
    logger.debug('answer:', payload.answer);
    logger.debug('body:', JSON.stringify(body));
    decryptedJWT = jwt.verify(body.jwt, SECRET, {algorithm: ALGORITHM});
    logger.debug('Decrypted JWT:', JSON.stringify(decryptedJWT));
    if (!decryptedJWT || !decryptedJWT.orcs || !decryptedJWT.facility || !decryptedJWT.bookingDate || !decryptedJWT.passType) {
      throw 'Malformed JWT';
    }
  } catch (error) {
    logger.error(error);
    return {
      valid: false
    }
  }

  if (body?.answer.toLowerCase() === answer.toLowerCase()) {
    // Add generated registration number and facility to data
    const token = jwt.sign(
      {
        data: 'verified',
        registrationNumber: generateRegistrationNumber(10),
        facility: decryptedJWT.facility,
        orcs: decryptedJWT.orcs,
        bookingDate: decryptedJWT.bookingDate,
        passType: decryptedJWT.passType,
      },
      SECRET,
      {
        expiresIn: JWT_SIGN_EXPIRY + 'm',
        algorithm: ALGORITHM
      }
    );
    logger.debug('Captcha verified.');
    return {
      valid: true,
      jwt: token
    };
  } else {
    // Bad decyption
    return {
      valid: false
    };
  }
}

async function decrypt(body, private_key) {
  try {
    const res = await jose.JWK.asKey(private_key, 'json');
    const decrypted = await jose.JWE.createDecrypt(res).decrypt(body);
    const decryptedObject = JSON.parse(decrypted.plaintext.toString('utf8'));
    return decryptedObject;
  } catch (e) {
    logger.error(e);
    throw e;
  }
}

function generateRegistrationNumber(count) {
  // TODO: Make this better
  return Math.random().toString().substr(count);
}

