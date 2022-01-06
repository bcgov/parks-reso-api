const AWS = require('aws-sdk');
AWS.config.update({region: process.env.AWS_DEFAULT_REGION});
const ssm = new AWS.SSM();
const secretsManager = new AWS.SecretsManager();

main();

async function main() {
  if (process.argv.length <= 5) {
    console.log("ssmInjector: Invalid parameters");
    console.log("");
    console.log("Usage: node ssmInjector.js <filename.json> <type> <from> <to>");
    console.log("");
    console.log("Options");
    console.log("    <filename>: A file that was extracted from ssmExtractor.js tool");
    console.log("    <type>: The file type that is needing to be processed.  Value values are: 'parameter' or 'secret'.");
    console.log("    <from>: The environment these params/secrets were coming from.  Typical values: dev/test/prod/sandbox");
    console.log("    <to>: The environment these params/secrets are going to.  Typical values: dev/test/prod/sandbox");
    console.log("");
    console.log("example: node ssmInjector.js myFile.json secret dev sandbox");
    console.log("");
  } else {
    const arg1 = process.argv[2];
    const theType = process.argv[3];
    const from = process.argv[4];
    const to = process.argv[5];
    const data = require(`./${arg1}`);

    for(entry of data) {
      // Add the secret to this environment.
      await addValue(entry, theType, from, to);
    }
  }
}

async function addValue(entry, type, from, to) {
  entry.Name = entry.Name.replace(from, to);
  console.log(`Putting: ${entry.Name} as ${entry.Value}`);

  try {
    if (type === 'parameter') {
      let resp = await ssm.putParameter({
                                          "Overwrite": true,
                                          "Type": "String",
                                          "Name": entry.Name,
                                          "Value": entry.Value,
                                          "Description": "Instance type for Test servers"
                                        }).promise();
      console.log("RESP:", resp);
    } else {
      let resp = await secretsManager.createSecret({
        Name: entry.Name,
        SecretString: entry.Value
      }).promise();
    }
  } catch (e) {
    console.log('Putting Error:', e);
  }
}