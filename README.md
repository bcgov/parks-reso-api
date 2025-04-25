# Day Use Pass - API
![Lifecycle:Maturing](https://img.shields.io/badge/Lifecycle-Maturing-007EC6) [![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=bcgov_parks-reso-api&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=bcgov_parks-reso-api)

# Introduction

This repository consists of the back end API code for the Parks Services Administration. 

Associated repos:

- https://github.com/bcgov/parks-reso-public
- https://github.com/bcgov/parks-reso-admin
- https://github.com/bcgov/parks-reso-api

## Contribuition Guidelines

To contribute to this code, follow the steps through this link: https://bcgov.github.io/bcparks/collaborate 

# Local Development

## Prerequisites

* SAM CLI - [Install the SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
* Node.js - [Install Node.js 18](https://nodejs.org/en/), including the NPM package management tool.
* Docker - [Install Docker community edition](https://hub.docker.com/search/?type=edition&offering=community)

### DynamoDB Local

This project makes use of `dynamodb-local` for local development. You can start an instance of DyanmoDB using Docker.

```
docker run -d -p 8000:8000 --name dynamodb amazon/dynamodb-local -jar DynamoDBLocal.jar -sharedDb
```

### AWS Credentials

The AWS credentials `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` must exist in your environment as environment variables or in the `.aws` credential file. These values are used by the `aws-sdk` to instantiate sdk objects.

You can provide any value for them when using `dynamodb-local`. Real values are needed when performing operations on remote AWS services.

## Start Development Server
 Use the SAM CLI to build and test locally

Set the AWS Credentials:
   - AWS_ACCESS_KEY_ID
   - AWS_SECRET_ACCESS_KEY
   - AWS_SESSION_TOKEN
   - AWS_DEFAULT_REGION
   - AWS_REGION

Copy the [sample-vars.json](../docs/sample-vars.json) file to the root of your local `arSam` folder and make changes according to your own personal set up.

```
    "IS_OFFLINE":"true", // set to true if working online
    "DYNAMODB_ENDPOINT_URL":"http://172.17.0.1:8000", // local endpoint of your local dynamodb server
    "AWS_REGION":"local-env", // can be anything if working locally
    "TABLE_NAME":"parksReso", // local DynamoDB table name
    "METRICS_TABLE_NAME":"parksReso-metrics", // metrics table
    "CONFIG_TABLE_NAME":"parksReso-config" // config table
```

Navigate to the folder containing `template.yaml`

Build your application with the `sam build` command.

```bash
samNode$ sam build
```

Use the `sam local start-api` to run the API locally on port 3000.

```bash
samNode$ sam local start-api
samNode$ curl http://localhost:3000/
```

You can also use `npm run build` & `npm run start-full` to build and start the API locally.

## Connecting to remote AWS DynamoDB endpoints (for migrations, etc)

DynamoDB functionality is universally inherited from `dynamodb` which is exported from the [baseLayer](layers/baseLayer/baseLayer.js). By default, the DynamoDB endpoint is `dynamodb.<region>.amazonaws.com`, unless you have the local environment variable `IS_OFFLINE=true`. The `DYNAMODB_ENDPOINT_URL` environment variable determines which endpoint `dynamodb` will point to.

### Local connections
```
export IS_OFFLINE=true
export DYNAMODB_ENDPOINT_URL="http://172.17.0.1:8000" // local endpoint of your local dynamodb server
```

### Remote connections
```
unset IS_OFFLINE
export DYNAMODB_ENDPOINT_URL="https://dynamodb.ca-central-1.amazonaws.com" // remote endpoint for all dynamodb connections in ca-central-1
```

### Testing

Test a single function by invoking it directly with a test event. An event is a JSON document that represents the input that the function receives from the event source. Test events are included in the `events` folder in this project.

Run functions locally and invoke them with the `sam local invoke` command.

```bash
samNode$ sam local invoke HelloWorldFunction --event events/event.json
```

The SAM CLI reads the application template to determine the API's routes and the functions that they invoke. The `Events` property on each function's definition includes the route and method for each path.

```yaml
      Events:
        HelloWorld:
          Type: Api
          Properties:
            Path: /hello
            Method: get
```

Run the suite of unit tests with `npm run test`:

```bash
samNode$ npm run test
```

With SAM, Lambda and layer dependencies are stored in their respective `nodejs` folder upon running `sam build`, not the common `node_modules` folder. Since Jest looks for dependencies in the `node_modules` folder, a symlink is created in the build step so Jest can find layer dependencies outside of a SAM docker container environment.

Because of this, dependency mapping does not exist prior to `sam build` and therefore `sam build` is included in the `npm run test` script.

Additionally, Lambdas with layer dependencies import the layer using `require`:

```
const { layerFn } = require(/opt/layer);
```

The `/opt` directory is only available at runtime within the SAM docker container after running `sam build && sam local start-api`. Jest cannot be mapped to the `opt` directory. To work around this, Jest is configured to look for the respective layer resources using `moduleNameMapper`.

```package.json
"jest": {
  ...
  "moduleNameMapper": [
    "^/opt/baseLayer": "<rootDir>/.aws-sam/build/BaseLayer/baseLayer",
    "^/opt/constantsLayer": "<rootDir>/.aws-sam/build/ConstantsLayer/constantsLayer",
    ...,
    "^/opt/subAreaLayer": "<rootDir>/.aws-sam/build/subAreaLayer/subAreaLayer"
  ]
}
```

The configuration above tells Jest to look for layer resources in the build folder. We tell Jest to look here instead of the `/layer` folder because all the layer's dependencies are available within the build folder via symlink after running `sam build`.


# Deployment Pipeline


## Github Actions

On push to the Main branch, three actions run:

1. Lint
2. Unit Tests
3. Deploy to dev

The deploy to dev orchestrates deployment to AWS dev.


The first command will build the source of your application. The second command will package and deploy your application to AWS, with a series of prompts:

* **Stack Name**: The name of the stack to deploy to CloudFormation. This should be unique to your account and region, and a good starting point would be something matching your project name.
* **AWS Region**: The AWS region you want to deploy your app to.
* **Confirm changes before deploy**: If set to yes, any change sets will be shown to you before execution for manual review. If set to no, the AWS SAM CLI will automatically deploy application changes.
* **Allow SAM CLI IAM role creation**: Many AWS SAM templates, including this example, create AWS IAM roles required for the AWS Lambda function(s) included to access AWS services. By default, these are scoped down to minimum required permissions. To deploy an AWS CloudFormation stack which creates or modifies IAM roles, the `CAPABILITY_IAM` value for `capabilities` must be provided. If permission isn't provided through this prompt, to deploy this example you must explicitly pass `--capabilities CAPABILITY_IAM` to the `sam deploy` command.
* **Save arguments to samconfig.toml**: If set to yes, your choices will be saved to a configuration file inside the project, so that in the future you can just re-run `sam deploy` without parameters to deploy changes to your application.

You can find your API Gateway Endpoint URL in the output values displayed after deployment.

## Fetch, tail, and filter Lambda function logs

To simplify troubleshooting, SAM CLI has a command called `sam logs`. `sam logs` lets you fetch logs generated by your deployed Lambda function from the command line. In addition to printing the logs on the terminal, this command has several nifty features to help you quickly find the bug.

`NOTE`: This command works for all AWS Lambda functions; not just the ones you deploy using SAM.

```bash
samNode$ sam logs -n ConfigGet --stack-name ar-api --tail
```

You can find more information and examples about filtering Lambda function logs in the [SAM CLI Documentation](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-logging.html).

## Resources

See the [AWS SAM developer guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html) for an introduction to SAM specification, the SAM CLI, and serverless application concepts.

# Config service

Config service is used to alter frontend via DynamoDB. In Dynamo, an item with the PK and SK of config must exist. Within the attributes, you are able to set certain configurations such as `KEYCLOAK_ENABLED`, `API_LOCATION`, and `debugMode`.

This item is request by the front ends upon client connection.

