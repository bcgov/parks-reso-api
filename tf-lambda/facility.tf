// Auto pack lambda function.
data "archive_file" "readFacilityZip" {
    type        = "zip"
    source_dir  = "../readFacility"
    output_path = "readFacility.zip"
}

// Auto pack lambda function.
data "archive_file" "writeFacilityZip" {
    type        = "zip"
    source_dir  = "../writeFacility"
    output_path = "writeFacility.zip"
}

// Deploys the lambda via the zip above
resource "aws_lambda_function" "readFacilityLambda" {
   function_name = "readFacility"
   filename = "readFacility.zip"
   source_code_hash = "${data.archive_file.readFacilityZip.output_base64sha256}"

#    This method is for deploying things outside of TF.
#    s3_bucket = var.s3_bucket
#    s3_key    = "v1.0.0/readFacility.zip"

   handler = "index.handler"
   runtime = "nodejs12.x"

   environment {
    variables = {
      TABLE_NAME = var.db_name
    }
  }

   role = aws_iam_role.readRole.arn
}

// Deploys the lambda via the zip above
resource "aws_lambda_function" "writeFacilityLambda" {
   function_name = "writeFacility"
   filename = "writeFacility.zip"
   source_code_hash = "${data.archive_file.writeFacilityZip.output_base64sha256}"

#    This method is for deploying things outside of TF.
#    s3_bucket = var.s3_bucket
#    s3_key    = "v1.0.0/writeFacility.zip"

   handler = "index.handler"
   runtime = "nodejs12.x"

   environment {
    variables = {
      TABLE_NAME = var.db_name
    }
  }

   role = aws_iam_role.writeRole.arn
}

resource "aws_api_gateway_resource" "facilityResource" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  parent_id   = aws_api_gateway_rest_api.apiLambda.root_resource_id
  path_part   = "facility"
}

// Defines the HTTP GET /facility API
resource "aws_api_gateway_method" "readFacilityMethod" {
   rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
   resource_id   = aws_api_gateway_resource.facilityResource.id
   http_method   = "GET"
   authorization = "NONE"
}

// Defines the HTTP POST /facility API
resource "aws_api_gateway_method" "writeFacilityMethod" {
   rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
   resource_id   = aws_api_gateway_resource.facilityResource.id
   http_method   = "POST"
   authorization = "NONE"
}

// Integrates the APIG to Lambda via POST method
resource "aws_api_gateway_integration" "readFacilityIntegration" {
   rest_api_id = aws_api_gateway_rest_api.apiLambda.id
   resource_id = aws_api_gateway_resource.facilityResource.id
   http_method = aws_api_gateway_method.readFacilityMethod.http_method

   integration_http_method = "POST"
   type                    = "AWS_PROXY"
   uri                     = aws_lambda_function.readFacilityLambda.invoke_arn
}

// Integrates the APIG to Lambda via POST method
resource "aws_api_gateway_integration" "writeFacilityIntegration" {
   rest_api_id = aws_api_gateway_rest_api.apiLambda.id
   resource_id = aws_api_gateway_resource.facilityResource.id
   http_method = aws_api_gateway_method.writeFacilityMethod.http_method

   integration_http_method = "POST"
   type                    = "AWS_PROXY"
   uri                     = aws_lambda_function.writeFacilityLambda.invoke_arn
}

resource "aws_lambda_permission" "readFacilityPermission" {
   statement_id  = "AllowParksDayUseFacilityAPIInvoke"
   action        = "lambda:InvokeFunction"
   function_name = aws_lambda_function.readFacilityLambda.function_name
   principal     = "apigateway.amazonaws.com"
   source_arn = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/*/*"
}

resource "aws_lambda_permission" "writeFacilityPermission" {
   statement_id  = "AllowParksDayUseFacilityAPIInvoke"
   action        = "lambda:InvokeFunction"
   function_name = aws_lambda_function.writeFacilityLambda.function_name
   principal     = "apigateway.amazonaws.com"
   source_arn = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/*/*"
}