#!/bin/bash
cd ~/Workspace/morydeals-cart
while read -r name url; do
  [ -z "$name" ] && continue
  start=$(date +%s)
  timeout 150 npm run -s cli -w @morydeals/worker -- capture "$url" > ".captures-batch1/$name.json" 2> ".captures-batch1/$name.err" < /dev/null
  echo "$name $? $(( $(date +%s) - start ))s" >> .captures-batch1/status.txt
  sleep 4
done < .captures-batch1/urls.txt
echo DONE >> .captures-batch1/status.txt
