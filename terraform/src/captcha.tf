data "aws_secretsmanager_secret_version" "private_key" {
  secret_id = "${var.target_env}/parks-reso-api/captcha-private-key"
}

locals {
  privateKey = data.aws_secretsmanager_secret_version.private_key.secret_string
}

# generateCaptchaLambda
resource "aws_lambda_function" "generateCaptchaLambda" {
  function_name = "generateCaptcha"

  filename         = "artifacts/generateCaptcha.zip"
  source_code_hash = filebase64sha256("artifacts/generateCaptcha.zip")

  handler = "lambda/captcha/handler.generateCaptcha"
  runtime = "nodejs14.x"
  publish = "true"

  environment {
    variables = {
      PRIVATE_KEY = local.privateKey
    }
  }

  role = aws_iam_role.basicExecutionRole.arn
}

resource "aws_lambda_alias" "generateCaptchaLambdaLatest" {
  name             = "latest"
  function_name    = aws_lambda_function.generateCaptchaLambda.function_name
  function_version = aws_lambda_function.generateCaptchaLambda.version
}

resource "null_resource" "alias_provisioned_concurrency_transition_delay_generate_captcha_lambda" {
  depends_on = [aws_lambda_alias.generateCaptchaLambdaLatest]
  provisioner "local-exec" {
   command = "sleep 240"
  }
  triggers = {
     function_version = "${aws_lambda_function.generateCaptchaLambda.version}"
  }
}

resource "aws_lambda_provisioned_concurrency_config" "generateCaptchaLambda" {
  depends_on = [null_resource.alias_provisioned_concurrency_transition_delay_generate_captcha_lambda]
  function_name                     = aws_lambda_alias.generateCaptchaLambdaLatest.function_name
  provisioned_concurrent_executions = 2
  qualifier                         = aws_lambda_alias.generateCaptchaLambdaLatest.name
}

resource "aws_lambda_permission" "generateCaptchaPermission" {
  statement_id  = "AllowParksDayUsePassAPIInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.generateCaptchaLambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/POST/captcha"
}

# verifyCaptchaLambda
resource "aws_lambda_function" "verifyCaptchaLambda" {
  function_name = "verifyCaptcha"

  filename         = "artifacts/verifyCaptcha.zip"
  source_code_hash = filebase64sha256("artifacts/verifyCaptcha.zip")

  handler = "lambda/captcha/handler.verifyAnswer"
  runtime = "nodejs14.x"
  publish = "true"

  environment {
    variables = {
      PRIVATE_KEY         = local.privateKey,
      JWT_SECRET          = local.jwtSecret.jwtSecret,
      CAPTCHA_SIGN_EXPIRY = var.captcha_sign_expiry
    }
  }

  role = aws_iam_role.basicExecutionRole.arn
}

resource "aws_lambda_alias" "verifyCaptchaLambdaLatest" {
  name             = "latest"
  function_name    = aws_lambda_function.verifyCaptchaLambda.function_name
  function_version = aws_lambda_function.verifyCaptchaLambda.version
}

resource "null_resource" "alias_provisioned_concurrency_transition_delay_verify_captcha_lambda" {
  depends_on = [aws_lambda_alias.verifyCaptchaLambdaLatest]
  provisioner "local-exec" {
   command = "sleep 240"
  }
  triggers = {
     function_version = "${aws_lambda_function.verifyCaptchaLambda.version}"
  }
}

resource "aws_lambda_provisioned_concurrency_config" "verifyCaptchaLambda" {
  depends_on = [null_resource.alias_provisioned_concurrency_transition_delay_verify_captcha_lambda]
  function_name                     = aws_lambda_alias.verifyCaptchaLambdaLatest.function_name
  provisioned_concurrent_executions = 2
  qualifier                         = aws_lambda_alias.verifyCaptchaLambdaLatest.name
}

resource "aws_lambda_permission" "verifyCaptchaPermission" {
  statement_id  = "AllowParksDayUsePassAPIInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.verifyCaptchaLambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/POST/captcha/verify"
}

# generateCaptchaAudioLambda
resource "aws_lambda_function" "generateCaptchaAudioLambda" {
  function_name = "generateCaptchaAudio"

  filename         = "artifacts/generateCaptchaAudio.zip"
  source_code_hash = filebase64sha256("artifacts/generateCaptchaAudio.zip")

  handler = "lambda/captcha/handler.generateAudio"
  runtime = "nodejs14.x"
  publish = "true"

  environment {
    variables = {
      PRIVATE_KEY = local.privateKey
    }
  }

  role = aws_iam_role.pollySynthesizeSpeechRole.arn
}

resource "aws_lambda_alias" "generateCaptchaAudioLambdaLatest" {
  name             = "latest"
  function_name    = aws_lambda_function.generateCaptchaAudioLambda.function_name
  function_version = aws_lambda_function.generateCaptchaAudioLambda.version
}

resource "aws_lambda_permission" "generateCaptchaAudioPermission" {
  statement_id  = "AllowParksDayUsePassAPIInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.generateCaptchaAudioLambda.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.apiLambda.execution_arn}/*/POST/captcha/audio"
}

module "captchaResource" {
  source = "./modules/cors-enabled-api-resource"

  resource_rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_parent_id   = aws_api_gateway_rest_api.apiLambda.root_resource_id
  resource_path_part   = "captcha"
}

resource "aws_api_gateway_method" "generateCaptchaMethod" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = module.captchaResource.resource.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "generateCaptchaIntegration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = module.captchaResource.resource.id
  http_method = aws_api_gateway_method.generateCaptchaMethod.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.generateCaptchaLambda.invoke_arn
}

module "captchaVerifyResource" {
  source = "./modules/cors-enabled-api-resource"

  resource_rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_parent_id   = module.captchaResource.resource.id
  resource_path_part   = "verify"
}

resource "aws_api_gateway_method" "captchaVerifyMethod" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = module.captchaVerifyResource.resource.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "captchaVerifyIntegration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = module.captchaVerifyResource.resource.id
  http_method = aws_api_gateway_method.captchaVerifyMethod.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.verifyCaptchaLambda.invoke_arn
}

module "captchaAudioResource" {
  source = "./modules/cors-enabled-api-resource"

  resource_rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_parent_id   = module.captchaResource.resource.id
  resource_path_part   = "audio"
}

resource "aws_api_gateway_method" "captchaAudioMethod" {
  rest_api_id   = aws_api_gateway_rest_api.apiLambda.id
  resource_id   = module.captchaAudioResource.resource.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "captchaAudioIntegration" {
  rest_api_id = aws_api_gateway_rest_api.apiLambda.id
  resource_id = module.captchaAudioResource.resource.id
  http_method = aws_api_gateway_method.captchaAudioMethod.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.generateCaptchaAudioLambda.invoke_arn
}
