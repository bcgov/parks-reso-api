const SSO_ISSUER = process.env.SSO_ISSUER || 'https://dev.loginproxy.gov.bc.ca/auth/realms/bcparks-service-transformation';
const SSO_JWKSURI = process.env.SSO_JWKSURI || 'https://dev.loginproxy.gov.bc.ca/auth/realms/bcparks-service-transformation/protocol/openid-connect/certs';
const CF_SECRET_KEY = process.env.CF_SECRET_KEY || '1x0000000000000000000000000000000AA';
const INVALID_TOKEN = {
        decoded: false,
        data: null
      };
const { runQuery, TABLE_NAME, dynamoClient, logger, CustomError, DeleteItemCommand } = require('/opt/baseLayer');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const axios = require('axios');

exports.decodeJWT = async function (event) {
  const token = event.headers.Authorization;
  let decoded = null;
  try {
    decoded = await new Promise(function (resolve) {
      verifyToken(
        token,
        function (data) {
          logger.debug('Data:', data);
          resolve(data);
        },
        function (err) {
          logger.debug('error:', err);
          resolve(false);
        }
      );
    }).catch(e => {
      logger.debug('e verify:', e);
      return INVALID_TOKEN;
    });
    logger.debug('token:', decoded);
    if (decoded === false) {
      logger.debug('403');
      return INVALID_TOKEN;
    } else {
      // They are good.
      return {
        decoded: true,
        data: decoded
      };
    }
  } catch (e) {
    logger.error('err p:', e);
    return INVALID_TOKEN;
  }
};

exports.getExpiryTime = function (token) {
  try {
    // grab the public stuff from jwt
    const decodedJWT = jwt.decode(token);
    if (decodedJWT && decodedJWT.iat) {
      const expiryTime = decodedJWT.exp;
      //Return the unix value of the expiry
      return expiryTime;
    } else {
      // If no created time return false 
      return { decoded: false };
    }
  } catch (e) {
    // Return if cant decode 
    return { decoded: false };
  }
};

exports.verifyHoldToken = function (token, secret) {
  let decodedToken;
  try {
    decodedToken = jwt.verify(token, secret);
    if (!decodedToken) {
      throw new CustomError('Invalid token', 400);
    }
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new CustomError('Token has expired', 400);
    } else {
      throw new CustomError('Invalid token', 400);
    }
  }
  return decodedToken;
};

exports.deleteHoldToken = async function (token) {
  try {
    const params = { 
      TableName: TABLE_NAME,
      Key: {
        pk: {S: 'jwt'},
        sk: {S: token}
      }
    }
    const command = new DeleteItemCommand(params)
    const data = await dynamoClient.send(command)
  } catch (error) {
    // Handle the error here
    logger.error('Error deleting hold token: ', error);
    logger.debug(error);
  }
}

const verifyToken = function (token, callback, sendError) {
  logger.debug('verifying token');
  logger.debug('token:', token);

  // validate the 'Authorization' header. it should have the following format: `Bearer tokenString`
  if (token && token.indexOf('Bearer ') == 0) {
    let tokenString = token.split(' ')[1];

    logger.debug('Remote JWT verification');

    // Get the SSO_JWKSURI and process accordingly.
    const client = jwksClient({
      strictSsl: true, // Default value
      jwksUri: SSO_JWKSURI
    });

    const kid = jwt.decode(tokenString, { complete: true }).header.kid;

    client.getSigningKey(kid, (err, key) => {
      if (err) {
        logger.debug('Signing Key Error:', err);
        callback(sendError());
      } else {
        const signingKey = key.publicKey || key.rsaPublicKey;
        verifySecret(tokenString, signingKey, callback, sendError);
      }
    });
  } else {
    logger.debug("Token didn't have a bearer.");
    return callback(sendError());
  }
};

function verifySecret(tokenString, secret, callback, sendError) {
  jwt.verify(tokenString, secret, function (verificationError, decodedToken) {
    // check if the JWT was verified correctly
    if (verificationError == null && decodedToken && decodedToken.resource_access["parking-pass"].roles) {
      logger.debug('JWT decoded');
      logger.debug('decoded token:', decodedToken);
      logger.debug('decodedToken.iss', decodedToken.iss);
      logger.debug('decodedToken roles', decodedToken.resource_access["parking-pass"].roles);
      logger.debug('SSO_ISSUER', SSO_ISSUER);

      // check if the issuer matches
      let issuerMatch = decodedToken.iss == SSO_ISSUER;

      logger.debug('issuerMatch', issuerMatch);

      if (issuerMatch) {
        logger.debug('JWT Verified');
        return callback(decodedToken);
      } else {
        logger.debug('JWT Role/Issuer mismatch');
        return callback(sendError());
      }
    } else {
      // return the error in the callback if the JWT was not verified
      logger.debug('JWT Verification Error:', verificationError);
      return callback(sendError());
    }
  });
}

async function roleFilter(records, roles) {
  return new Promise(async (resolve) => {
    const data = records.filter(record => {
      logger.debug("record:", record.roles);
      // Sanity check if `roles` isn't defined on record. Default to readable.
      if (record?.roles?.length > 0) {
        return roles.some(role => record.roles.indexOf(role) != -1);
      } else {
        return false;
      }
    });
    resolve(data);
  });
};
exports.roleFilter = roleFilter;

exports.resolvePermissions = function (token) {
  let roles = ['public'];
  let isAdmin = false;
  let isAuthenticated = false;
  
  try {
    logger.debug(JSON.stringify(token.data));
    roles = token.data.resource_access['parking-pass'].roles;
    // If we get here, they have authenticated and have some roles in the parking-pass client.  Treat them as
    // an admin of some sort
    isAuthenticated = true;

    logger.debug(JSON.stringify(roles));
    if (roles.includes('sysadmin')) {
      logger.debug("ISADMIN");
      isAdmin = true;
    }
  } catch (e) {
    // Fall through, assume public.
    logger.debug(e);
  }

  return {
    roles: roles,
    isAdmin: isAdmin,
    isAuthenticated: isAuthenticated
  };
};

exports.getParkAccess = async function getParkAccess(park, permissionObject) {
  let queryObj = {
    TableName: TABLE_NAME
  };

  queryObj.ExpressionAttributeValues = {
    ':pk': { S: 'park' },
    ':sk': { S: park }
  };
  queryObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';
  let parksData = await runQuery(queryObj);
  logger.debug("parksData:", parksData);
  logger.debug("permissionObject.roles:", permissionObject.roles);
  parksData = await roleFilter(parksData, permissionObject.roles);
  logger.debug("parksData:", parksData);
  if (parksData.length < 1) {
    // They are not authorized.
    throw { msg: "Unauthorized Access." };
  }
};

exports.validateToken = async function (token) {
  // Validate the token by calling the
  // "/siteverify" API endpoint.
  const body = JSON.stringify({
    secret: CF_SECRET_KEY,
    response: token
  });

  const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
  const res = await axios({
    method: 'post',
    url: url,
    headers: {
      'Content-Type': 'application/json'
    },
    data: body
  });

  logger.debug(res.data);
  if (!res.status == 200) {
    throw new CustomError('Invalid token.', 400);
  }
};
