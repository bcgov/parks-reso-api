const AWS = require('aws-sdk');
AWS.config.update({region: process.env.AWS_DEFAULT_REGION});
const fs = require('fs');
const ssm = new AWS.SSM();
const secretsManager = new AWS.SecretsManager();

main();

async function main() {
  // Get System Manager Parameter Store Items
  let apiParameters = await getSMParametersByPath('/parks-reso-api');
  let adminParameters = await getSMParametersByPath('/parks-reso-admin');
  let publicParameters = await getSMParametersByPath('/parks-reso-public');

  const apiData = apiParameters.map((item) => { return { Name: item.Name, Value: item.Value } });
  const adminData = adminParameters.map((item) => { return { Name: item.Name, Value: item.Value } });
  const publicData = publicParameters.map((item) => { return { Name: item.Name, Value: item.Value } });

  console.log("Parameters for the 3 environments:",
              apiData,
              adminData,
              publicData);

  // Get Secrets Manager Items
  const secrets = await secretsManager.listSecrets().promise();
  const secretList = [];
  for (secret of secrets.SecretList) {
    const secretValue = await secretsManager.getSecretValue({SecretId: secret.Name}).promise();
    secretList.push({
      Name: secret.Name,
      Value: secretValue.SecretString
    })
  }
  console.log("Secrets for the environment:", secretList);

  try {
    const secretsDataFile = fs.writeFileSync('./secrets.json', JSON.stringify(secretList))
    const apiParametersDataFile = fs.writeFileSync('./apiParameters.json', JSON.stringify(apiData))
    const adminParametersDataFile = fs.writeFileSync('./adminParameters.json', JSON.stringify(adminData))
    const publicParametersDataFile = fs.writeFileSync('./publicParameters.json', JSON.stringify(publicData))
   } catch (err) {
    console.error(err)
  }
}

async function getSMParametersByPath(path, memo = [], nextToken) {
  let { Parameters, NextToken } = await ssm
    .getParametersByPath({ Path: path, WithDecryption: true, Recursive: true, NextToken: nextToken, MaxResults: 10 })
    .promise();
  const newMemo = memo.concat(Parameters);
  return NextToken ? await getSMParametersByPath(path, newMemo, NextToken) : newMemo;
}