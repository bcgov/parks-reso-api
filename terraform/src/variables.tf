variable "target_aws_account_id" {
  description = "AWS workload account id"
}

variable "aws_region" {
  description = "The AWS region things are created in"
  # default     = "ca-central-1"
}

variable "target_env" {
  description = "target environment"
}

data "aws_ssm_parameter" "data_register_name_api_key" {
  name = "/parks-reso-api/data-register-name-api-key"
}

variable "captcha_sign_expiry" {
  default = "5"
  description = "CAPTCHA JWT signature expiry duration in minutes"
}

variable "env_identifier" {
  # For DUP merges - this should remain "" as dev/test/prod do not have these.  This is only for 
  # the sandbox environment to split up between developers by making your own unique environment
  # set to "-something"
  default = ""
  description = "Default string resource identifier"
}