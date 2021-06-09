const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB();
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const SSO_ISSUER = process.env.SSO_ISSUER || 'https://oidc.gov.bc.ca/auth/realms/3l5nw6dk';
const SSO_JWKSURI = 'https://oidc.gov.bc.ca/auth/realms/3l5nw6dk/protocol/openid-connect/certs';

exports.handler = async (event, context) => {
  console.log('Read Pass', event);
  console.log('event.queryStringParameters', event.queryStringParameters);

  let queryObj = {
    TableName: process.env.TABLE_NAME
  };

  try {
    if (!event.queryStringParameters) {
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }
    if (event.queryStringParameters.facilityName && event.queryStringParameters.park) {
      if (await checkPermissions(event) === false) {
        return sendResponse(403, { msg: 'Unauthorized'});
      }
      // Get all the passes for a specific facility
      queryObj.ExpressionAttributeValues = {};
      queryObj.ExpressionAttributeValues[':pk'] = { S: 'pass::' + event.queryStringParameters.park };
      queryObj.ExpressionAttributeValues[':facilityName'] = { S: event.queryStringParameters.facilityName };
      queryObj.KeyConditionExpression = 'pk =:pk';
      queryObj.FilterExpression = 'facilityName =:facilityName';
      const passData = await runQuery(queryObj);
      return sendResponse(200, passData, context);
    } else if (event.queryStringParameters.passes && event.queryStringParameters.park) {
      console.log("Grab passes for this park");
      if (await checkPermissions(event) === false) {
        return sendResponse(403, { msg: 'Unauthorized'});
      }
      // Grab passes for this park.
      queryObj.ExpressionAttributeValues = {};
      queryObj.ExpressionAttributeValues[':pk'] = { S: 'pass::' + event.queryStringParameters.park };
      queryObj.KeyConditionExpression = 'pk =:pk';
      const passData = await runQuery(queryObj);
      return sendResponse(200, passData, context);
    } else if (event.queryStringParameters.passId && event.queryStringParameters.email && event.queryStringParameters.code) {
      console.log("Get the specific pass, this person is NOT authenticated");
      // Get the specific pass, this person is NOT authenticated
      // TODO:
      return sendResponse(200, { msg: 'Get the specific pass unauth TBI'}, context);
    } else if (event.queryStringParameters.passId && event.queryStringParameters.park) {
      if (await checkPermissions(event) === false) {
        return sendResponse(403, { msg: 'Unauthorized!'});
      } else {
        // Get the specific pass
        queryObj.ExpressionAttributeValues = {};
        queryObj.ExpressionAttributeValues[':pk'] = { S: 'pass::' + event.queryStringParameters.park };
        queryObj.ExpressionAttributeValues[':sk'] = { S: event.queryStringParameters.passId };
        queryObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';
        const passData = await runQuery(queryObj);
        return sendResponse(200, passData, context);
      }
    } else {
      console.log("Invalid Request");
      return sendResponse(400, { msg: 'Invalid Request'}, context);
    }
  } catch (err) {
    console.log(err);
    return sendResponse(400, err, context);
  }
}

const checkPermissions = async function (event) {
  // TODO: Add keycloak decoding based on NRPTI prod
  const token = event.headers.Authorization;

  let decoded = null;
  try {
    decoded = await new Promise(function (resolve) {
      verifyToken(token, function (data) {
        console.log("Data:", data);
        resolve(data);
      },
        function (err) {
          console.log("error:", err);
          resolve(false);
        }
      )
    }).catch(e => {
      console.log("e verify:", e);
      return false;
    });
    console.log("token:", decoded);
    if (decoded === false) {
      console.log("403");
      return false;
    } else {
      // They are good.
      return true;
    }
  } catch (e) {
    console.log("err p:", e);
    return false;
  }
}

const runQuery = async function (query) {
  const data = await dynamodb.query(query).promise();
  console.log("data:", data);
  var unMarshalled = data.Items.map(item => {
    return AWS.DynamoDB.Converter.unmarshall(item);
  });
  console.log(unMarshalled);
  return unMarshalled;
}

const sendResponse = function (code, data, context) {
  const response = {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "OPTIONS,GET"
    },
    body: JSON.stringify(data)
  };
  return response;
}

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