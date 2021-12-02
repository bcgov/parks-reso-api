var jose = require('node-jose');
var keystore = jose.JWK.createKeyStore();

var props = {
  kid: 'bcparks-captcha-service-1',
  alg: 'A256GCM',
  use: 'enc'
};
keystore.generate('oct', 256, props).then(function (result) {
  console.log(JSON.stringify(result.toJSON(true)));
});
