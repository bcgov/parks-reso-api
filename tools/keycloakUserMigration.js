const KcAdminClient = require('keycloak-admin').default;
const csv = require('csvtojson')
const fs = require('fs');

const idpMappers = {
  'dev': {
    'idir': 'idir',
    'bceid-basic-and-business': 'bceid',
    'bcsc': 'bcsc',
  },
  'test': {
    'idir': 'idir',
    'bceid-basic-and-business': 'bceid',
    'oidc': 'bcsc',
  },
  'prod': {
    'idir': 'idir',
    'bceid-basic-and-business': 'bceid',
    'bcsc': 'bcsc',
  }
}

const TARGET_ENV = "prod";

const existingRealm = {
  baseUrl: `https://oidc.gov.bc.ca/auth`,
  realmName: 'g7v0xlf4',
  username: 'admin',
  password: '', // TODO: Change me
  grantType: 'password',
  clientId: 'admin-cli'
};

const targetRealm = {
  baseUrl: `https://loginproxy.gov.bc.ca/auth`,
  realmName: 'bcparks-service-transformation',
  username: 'admin',
  password: '', // TODO: Change me
  grantType: 'password',
  clientId: 'admin-cli'
};

async function main() {
  try {
    const kcAdminClient = new KcAdminClient({
      baseUrl: existingRealm.baseUrl,
      realmName: existingRealm.realmName
    });
    // Authorize with username / password
    await kcAdminClient.auth({
      username: existingRealm.username,
      password: existingRealm.password,
      grantType: existingRealm.grantType,
      clientId: existingRealm.clientId
    });

    const kcAdminClientTarget = new KcAdminClient({
      baseUrl: targetRealm.baseUrl,
      realmName: targetRealm.realmName
    });
    // Authorize with username / password
    await kcAdminClientTarget.auth({
      username: existingRealm.username,
      password: existingRealm.password,
      grantType: existingRealm.grantType,
      clientId: existingRealm.clientId
    });

    const targetClients = await kcAdminClientTarget.clients.find();
    let allTargetClients = [];
    for (client of targetClients) {
      switch (client.clientId) {
        case 'staff-portal':
        case 'attendance-and-revenue':
        case 'parking-pass':
          allTargetClients.push(client);
          break;
      }
    }
    console.log("Existing Server Clients:", allTargetClients);
    // List all users
    const users = await kcAdminClient.users.find();

    for (user of users) {
      if (user.username.includes('@bceid') || user.username.includes('@idir')) {
        console.log(user);

        // Get their federated identities (should only be one)
        const federatedIdentities = await kcAdminClient.users.listFederatedIdentities({
          id: user.id
        });
        console.log("federatedIdentities", federatedIdentities);

        let idp = idpMappers[TARGET_ENV][federatedIdentities[0].identityProvider];

        console.log("IDP:", idp);
        const createdUser = await createUserInKC(kcAdminClientTarget, user, idp);

        if (!createdUser) {
          continue;
        }

        const existingRoles = await kcAdminClient.users.listRoleMappings({
          id: user.id
        });

        const ARMappings = existingRoles.clientMappings['attendance-and-revenue']?.mappings;
        const SPMappings = existingRoles.clientMappings['staff-portal']?.mappings;
        const PPMappings = existingRoles.clientMappings['parking-pass']?.mappings;

        const rolesForARClient = await kcAdminClientTarget.clients.listRoles({
          id: (allTargetClients.find(x => x.clientId === 'attendance-and-revenue')).id
        });
        const rolesForSPClient = await kcAdminClientTarget.clients.listRoles({
          id: (allTargetClients.find(x => x.clientId === 'staff-portal')).id
        });
        const rolesForPPClient = await kcAdminClientTarget.clients.listRoles({
          id: (allTargetClients.find(x => x.clientId === 'parking-pass')).id
        });

        if (ARMappings) {
          for (ar of ARMappings) {
            console.log(ar);
          }
        }
        await addRolesToTargetClient(kcAdminClientTarget, createdUser.id, (allTargetClients.find(x => x.clientId === 'attendance-and-revenue')).id, ARMappings, rolesForARClient);
        if (SPMappings) {
          for (sp of SPMappings) {
            console.log(sp);
          }
        }
        await addRolesToTargetClient(kcAdminClientTarget, createdUser.id, (allTargetClients.find(x => x.clientId === 'staff-portal')).id, SPMappings, rolesForSPClient);
        if (PPMappings) {
          for (pp of PPMappings) {
            console.log(pp);
          }
        }
        await addRolesToTargetClient(kcAdminClientTarget, createdUser.id, (allTargetClients.find(x => x.clientId === 'parking-pass')).id, PPMappings, rolesForPPClient);
      }
    }
  } catch (e) {
    console.log(e)
  }
}

