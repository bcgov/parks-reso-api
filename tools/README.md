###Dynamo Migration Script

this script populates a dynamo database called parksreso from a json file output generated from a scan you can use this to migrate data from one project to another

1. login using the aws console credentials for the project with data you want to move from
2. to generate the dump.json file run the following command:

`aws dynamodb scan --table-name=parksreso > ./dump.json`

3. login using the aws console credentials for the project you want to move the data into
4. run the script:

`node dynamoRestore.js`
