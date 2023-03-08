const qrcode = require('qrcode');

async function getPersonalizationAttachment(parkIdentifier, registrationNumber, qrCode = false) {
  if (qrCode) {
    const base64image = await qrcode.toDataURL(getAdminLinkToPass(parkIdentifier, registrationNumber),
                                               { errorCorrectionLevel: 'H', margin: 6 });
    return {
      "hasQRCode": true,
      "application_file": {
        "file": base64image.split('base64,')[1],
        "filename": 'QRCode.png',
        "sending_method": "attach" 
      }
    }
  } else {
    return {
      "hasQRCode": false
    };
  }
}

function getAdminLinkToPass(parkIdentifier, registrationNumber) {
  return (`${getAdminPortalURL()}${process.env.PASS_MANAGEMENT_ROUTE}`
          + `?park=${parkIdentifier}&registrationNumber=${registrationNumber}`);
}

function getAdminPortalURL() {
  return process.env.ADMIN_FRONTEND;
}

module.exports = {
  getAdminLinkToPass,
  getAdminPortalURL,
  getPersonalizationAttachment
}