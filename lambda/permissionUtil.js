const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const SSO_ISSUER = process.env.SSO_ISSUER || 'https://oidc.gov.bc.ca/auth/realms/g7v0xlf4';
const SSO_JWKSURI = process.env.SSO_JWKSURI || 'https://oidc.gov.bc.ca/auth/realms/g7v0xlf4/protocol/openid-connect/certs';
const INVALID_TOKEN = {
        decoded: false,
        data: null
      };

exports.checkPermissions = async function (event) {
  // TODO: Add keycloak decoding based on NRPTI prod
  const token = event.headers.Authorization;

  let decoded = null;
  try {
    decoded = await new Promise(function (resolve) {
      verifyToken(
        token,
        function (data) {
          console.log('Data:', data);
          resolve(data);
        },
        function (err) {
          console.log('error:', err);
          resolve(false);
        }
      );
    }).catch(e => {
      console.log('e verify:', e);
      return INVALID_TOKEN;
    });
    console.log('token:', decoded);
    if (decoded === false) {
      console.log('403');
      return INVALID_TOKEN;
    } else {
      // They are good.
      return {
        decoded: true,
        data: decoded
      };
    }
  } catch (e) {
    console.log('err p:', e);
    return INVALID_TOKEN;
  }
};

const verifyToken = function (token, callback, sendError) {
  console.log('verifying token');
  console.log('token:', token);

  let currentScopes = ['sysadmin'];

  // validate the 'Authorization' header. it should have the following format: `Bearer tokenString`
  if (token && token.indexOf('Bearer ') == 0) {
    let tokenString = token.split(' ')[1];

    console.log('Remote JWT verification');

    // Get the SSO_JWKSURI and process accordingly.
    const client = jwksClient({
      strictSsl: true, // Default value
      jwksUri: SSO_JWKSURI
    });

    const kid = jwt.decode(tokenString, { complete: true }).header.kid;

    client.getSigningKey(kid, (err, key) => {
      if (err) {
        console.log('Signing Key Error:', err);
        callback(sendError());
      } else {
        const signingKey = key.publicKey || key.rsaPublicKey;
        verifySecret(currentScopes, tokenString, signingKey, callback, sendError);
      }
    });
  } else {
    console.log("Token didn't have a bearer.");
    return callback(sendError());
  }
};

function verifySecret(currentScopes, tokenString, secret, callback, sendError) {
  jwt.verify(tokenString, secret, function (verificationError, decodedToken) {
    // check if the JWT was verified correctly
    if (verificationError == null && Array.isArray(currentScopes) && decodedToken && decodedToken.realm_access.roles) {
      console.log('JWT decoded');

      console.log('currentScopes', JSON.stringify(currentScopes));
      console.log('decoded token:', decodedToken);

      console.log('decodedToken.iss', decodedToken.iss);
      console.log('decodedToken.realm_access.roles', decodedToken.realm_access.roles);

      console.log('SSO_ISSUER', SSO_ISSUER);

      // check if the role is valid for this endpoint
      let roleMatch = currentScopes.some(role => decodedToken.realm_access.roles.indexOf(role) >= 0);

      console.log('role match', roleMatch);

      // check if the dissuer matches
      let issuerMatch = decodedToken.iss == SSO_ISSUER;

      console.log('issuerMatch', issuerMatch);

      if (roleMatch && issuerMatch) {
        console.log('JWT Verified');
        return callback(decodedToken);
      } else {
        console.log('JWT Role/Issuer mismatch');
        return callback(sendError());
      }
    } else {
      // return the error in the callback if the JWT was not verified
      console.log('JWT Verification Error:', verificationError);
      return callback(sendError());
    }
  });
}