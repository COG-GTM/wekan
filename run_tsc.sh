#!/bin/bash
export PATH=/home/ubuntu/.nvm/versions/node/v20.20.2/bin:$PATH
cd /home/ubuntu/repos/wekan
node node_modules/typescript/lib/tsc.js --noEmit 2>&1 | grep "error TS" > /tmp/tsc_now.txt
echo "TOTAL errors: $(wc -l < /tmp/tsc_now.txt)"
echo "=== errors NOT in known-preexisting (server/models cards|checklists|dependencies) ==="
grep -vE "server/models/(cards|checklists|dependencies)\.ts" /tmp/tsc_now.txt
echo "=== end ==="
