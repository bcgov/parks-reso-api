const qrcode = require('qrcode');
const { runQuery, TABLE_NAME } = require('./dynamoUtil');

async function getPersonalizationAttachment(parkIdentifier, registrationNumber, qrCode = false) {
  if (qrCode) {
    const base64image = await qrcode.toDataURL(getAdminLinkToPass(parkIdentifier, registrationNumber), {
      errorCorrectionLevel: 'H',
      margin: 6
    });
    return {
      hasQRCode: true,
      application_file: {
        file: base64image.split('base64,')[1],
        filename: 'QRCode.png',
        sending_method: 'attach'
      }
    };
  } else {
    return {
      hasQRCode: false
    };
  }
}

async function checkIfPassExists(park, id, facility) {
  try {
    const passQuery = {
      TableName: TABLE_NAME,
      ExpressionAttributeValues: {
        ':pk': { S: `pass::${park}` },
        ':sk': { S: id },
        ':facilityName': { S: facility }
      },
      KeyConditionExpression: 'pk = :pk AND sk = :sk',
      FilterExpression: 'facilityName =:facilityName'
    };
    const pass = await runQuery(passQuery);
    if (pass.length === 0) {
      return false;
    } else {
      return true;
    }
  } catch (error) {
    throw error;
  }
}

function getAdminLinkToPass(parkIdentifier, registrationNumber) {
  return (
    `${getAdminPortalURL()}${process.env.PASS_MANAGEMENT_ROUTE}` +
    `?park=${parkIdentifier}&registrationNumber=${registrationNumber}`
  );
}

function getAdminPortalURL() {
  return process.env.ADMIN_FRONTEND;
}

module.exports = {
  getAdminLinkToPass,
  getAdminPortalURL,
  getPersonalizationAttachment,
  checkIfPassExists
};
