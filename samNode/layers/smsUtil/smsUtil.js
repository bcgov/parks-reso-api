const AWS = require('aws-sdk');
const { gcnSend } = require('/opt/gcNotifyUtil');
const { sendResponse, logger } = require('/opt/baseLayer');


exports.sendSMSMessage = async function (payload, cancellationLink){
    payload.type = convertPassType(payload.type);
    try {
      const gcnSendObj = {
        "phone_number": `${payload.phoneNumber}`,
        "template_id": process.env.GC_NOTIFY_SMS_TEMPLATE_ID,
        "personalisation": {
          "name": `${payload.firstName} ${payload.lastName}`,
          "passType": payload.type,
          "parkName": payload.parkName,
          "facilityName": payload.facilityName,
          "cancellationLink": cancellationLink
        }
      };
      const res = await gcnSend(process.env.GC_NOTIFY_API_SMS_PATH, process.env.GC_NOTIFY_API_KEY, gcnSendObj);
      if (res.errors) {
        resData = res?.data?.response?.data;
        jobError = 'SMS Notification failed: ';
        logger.error(jobError, resData );
        throw new Error('SMS Notification failed');
      } else {
        resData = res?.data?.data?.data;
      }
      logger.info(resData);
      return sendResponse(200, { msg: 'All works?', title: 'Completed actions' })
    } catch (e) {
      logger.error(e)
      return sendResponse(400, { msg: 'SMS notification failed.', title: 'Operation Failed' });
    }
  }

function convertPassType(passType) {
  const passTimeOptions = ["an AM", "a PM", "an ALL-DAY"];
  switch (passType) {
      case "AM":
          return passTimeOptions[0];
      case "PM":
          return passTimeOptions[1];
      case "DAY":
          return passTimeOptions[2];
      default:
          return passType;
    }
} 