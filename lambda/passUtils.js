const qrcode = require('qrcode');

async function getPersonalizationAttachment(parkIdentifier, facilityIdentifier, registrationNumber) {
  if (isQRCodeEnabled(parkIdentifier, facilityIdentifier)) {
    const base64image = await qrcode.toDataURL(getAdminLinkToPass(parkIdentifier, facilityIdentifier, registrationNumber));
    return {
      "application_file": {
        "file": base64image.split('base64,')[1],
        "filename": 'QRCode.png',
        "sending_method": "attach" 
      }
    }
  } else {
    return undefined;
  }
}

function getAdminLinkToPass(parkIdentifier, facilityIdentifier, registrationNumber) {
  if (isQRCodeEnabled(parkIdentifier, facilityIdentifier)) {
    return (
      `${getAdminPortalURL()}${process.env.PASS_MANAGEMENT_ROUTE}`+
      `?park=${parkIdentifier}&registrationNumber=${registrationNumber}`
    );
  } else {
    return undefined;
  }
}

function getAdminPortalURL() {
  return process.env.ADMIN_FRONTEND;
}

function isQRCodeEnabled(parkIdentifier, facilityIdentifier) {
  // HC for now
  return process.env.QR_CODE_ENABLED === 'true'
         && (parkIdentifier === 'Mount Seymour Provincial Park' || parkIdentifier === '0015')
         && facilityIdentifier === 'P1 and Lower P5';
}

module.exports = {
  getAdminLinkToPass,
  getAdminPortalURL,
  getPersonalizationAttachment
}