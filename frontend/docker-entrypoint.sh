#!/bin/sh
# Write runtime URLs for the Next.js app (env is available here; Next may not see it).
node -e "
const fs = require('fs');
const cfg = {
  api_direct: process.env.API_DIRECT_URL || process.env.NEXT_PUBLIC_API_DIRECT_URL || '',
  ws_url: process.env.WS_URL || process.env.NEXT_PUBLIC_WS_URL || '',
};
fs.writeFileSync('/tmp/resonance-runtime.json', JSON.stringify(cfg));
"
exec node server.js
