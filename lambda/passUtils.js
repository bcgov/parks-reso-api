const qrcode = require('qrcode');

async function getPersonalizationAttachment(parkIdentifier, registrationNumber) {
  if (isQRCodeEnabled(parkIdentifier)) {
    const base64image = await qrcode.toDataURL(getAdminLinkToPass(parkIdentifier, registrationNumber));
    return {
      "application_file": {
        "file": base64image,
        "filename": 'QRCode.png',
        "sending_method": "attach" 
      }
    }
  } else {
    return undefined;
  }
}

function getAdminLinkToPass(parkIdentifier, registrationNumber) {
  if (isQRCodeEnabled(parkIdentifier)) {
    return `${getAdminPortalURL()}/pass-lookup/${parkIdentifier}/${registrationNumber}`;
  } else {
    return undefined;
  }
}

function getAdminPortalURL() {
  return process.env.ADMIN_FRONTEND;
}

function isQRCodeEnabled(parkIdentifier) {
  // HC for now
  return process.env.QR_CODE_ENABLED
         && (parkIdentifier === 'Mount Seymour Provincial Park'
            || parkIdentifier === '0015');
}

module.exports = {
  getAdminLinkToPass,
  getAdminPortalURL,
  getPersonalizationAttachment
}