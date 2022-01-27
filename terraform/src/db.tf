resource "aws_dynamodb_table" "park_dup_table" {
  name           = data.aws_ssm_parameter.db_name.value
  hash_key       = "pk"
  range_key      = "sk"
  read_capacity  = 1
  write_capacity = 1

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

  global_secondary_index {
    name               = "shortPassDate-index"
    hash_key           = "shortPassDate"
    range_key          = "facilityName"
    write_capacity     = 10
    read_capacity      = 10
    projection_type    = "INCLUDE"
    non_key_attributes = [
      firstName,
      searchFirstName,
      lastName,
      searchLastName,
      facilityName,
      email,
      date,
      shortPassDate,
      type,
      registrationNumber,
      numberOfGuests,
      passStatus,
      phoneNumber,
      facilityType,
      license
    ]
  }
}

resource "aws_backup_vault" "parksreso_backup_vault" {
  name        = "backup_vault_for_parksreso"
}

resource "aws_backup_plan" "parksreso_backup" {
  name = "parksreso_backup_plan"

  rule {
    rule_name         = "parksreso_backup_rule"
    target_vault_name = aws_backup_vault.parksreso_backup_vault.name
    schedule          = "cron(0 12 * * ? *)"

    lifecycle {
      delete_after = 360
    }
  }
}
