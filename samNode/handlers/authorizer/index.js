const { decodeJWT, resolvePermissions } = require('/opt/permissionLayer');
const { logger } = require('/opt/baseLayer');

const SSO_ISSUER = process.env.SSO_ISSUER || 'https://dev.loginproxy.gov.bc.ca/auth/realms/bcparks-service-transformation';
const SSO_JWKSURI = process.env.SSO_JWKSURI || 'https://dev.loginproxy.gov.bc.ca/auth/realms/bcparks-service-transformation/protocol/openid-connect/certs';

const publicPermissionObject = {
  isAdmin: false,
  role: ['public']
};

exports.handler = async function (event, context, callback) {
  logger.debug('event', JSON.stringify(event));

  const headers = event?.headers;
  let token = undefined;
  let permissionObject = undefined;

  if (headers?.Authorization && headers.Authorization !== 'None') {
    // Authorization: None is required because we don't have lambda@edge.
    // Until then, all unauth stuff needs to be here.
    // This is why methodARN isn't here.
    token = await decodeJWT(event, SSO_ISSUER, SSO_JWKSURI);
    logger.debug('token', JSON.stringify(token));

    if (!token.decoded) {
      logger.debug('Issue decoding token.');
      return generatePolicy('user', 'Deny', event.methodArn);
    }

    permissionObject = resolvePermissions(token);
    logger.debug('permissionObject', JSON.stringify(permissionObject));
    if (!permissionObject.isAuthenticated) {
      logger.debug('User is not authenticated.');
      return generatePolicy('user', 'Deny', event.methodArn);
    }
  }

  const methodArn = event.methodArn.replace(`${event.httpMethod}${event.path}`, `*`);

  if (!headers?.Authorization || headers?.Authorization === 'None') {
    logger.info(`Public user`);
    // Public user.
    return generatePolicy('public', 'Allow', methodArn, publicPermissionObject, headers);
  }

  // Sysadmin
  logger.debug('User authenticated.');

  // extract the base API gateway ARN from the event so that a policy can be generated for all routes
  // TODO: this will likely have to change to enforce more granular role permissions
  logger.info(`methodArn: ${event.methodArn}`);

  return generatePolicy(token.data.sid, 'Allow', methodArn, permissionObject, headers);
};

// Help function to generate an IAM policy
let generatePolicy = function (principalId, effect, methodArn, permissionObject, headers) {
  logger.debug('principalId', principalId);
  let authResponse = {};

  // Set principal Id
  authResponse.principalId = principalId;
  if (effect && methodArn) {
    let policyDocument = {};
    policyDocument.Version = '2012-10-17';
    policyDocument.Statement = [];
    let statementOne = {};
    statementOne.Action = 'execute-api:Invoke';
    statementOne.Effect = effect;
    statementOne.Resource = methodArn;
    policyDocument.Statement[0] = statementOne;

    // Set Policy Document
    authResponse.policyDocument = policyDocument;
  }

  if (effect === 'Allow') {
    return handleContext(authResponse, permissionObject, headers);
  } else {
    return authResponse;
  }
};

function handleContext(authResponse, permissionObject, headers) {
  // Optional output with custom properties of the String, Number or Boolean type.
  // Set the context
  authResponse.context = {
    isAdmin: permissionObject?.isAdmin,
    userID: permissionObject?.email,
    roles: JSON.stringify(permissionObject?.roles),
    isAuthenticated: permissionObject?.isAuthenticated
  };

  logger.debug('authResponse', JSON.stringify(authResponse));
  return authResponse;
};
