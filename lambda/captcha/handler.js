const { getCaptcha, verifyCaptcha, getCaptchaAudio } = require('../captchaUtil');
const { sendResponse, checkWarmup } = require('../responseUtil');
const { logger } = require('../logger');

async function generateCaptcha(event, context) {
  logger.info('generateCaptcha');
  logger.debug(JSON.stringify(event));
  if (checkWarmup(event)) {
    logger.info('checkWarmup');
    return sendResponse(200, {});
  }
  const postBody = JSON.parse(event.body);
  if (!postBody.facility || !postBody.orcs) {
    return sendResponse(400, { msg: 'Invalid post body' }, context);
  }
  logger.info('Post Body');
  logger.debug(JSON.stringify(postBody));
  try {
    const captcha = await getCaptcha({ fontSize: 76, width: 190, height: 70 },
                                      postBody.facility,
                                      postBody.orcs,
                                      postBody.bookingDate,
                                      postBody.passType);

    logger.debug(JSON.stringify(captcha));
    return sendResponse(200, captcha);
  } catch (error) {
    logger.error(error);
    return sendResponse(400, { msg: error.message }, context);
  }
}

async function verifyAnswer(event, context) {
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
}

async function generateAudio(event, context) {
  const postBody = JSON.parse(event.body);

  const res = await getCaptchaAudio(postBody);

  return sendResponse(200, res);
}

module.exports = {
  generateCaptcha,
  verifyAnswer,
  generateAudio
};
