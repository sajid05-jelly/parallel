import re

with open('src/lib/WebRTCTransport.js', 'r', encoding='utf-8') as f:
    c = f.read()

pattern = r"console\.log\('\[WAN_DIAGNOSTICS\] =============================='\);\s+console\.log\(\[WAN_DIAGNOSTICS\] MODE[\s\S]*?console\.log\('\[WAN_DIAGNOSTICS\] =============================='\);"

replacement = '''              console.log('[WAN_DIAGNOSTICS] ==============================');
              console.log([WAN_DIAGNOSTICS] MODE=);
              console.log([WAN_DIAGNOSTICS] candidatePair= <-> );
              console.log([WAN_DIAGNOSTICS] protocol=);
              console.log([WAN_DIAGNOSTICS] localAddress=: ());
              console.log([WAN_DIAGNOSTICS] remoteAddress=:);
              console.log([WAN_DIAGNOSTICS] currentRoundTripTime= s);
              console.log([WAN_DIAGNOSTICS] availableOutgoingBitrate=);
              console.log('[WAN_DIAGNOSTICS] ==============================');

              const isRelay = localCand?.candidateType === 'relay' || remoteCand?.candidateType === 'relay';
              this._wanDiagnostics = {
                path: isRelay ? 'RELAY (TURN)' : 'DIRECT (STUN/HOST)',
                transport: (localCand?.protocol || 'unknown').toUpperCase(),
                activePair: ${localCand?.candidateType} <-> 
              };'''

c = re.sub(pattern, replacement, c)

with open('src/lib/WebRTCTransport.js', 'w', encoding='utf-8') as f:
    f.write(c)
