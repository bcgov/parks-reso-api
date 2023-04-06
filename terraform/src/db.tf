resource "aws_dynamodb_table" "park_dup_table" {
  name = "${data.aws_ssm_parameter.db_name.value}${var.env_identifier}"
  hash_key       = "pk"
  range_key      = "sk"
  billing_mode   = "PAY_PER_REQUEST"

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "Database"
  }

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "shortPassDate"
    type = "S"
  }

  attribute {
    name = "passStatus"
    type = "S"
  }

   attribute {
    name = "facilityName"
    type = "S"
  }

  global_secondary_index {
    name               = "shortPassDate-index"
    hash_key           = "shortPassDate"
    range_key          = "facilityName"
    write_capacity     = 10
    read_capacity      = 10
    projection_type    = "INCLUDE"
    non_key_attributes = [
      "firstName",
      "searchFirstName",
      "lastName",
      "searchLastName",
      "email",
      "date",
      "type",
      "registrationNumber",
      "numberOfGuests",
      "passStatus",
      "phoneNumber",
      "facilityType",
      "license",
      "creationDate",
      "isOverbooked",
      "parkName",
      "pk"
]
  }

  global_secondary_index {
    name               = "manualLookup-index"
    hash_key           = "shortPassDate"
    range_key          = "facilityName"
    write_capacity     = 10
    read_capacity      = 10
    projection_type    = "ALL"
  }

  global_secondary_index {
    name               = "passStatus-index"
    hash_key           = "passStatus"
    write_capacity     = 1
    read_capacity      = 1
    projection_type    = "INCLUDE"
    non_key_attributes = [
      "type",
      "date",
      "pk",
      "sk"
    ]
  }
}

resource "aws_dynamodb_table" "park_dup_meta_table" {
  name           = "${data.aws_ssm_parameter.meta_db_name.value}${var.env_identifier}"
  hash_key       = "pk"
  range_key      = "sk"
  billing_mode   = "PAY_PER_REQUEST"

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "Database"
  }

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }
}

resource "aws_dynamodb_table" "park_dup_metrics_table" {
  name           = "${data.aws_ssm_parameter.metrics_db_name.value}${var.env_identifier}"
  hash_key       = "pk"
  range_key      = "sk"
  billing_mode   = "PAY_PER_REQUEST"

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "Database"
  }

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }
}

resource "aws_backup_vault" "parksreso_backup_vault" {
  name        = "backup_vault_for_parksreso${var.env_identifier}"
}

resource "aws_backup_plan" "parksreso_backup" {
  name = "parksreso_backup_plan${var.env_identifier}"

  rule {
    rule_name         = "parksreso_backup_rule${var.env_identifier}"
    target_vault_name = aws_backup_vault.parksreso_backup_vault.name
    schedule          = "cron(0 12 * * ? *)"

    lifecycle {
      delete_after = 360
    }
  }
}
