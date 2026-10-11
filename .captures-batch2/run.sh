#!/bin/bash
cd ~/Workspace/morydeals-cart
while read -r name url; do
  [ -z "$name" ] && continue
  start=$(date +%s)
  timeout 150 npm run -s cli -w @morydeals/worker -- capture "$url" > ".captures-batch2/$name.json" 2> ".captures-batch2/$name.err" < /dev/null
  echo "$name $? $(( $(date +%s) - start ))s" >> .captures-batch2/status.txt
  sleep 4
done < .captures-batch2/urls.txt
echo DONE >> .captures-batch2/status.txt
