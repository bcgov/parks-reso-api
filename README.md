# Parks Reservation - API
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

### DynamoDB Local

This project makes use of `dynamodb-local` for local development. You can start an instance of DyanmoDB using Docker.

```
docker run -d -p 8000:8000 --name dynamodb amazon/dynamodb-local -jar DynamoDBLocal.jar -sharedDb
```

### AWS Credentials

The AWS credentials `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` must exist in your environment as environment variables or in the `.aws` credential file. These values are used by the `aws-sdk` to instantiate sdk objects.

You can provide any value for them when using `dynamodb-local`. Real values are needed when performing operations on remote AWS services such as generating CAPTCHA audio using AWS Polly.

## Start Development Server

```
yarn install
yarn start
```

Once server starts, the API will be available at http://localhost:3000/api. The local server is also configured to seed some basic data from the `data` directory.

## Create Lambda Packages

The Serverless Framework is setup to package Lambda functions into individual zip files which is then used by Terraform to deploy to AWS.

```
yarn build
```

# Deployment Pipeline

## Github Actions

On push to the Main branch, three actions run:

1. Lint
2. Unit Tests
3. Deploy to dev

The deploy to dev orchestrates deployment to AWS dev.

## Getting environment variables for Actions and Terraform

There are three places where secrets and variables are stored.

### Github

The secrets stored in Github are required for the AWS configuration in Github actions. The variables are as follows:

- AWS_REGION

These secrets are permanent and will not have to be changed in the future.

These environment variables need to be set for each dev/test/prod environment:

- ACCOUNT_ID
- AWS_ROLE_ARN_TO_USE

### Terraform

There are a few secrets and variables that must be stored in Terraform Cloud. This is because they are required for provider initilization. This initialization happens before we are able to get variables from Github so they cannot be passed from AWS Parameter store. The variables are as follows:

- target_env
- aws_region
- target_aws_account_id

These variables and secrets are permanent and will not have to be changed in the future.

### AWS Parameter Store

These variables are required by Github Actions as well as Terraform. The variables themselves are stored in AWS Parameter Store. These parameters are organized into four categories:

- parks-reso-api/
- parks-reso-admin/
- parks-reso-public/
- parks-reso-shared/

These variables are passed to Terraform Cloud in the following steps:

```
AWS Parameter Store -> Github -> Terragrunt -> *.auto.tfvars -> Terraform Cloud
```

If a variable must be updated, you must update it from AWS Parameter store.

### AWS Parameter Store

API requires a JWT secret for emails to work. This secret is stored in Secret Manager on AWS. This allows for secret rotation. This secret is accessed by Terraform Cloud directly.

## Install, zip and upload to S3

For each of the functions we must run `yarn install`. After that, each function directory is zipped up and uploaded to S3. These zips will then be pulled down by Terraform Cloud.

## Terragrunt and Terraform Cloud

This creates several things in AWS:

- DynamoDB
- Cloudfront Distribution
- Connections among S3, Cloudfront, DynamoDB and API Gateway.

## Deploying to test and prod

Test pipeline is triggered by publishing a release that is marked as a `pre-release`.

Prod pipeline is triggered by removing the `pre-release` tag from a release.

# Config service

Config service is used to alter frontend via DynamoDB. In Dynamo, an item with the PK and SK of config must exist. Within the attributes, you are able to set certain configurations such as `KEYCLOAK_ENABLED`, `API_LOCATION`, and `debugMode`.

This item is request by the front ends upon client connection.
