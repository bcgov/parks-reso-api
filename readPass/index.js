const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB();
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const axios = require('axios');
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

      if (event.queryStringParameters.passType) {
        queryObj.ExpressionAttributeValues[':passType'] = AWS.DynamoDB.Converter.input(event.queryStringParameters.passType);
        queryObj = checkAddExpressionAttributeNames(queryObj);
        queryObj.ExpressionAttributeNames['#theType'] = 'type';
        queryObj.FilterExpression += ' AND #theType =:passType';
      }

      // Filter Date
      if (event.queryStringParameters.date) {
        const theDate = new Date(event.queryStringParameters.date);
        var month = ('0' + (theDate.getMonth())).slice(-2);
        var day = ('0' + (theDate.getUTCDate())).slice(-2);
        var year = theDate.getUTCFullYear();
        const dateselector = year + '-' + month + '-' + day;
        queryObj = checkAddExpressionAttributeNames(queryObj);
        queryObj.ExpressionAttributeNames['#theDate'] = 'date';
        queryObj.ExpressionAttributeValues[':theDate'] = AWS.DynamoDB.Converter.input(dateselector);
        queryObj.FilterExpression += ' AND contains(#theDate, :theDate)';
      }
      // Filter reservation number
      if (event.queryStringParameters.reservationNumber) {
        queryObj.ExpressionAttributeValues[':sk'] = { S: event.queryStringParameters.reservationNumber };
        queryObj.KeyConditionExpression += ' AND sk =:sk';
      }
      // Filter first/last
      if (event.queryStringParameters.firstName) {
        queryObj = checkAddExpressionAttributeNames(queryObj);
        queryObj.ExpressionAttributeNames['#firstName'] = 'firstName';
        queryObj.ExpressionAttributeValues[':firstName'] = AWS.DynamoDB.Converter.input(event.queryStringParameters.firstName);
        queryObj.FilterExpression += ' AND #firstName =:firstName';
      }
      if (event.queryStringParameters.lastName) {
        queryObj = checkAddExpressionAttributeNames(queryObj);
        queryObj.ExpressionAttributeNames['#lastName'] = 'lastName';
        queryObj.ExpressionAttributeValues[':lastName'] = AWS.DynamoDB.Converter.input(event.queryStringParameters.lastName);
        queryObj.FilterExpression += ' AND #lastName =:lastName';
      }
      queryObj = paginationHandler(queryObj, event);

      console.log('queryObj:', queryObj)
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
      queryObj = paginationHandler(queryObj, event);
      const passData = await runQuery(queryObj);
      return sendResponse(200, passData, context);
    } else if (event.queryStringParameters.passId && event.queryStringParameters.email && event.queryStringParameters.park) {
      console.log("Get the specific pass, this person is NOT authenticated");
      // Get the specific pass, this person is NOT authenticated
      queryObj.ExpressionAttributeValues = {};
      queryObj.ExpressionAttributeValues[':pk'] = { S: 'pass::' + event.queryStringParameters.park };
      queryObj.ExpressionAttributeValues[':sk'] = { S: event.queryStringParameters.passId };
      queryObj.ExpressionAttributeValues[':email'] = { S: event.queryStringParameters.email };
      queryObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';
      queryObj.FilterExpression = 'email =:email';
      console.log("queryObj", queryObj);
      queryObj = paginationHandler(queryObj, event);
      const passData = await runQuery(queryObj);
      console.log("passData", passData);

      if (passData && passData.data && passData.data.length !== 0) {
        // Build cancellation email payload
        const claims = {
          iss: 'bcparks-lambda',
          sub: 'readPass',
          passId: event.queryStringParameters.passId,
          parkName: event.queryStringParameters.park
        }
        const token = jwt.sign(claims, process.env.JWT_SECRET, { expiresIn: '15m' });

        const cancellationLink = process.env.PUBLIC_FRONTEND
          + process.env.PASS_CANCELLATION_ROUTE
          + "?passId=" + passData.data[0].registrationNumber
          + "&park=" + event.queryStringParameters.park
          + "&code=" + token;

        const encodedCancellationLink = encodeURI(cancellationLink);

        let personalisation =  {
          'registrationNumber': passData.data[0].registrationNumber.toString(),
          'link': encodedCancellationLink
        };

        // Send email
        // Public page after 200OK should show 'check your email'
        try {
          await axios({
            method: 'post',
            url: process.env.GC_NOTIFY_API_PATH,
            headers: {
              'Authorization': process.env.GC_NOTIFY_API_KEY,
              'Content-Type': 'application/json'
            },
            data: {
              'email_address': passData.data[0].email,
              'template_id': process.env.GC_NOTIFY_CANCEL_TEMPLATE_ID,
              'personalisation': personalisation
            }
          });

          return sendResponse(200, personalisation);
        } catch  (err) {
          let errRes = personalisation;
          errRes["err"] = "Email Failed to Send";
          return sendResponse(200, errRes);
        }
      } else {
        return sendResponse(400, { msg: 'Invalid Request, pass does not exist'}, context);
      }
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

const checkAddExpressionAttributeNames = function(queryObj) {
  if (!queryObj.ExpressionAttributeNames) {
    queryObj.ExpressionAttributeNames = {};
  }
  return queryObj;
}

const paginationHandler = function(queryObj, event) {
  if (event.queryStringParameters.ExclusiveStartKeyPK && event.queryStringParameters.ExclusiveStartKeySK) {
    // Add the next page.
    queryObj.ExclusiveStartKey = {
      "pk": AWS.DynamoDB.Converter.input(event.queryStringParameters.ExclusiveStartKeyPK),
      "sk": AWS.DynamoDB.Converter.input(event.queryStringParameters.ExclusiveStartKeySK)
    }
  }
  return queryObj;
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
  return {
    LastEvaluatedKey: data.LastEvaluatedKey,
    data: unMarshalled
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