# this script populates a dynamo database from a json file output geneerated from a scan
# you can use this to mograte data from one project to another

# to generate the database.json file run the following command while logged into the aws console in the project with the data you want to move
# `aws dynamodb scan --table-name=parkreso > ./dump.json`

# then login to the aws console in the project you want to move the data to and run the following python script
# `python3 ./dynamoMigrator.py`

import json
import os

with open('./dump.json') as f:
  dump = json.load(f)

for item in dump["Items"]:
  formattedString = json.dumps(item, separators=(',', ':'))
  formattedString = formattedString.replace('"', r'\"')

  cmd = "aws dynamodb put-item --table-name=\"parkreso\" --item=\"{0}\"".format(formattedString)
  os.system(cmd)