async function addRolesToTargetClient(kcTarget, userId, clientId, rolesToAdd, clientTargetRoles) {
  if (!rolesToAdd) {
    return;
  }
  let roles = [];
  for (role of rolesToAdd) {
    const found = clientTargetRoles.find(x => {
      return x.name === role.name
    });
    if (found) {
      roles.push({
        id: found.id,
        name: found.name
      });
    }
  }

  let config = {
    id: userId,
    clientUniqueId: clientId,
    roles: roles
  };
  await kcTarget.users.addClientRoleMappings(config);
}

async function createUserInKC(kc, userData, IDP) {
  if (!IDP) {
    return null;
  }

  // Create the user in the target IDP
  let configuration;
  let userGUID;
  switch (IDP) {
    case 'idir': {
      userGUID = userData.attributes.idir_user_guid;
      configuration = {
        enabled: true,
        email: userData.email,
        username: userGUID + '@idir',
        firstName: userData.firstName,
        lastName: userData.lastName,
        attributes: {
          display_name: (userData.attributes.displayName && userData.attributes.displayName[0]) || '',
          idir_user_guid: userData.idir_user_guid,
          idir_username: userData.username,
        },
      }
    } break;
    case 'bceid': {
      // TODO
      console.log("userData", userData);
      const baseBceidGuid = userData.attributes.bceid_userid ? userData.attributes.bceid_userid[0] : userData.attributes.bceid_business_guid[0];
      console.log("BASE:", baseBceidGuid);
      const details = (await fetchBceidUser({ accountType: 'Business', matchKey: baseBceidGuid, TARGET_ENV, email: userData.email, data: userData.attributes.bceid_business_guid })) || (await fetchBceidUser({ accountType: 'Individual', matchKey: baseBceidGuid, TARGET_ENV }));

      console.log("After fetch", details);

      configuration = {
        enabled: true,
        email: userData.email,
        username: details.guid.toLowerCase() + '@bceidboth',
        firstName: userData.firstName,
        lastName: userData.lastName,
        attributes: {
          display_name: (userData.attributes.displayName && userData.attributes.displayName[0]) || '',
          bceid_user_guid: details.guid,
          bceid_username: details.userId,
          bceid_type: details.type,
          realm_username: details.realm_username
        },
      }
    } break;
  }

  // Create or find if fail
  let userObject;
  try {
    console.log("Creating", configuration)
    userObject = await kc.users.create(configuration);
    console.log("Created User", userObject);
  } catch (e) {
    console.log("User already existed, finding...", configuration);
    userObject = await kc.users.findOne({
      email: configuration.email
    })
    console.log("UserObject1:", userObject);
    if (Array.isArray(userObject)) {
      userObject = userObject[0]
    }
    console.log("UserObject2:", userObject);
  }

  let accuserid, accusername;

  if (configuration.attributes.bceid_username) {
    // BCEID
    accuserid = configuration.attributes.bceid_username;
    accusername = configuration.attributes.realm_username.split('@')[0];
    console.log("accuserid:", accuserid)
    console.log("accusername:", accusername)
  } else {
    // IDIR
    accuserid = userGUID[0].toLowerCase() + '@idir';
    accusername = userGUID[0].toLowerCase() + '@idir';
  }

  // Add link to their IDP
  const fedIdentityObj = {
    realm: targetRealm.realmName,
    id: userObject.id,
    federatedIdentityId: IDP,
    federatedIdentity: {
      userId: accuserid.toLowerCase() + '@bceidboth',
      userName: accuserid.toLowerCase() + '@bceidboth',
      identityProvider: IDP,
    },
  };
  console.log("fedIdentityObj:", fedIdentityObj)
  try {
    await kc.users.addToFederatedIdentity(fedIdentityObj);
  } catch (e) {
    // User is already associated, fall through.
  }
  return userObject;
}

const fetchBceidUser = async ({ accountType = 'Business', matchKey = '', env = 'dev', email, userData }) => {

  console.log("MATCHING:", matchKey);
  
  const data = await csv().fromFile('bceiddata.csv');

  for (item of data) {
    // console.log("item:", item);
    console.log("item:", item.bceid_user_guid);

    if (email && item.email === email) {
      console.log("email:", email);
      console.log("item:", item);
      return {
        guid: item.bceid_user_guid,
        userId: item.bceid_user_guid,
        displayName: item.display_name,
        type: item.bceid_type,
        realm_username: item.realm_username
      };
    } else if (item.bceid_user_guid === matchKey) {
      return {
        guid: item.bceid_user_guid,
        userId: item.bceid_user_guid,
        displayName: item.display_name,
        type: item.bceid_type,
        realm_username: item.realm_username
      };
    }
  }

  console.log("COULD NOT FIND", matchKey)
};

main().then(data => {
  console.log("Finished:");
});