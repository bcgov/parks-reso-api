const { sendResponse, checkWarmup, logger } = require('/opt/baseLayer');
//
const { isBookingAllowed } = require('/opt/passUtil');

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



const ALGORITHM = process.env.ALGORITHM || 'HS384';
//

exports.handler = async (event, context) => {
    try {
        logger.info('generateCaptcha');
        logger.debug(JSON.stringify(event));
        
        if (checkWarmup(event)) {
            logger.info('checkWarmup');
            return sendResponse(200, {});
        }

        const postBody = JSON.parse(event.body);
        if (!postBody.facility || !postBody.orcs) {
            return sendResponse(400, { msg: 'Failed to generate captcha' }, context);
        }

        logger.info('Post Body');
        logger.debug(JSON.stringify(postBody));

        const captcha = await getCaptcha({
            fontSize: 76,
            width: 190,
            height: 70
        },
        postBody.facility,
        postBody.orcs,
        postBody.bookingDate,
        postBody.passType);

        logger.debug(JSON.stringify(captcha));

        if (captcha?.valid === false) {
            logger.info('Failed to generate captcha');
            logger.debug(captcha);
            return sendResponse(400, { msg: 'Failed to generate captcha' }, context);
        }

        return sendResponse(200, captcha);
    } catch (error) {
        logger.error('Error generating captcha:', error);
        return sendResponse(500, { message: 'Internal Server Error' });
    }
};






//----------//-------------


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
