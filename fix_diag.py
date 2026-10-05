import re

with open('src/lib/WebRTCTransport.js', 'r', encoding='utf-8') as f:
    c = f.read()

pattern_stats = r"console\.log\('\[WAN_DIAGNOSTICS\] =============================='\);[\s\S]*?console\.log\('\[WAN_DIAGNOSTICS\] =============================='\);"

replacement_stats = '''
              const localType = localCand?.candidateType || 'unknown';
              const remoteType = remoteCand?.candidateType || 'unknown';
              const isRelay = localType === 'relay' || remoteType === 'relay';
              const path = isRelay ? 'RELAY' : 'DIRECT';
              const transport = (localCand?.protocol || 'unknown').toUpperCase();
              
              this._wanDiagnostics = {
                activePair: `${localType} <-> ${remoteType}`,
                localType,
                remoteType,
                path,
                transport
              };
'''

if "console.log('[WAN_DIAGNOSTICS] ==============================');" in c:
    c = re.sub(pattern_stats, replacement_stats, c)

pattern_progress = r"this\.progress\.diagnostics = \{[\s\S]*?\};\n\n      this\.onProgress\(\{ \.\.\.this\.progress \}\);"

replacement_progress = '''
      this.progress.diagnostics = {
        path: this._wanDiagnostics.path,
        transport: this._wanDiagnostics.transport,
        localType: this._wanDiagnostics.localType,
        remoteType: this._wanDiagnostics.remoteType,
        activePair: this._wanDiagnostics.activePair,
        chunkSize: this._negotiatedChunkSize || 32768,
        bufferedAmount: buffered,
        ackWindow: (this._filePlaintextBytesSent || 0) - (this._currentFileAck?.ackedBytes || 0),
        actualThroughput: formatFileSize(rollingSpeed) + '/s',
        retransmissions: 0
      };

      if (!this._lastDiagLog || now - this._lastDiagLog > 5000) {
        console.log(`
[WEBRTC NETWORK]
ICE candidate pair: ${this._wanDiagnostics.activePair}
local candidate type: ${this._wanDiagnostics.localType}
remote candidate type: ${this._wanDiagnostics.remoteType}
connection path: ${this._wanDiagnostics.path}
transport: ${this._wanDiagnostics.transport}
ICE state: ${this.peerConnection?.iceConnectionState || 'unknown'}
connection state: ${this.peerConnection?.connectionState || 'unknown'}
DataChannel state: ${this.dataChannel?.readyState || 'unknown'}
bufferedAmount: ${buffered}
chunk size: ${this._negotiatedChunkSize || 32768}
ACK window: ${(this._filePlaintextBytesSent || 0) - (this._currentFileAck?.ackedBytes || 0)}
actual throughput: ${formatFileSize(rollingSpeed)}/s
`);
        this._lastDiagLog = now;
      }

      this.onProgress({ ...this.progress });
'''

c = re.sub(pattern_progress, replacement_progress, c)

with open('src/lib/WebRTCTransport.js', 'w', encoding='utf-8') as f:
    f.write(c)
