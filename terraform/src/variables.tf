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

variable "captcha_sign_expiry" {
  default = "5"
  description = "CAPTCHA JWT signature expiry duration in minutes"
}

variable "s3_bucket_data" {
  default = "parks-reso-data-sandbox"
  description = "Data directory for s3 back-end jobs"
}