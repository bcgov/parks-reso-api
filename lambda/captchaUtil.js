const AWS = require('aws-sdk');
const jose = require('node-jose');
const svgCaptcha = require('svg-captcha');
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
const { logger } = require('./logger');
const { isBookingAllowed } = require('./passUtils');

const AWS_REGION = process.env.AWS_DEFAULT_REGION || 'ca-central-1';

const ALGORITHM = process.env.ALGORITHM || 'HS384';

// provide date of booking 
async function getCaptcha(options, facility, orcs, bookingDate, passType) {
  let captcha = svgCaptcha.create({
    ...{
      size: 6, // size of random string
      ignoreChars: '0o1il', // filter out some characters like 0o1i
      noise: 2 // number of lines to insert for noise,
    },
    ...options
  });

  if (!captcha || (captcha && !captcha.data) || !facility || !orcs || !bookingDate || !passType) {
    // Something bad happened with Captcha or specific parameters were not set
    return {
      valid: false
    };
  }

  const isValidBooking = await isBookingAllowed(orcs, facility, bookingDate, passType);

  // if you cant currently book a pass for the facility, dont bother creating the captcha.
  if (!isValidBooking || !isValidBooking.valid) {
    return isValidBooking;
  }

  // add answer, and expiry to body
  const body = {
    answer: captcha.text,
    jwt: jwt.sign(
      {
        facility: facility,
        orcs: orcs,
        bookingDate: bookingDate,
        passType: passType
      },
      SECRET,
      {
        expiresIn: JWT_SIGN_EXPIRY + 'm',
        algorithm: ALGORITHM
      }
    ),
  };
  try {
    const validation = await encrypt(body);
    if (validation === '') {
      return {
        valid: false
      };
    } else {
      // create basic response
      const responseBody = {
        captcha: captcha.data,
        validation: validation
      };
      return responseBody;
    }
  } catch (err) {
    logger.error(err);
    return {
      valid: false
    };
  }
}

/**
 * This function requires valid AWS credentials to be present in env when
 * running locally
 */
async function getCaptchaAudio(payload) {
  try {
    const Polly = new AWS.Polly({
      region: AWS_REGION
    });

    const validation = payload.validation;
    const decryptedBody = await decrypt(validation, PRIVATE_KEY);

    try {
      const decryptedJWT = jwt.verify(body.jwt, SECRET, { algorithm: ALGORITHM });
      logger.debug('Decrypted JWT:', decryptedJWT)
      if (!decryptedJWT || !decryptedJWT.orcs || !decryptedJWT.facility || !decryptedJWT.bookingDate || !decryptedJWT.passType) {
        throw 'Malformed JWT';
      }
    } catch (error) {
      throw error;
    }

    const captchaText = decryptedBody.answer.toString().split('').join(', ');

    const params = {
      Text: `Please type in following letters or numbers: ${captchaText}`,
      OutputFormat: 'mp3',
      VoiceId: 'Salli'
    };

    const audioData = await Polly.synthesizeSpeech(params).promise();

    return {
      audio: `data:audio/mp3;base64,${audioData.AudioStream.toString('base64')}`
    };
  } catch (err) {
    logger.error(err);
    throw err;
  }
}

async function verifyCaptcha(payload) {
  const validation = payload.validation;
  const answer = payload.answer;

  // Normal mode, decrypt token
  const body = await decrypt(validation, PRIVATE_KEY);
  let decryptedJWT = null;
  try {
    decryptedJWT = jwt.verify(body.jwt, SECRET, {algorithm: ALGORITHM});
    logger.debug('Decrypted JWT:', decryptedJWT);
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

function verifyJWT(token) {
  try {
    const decoded = jwt.verify(token, SECRET, { algorithm: ALGORITHM });
    logger.info('JWT decoded.')
    // A256GCM
    if (decoded.data) {
      return {
        valid: true,
        registrationNumber: decoded.registrationNumber,
        facility: decoded.facility,
        orcs: decoded.orcs,
        bookingDate: decoded.bookingDate,
        passType: decoded.passType
      };
    } else {
      return {
        valid: false
      };
    }
  } catch (e) {
    logger.error(e);
    return {
      valid: false
    };
  }
}

async function encrypt(body) {
  const buff = Buffer.from(JSON.stringify(body));
  try {
    const cr = await jose.JWE.createEncrypt(PRIVATE_KEY).update(buff).final();
    return cr;
  } catch (e) {
    logger.error(e);
    throw e;
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

module.exports = {
  getCaptcha,
  verifyCaptcha,
  verifyJWT,
  getCaptchaAudio,
  encrypt,
  generateRegistrationNumber
};
