const AWS = require("aws-sdk");
const { dynamodb } = require("../dynamoUtil");
const crypto = require("crypto");

function convertRolesToMD5(roles, prefix = "") {
  const codedRoles = prefix + roles.join("-");
  const hash = crypto.createHash("md5").update(codedRoles).digest("hex");
  return hash;
}

// {
//     sk: String,
//     progressPercentage: Number,
//     key: String,
//     progressDescription: String
// }
// sk is an MD5 that is generated based on the user's roles.

async function updateJobEntry(jobObj, tableName) {
  jobObj.pk = "job";

  let newObject = AWS.DynamoDB.Converter.marshall(jobObj);
  let putObject = {
    TableName: tableName,
    Item: newObject,
  };
  await dynamodb.putItem(putObject).promise();
}

module.exports = {
  convertRolesToMD5,
  updateJobEntry,
};
