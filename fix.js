const fs = require('fs');
let c = fs.readFileSync('src/lib/WebRTCTransport.js', 'utf8');
c = c.replace(/console\.log\(\[WAN_DIAGNOSTICS\] MODE=[\s\S]*?activePair:.*?\n\s*\};\n/m, 
  "console.log(\[WAN_DIAGNOSTICS] MODE=\\);\n" +
  "              console.log(\[WAN_DIAGNOSTICS] candidatePair=\ <-> \\);\n" +
  "              console.log(\[WAN_DIAGNOSTICS] protocol=\\);\n" +
  "              console.log(\[WAN_DIAGNOSTICS] localAddress=\:\ (\)\);\n" +
  "              console.log(\[WAN_DIAGNOSTICS] remoteAddress=\:\\);\n" +
  "              console.log(\[WAN_DIAGNOSTICS] currentRoundTripTime=\ s\);\n" +
  "              console.log(\[WAN_DIAGNOSTICS] availableOutgoingBitrate=\\);\n" +
  "              console.log('[WAN_DIAGNOSTICS] ==============================');\n\n" +
  "              const isRelay = localCand?.candidateType === 'relay' || remoteCand?.candidateType === 'relay';\n" +
  "              this._wanDiagnostics = {\n" +
  "                path: isRelay ? 'RELAY (TURN)' : 'DIRECT (STUN/HOST)',\n" +
  "                transport: (localCand?.protocol || 'unknown').toUpperCase(),\n" +
  "                activePair: \\ <-> \\\n" +
  "              };\n"
);
fs.writeFileSync('src/lib/WebRTCTransport.js', c);
