const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB();
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const SSO_ISSUER = process.env.SSO_ISSUER || 'https://oidc.gov.bc.ca/auth/realms/3l5nw6dk';
const SSO_JWKSURI = 'https://oidc.gov.bc.ca/auth/realms/3l5nw6dk/protocol/openid-connect/certs';

exports.handler = async (event, context) => {
  console.log('Delete Pass', event);
  console.log('event.queryStringParameters', event.queryStringParameters);

  try {
    if (!event.queryStringParameters) {
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }
    if (event.queryStringParameters.passId && event.queryStringParameters.park && event.queryStringParameters.code) {
      console.log("Get the specific pass, this person is NOT authenticated but has a code");

      let decodedToken = jwt.verify(event.queryStringParameters.code, process.env.JWT_SECRET);
      console.log(decodedToken)

      if (decodedToken === null) {
        return sendResponse(400, { msg: 'Invalid request'});
      }

      // Get the specific pass, this person is NOT authenticated
      let updatePass = {
        Key: {
          'pk': { S: 'pass::' + decodedToken.parkName },
          'sk': { S: decodedToken.passId }
        },
        ExpressionAttributeValues: {
          ":cancelled": { S:"cancelled" },
        },
        ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
        UpdateExpression: "SET passStatus = :cancelled",
        ReturnValues: "ALL_NEW",
        TableName: process.env.TABLE_NAME
      };
      console.log("updatePass:", updatePass);
      const passRes = await dynamodb.updateItem(updatePass).promise();
      console.log("passRes:", passRes);

      // Deduct the pass's numberOfGuests count from the trail period count.
      let updateFacility = {
        Key: {
          'pk': { S: 'facility::' + decodedToken.parkName },
          'sk': { S: decodedToken.facilityName }
        },
        ExpressionAttributeValues: {
          ":passReducedBy": AWS.DynamoDB.Converter.input(decodedToken.numberOfGuests),
        },
        ExpressionAttributeNames: {
          '#type': decodedToken.type,
          '#dateselector': decodedToken.dateselector
        },
        UpdateExpression: "SET reservations.#dateselector.#type = reservations.#dateselector.#type - :passReducedBy",
        ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
        ReturnValues: "ALL_NEW",
        TableName: process.env.TABLE_NAME
      };
      console.log("updateFacility:", updateFacility);
      const facilityRes = await dynamodb.updateItem(updateFacility).promise();
      console.log("facilityRes:", facilityRes);

      return sendResponse(200, { msg: 'Cancelled'}, context);
    } else if (event.queryStringParameters.passId && event.queryStringParameters.park) {
      if (await checkPermissions(event) === false) {
        return sendResponse(403, { msg: 'Unauthorized!'});
      } else {
        let updatePass = {
          Key: {
            'pk': { S: 'pass::' + event.queryStringParameters.park },
            'sk': { S: event.queryStringParameters.passId }
          },
          ExpressionAttributeValues: {
            ":cancelled": { S:"cancelled" },
          },
          ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
          UpdateExpression: "SET passStatus = :cancelled",
          ReturnValues: "ALL_NEW",
          TableName: process.env.TABLE_NAME
        };
        console.log("updatePass:", updatePass);
        const facilityRes = await dynamodb.updateItem(updatePass).promise();
        console.log("FacRes:", facilityRes);
        return sendResponse(200, { msg: 'Cancelled'}, context);
      }
    } else {
      console.log("Invalid Request");
      return sendResponse(400, { msg: 'Invalid Request'}, context);
    }
  } catch (err) {
    console.log(err);
    return sendResponse(400, { msg: 'Invalid Request'}, context);
  }
}

const checkPermissions = async function (event) {
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