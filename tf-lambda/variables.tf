variable "target_env" {
  description = "AWS workload account env (e.g. dev, test, prod, sandbox, unclass)"
}

variable "target_aws_account_id" {
  description = "AWS workload account id"
}

variable "aws_region" {
  description = "The AWS region things are created in"
  default     = "ca-central-1"
}

variable "app_name" {
  description = "Name of the application"
  type        = string
  default     = "parkAPI"
}

variable "db_name" {
  description = "DynamoDB DB Name"
  default     = "parkreso"
}

variable "common_tags" {
  description = "Common tags for created resources"
  default = {
    Application = "Park Reservation System"
  }
}

variable "s3_bucket" {}

variable "deployEnvironment" {}