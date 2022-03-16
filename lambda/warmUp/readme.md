# Lambda Warm Up Functions
This function utilizes threading generate concurrent calls to a given function.

## Issue
In the case of DUP, we often get high ammounts of traffic at 7AM. This is because 7 AM is when people are allowed to book passes. Since we received this wave of users at the same time, some people reported communication errors with our servers. This is because Lambda takes time to automatically spin up instances to handle load.

## Solution
One part of the solution was to create a way to warm up relevant Lambda functions prior to spikes in traffic. This function allows us to do that. The following functions have been equiped with a warm up break out:

```
readConfig
readPark
readFacility
generateCaptcha
verifyCaptcha
writePass
```

When creating a call to these functions, use the following payload:

```
{
  "warmup": true
}
```

This will cause the function to skip all functionality and return a 200 OK. This is all that is required for Lambda to spin up instances of itself, given there are enough concurrent calls to the function.

## Current AWS Solution
The pipeline for this code is as follows:

```
yarn build > Terraform > Lambda

Terraform > Eventbridge > Invoke warmup
```

At the moment, we have EventBridge invoke the warm up function at 6:57 AM, 6:58 AM and 6:59 AM every day.

## Example payload
```
{
  "configArray": [
    {
      "funcName": "readConfig",
      "funcVersion": "latest",
      "concurrency": "5",
      "log": true
    },
    {
      "funcName": "readPark",
      "funcVersion": "latest",
      "concurrency": "10"
    },
    {
      "funcName": "readFacility",
      "funcVersion": "2",
      "concurrency": "100"
    }
  ],
  "delay": 1000,
  "log": true
}
```