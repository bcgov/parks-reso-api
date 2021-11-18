import json
import os

with open('./dump.json') as f:
    dump = json.load(f)

for item in dump["Items"]:
    formattedString = json.dumps(item, separators=(',', ':'))
    formattedString = formattedString.replace('"', r'\"')

    cmd = "aws --endpoint-url=http://localhost:8000 dynamodb put-item --table-name=parksreso --item=\"{0}\"".format(
        formattedString)
    os.system(cmd)
