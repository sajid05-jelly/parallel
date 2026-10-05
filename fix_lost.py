import re

with open('src/lib/WebRTCTransport.js', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Fix the setTimeout throttle issue
pattern_yield = r"// Yield to browser event loop every 5 chunks so ICE keepalives get processed\n\s+if \(chunkIndex % 5 === 0\) \{\n\s+await new Promise\(r => setTimeout\(r, 0\)\);\n\s+\}"

replacement_yield = '''// Yield to browser event loop to allow ACKs and UI updates
        if (Date.now() - this._lastYieldTime > 10) {
          await new Promise(r => setTimeout(r, 0));
          this._lastYieldTime = Date.now();
        }'''

if "chunkIndex % 5 === 0" in c:
    c = re.sub(pattern_yield, replacement_yield, c)

# 2. Add _lastYieldTime init
pattern_init = r"let chunkIndex = 0;\n\n\s+while \(chunkIndex < totalChunks\) \{"
replacement_init = '''let chunkIndex = 0;
      this._lastYieldTime = Date.now();

      while (chunkIndex < totalChunks) {'''
c = re.sub(pattern_init, replacement_init, c)

# 3. Add this._wanDiagnostics init
if "this._wanDiagnostics = { path: 'Unknown'" not in c:
    c = c.replace("this.progress = {", "this._wanDiagnostics = { path: 'Unknown', transport: 'Unknown', activePair: '', localType: 'Unknown', remoteType: 'Unknown' };\n    this.progress = {")

# 4. Inject progress.diagnostics and logging into _updateProgressStats
pattern_progress = r"this\.progress\.percentage = Math\.min\(100, Math\.max\(0, \(actualSentBytes / this\.progress\.totalBytes\) \* 100\)\);\n\n\s+this\._lastUpdate = now;\n\s+this\._lastActualSentBytes = actualSentBytes;\n\n\s+this\.onProgress\(\{ \.\.\.this\.progress \}\);"

replacement_progress = '''this.progress.percentage = Math.min(100, Math.max(0, (actualSentBytes / this.progress.totalBytes) * 100));

        this._lastUpdate = now;
        this._lastActualSentBytes = actualSentBytes;

        this.progress.diagnostics = {
          path: this._wanDiagnostics?.path || 'Unknown',
          transport: this._wanDiagnostics?.transport || 'Unknown',
          localType: this._wanDiagnostics?.localType || 'Unknown',
          remoteType: this._wanDiagnostics?.remoteType || 'Unknown',
          activePair: this._wanDiagnostics?.activePair || 'Unknown',
          chunkSize: this._negotiatedChunkSize || 32768,
          bufferedAmount: buffered,
          ackWindow: (this._filePlaintextBytesSent || 0) - (this._currentFileAck?.ackedBytes || 0),
          actualThroughput: formatFileSize(rollingSpeed) + '/s',
          retransmissions: 0
        };

        if (!this._lastDiagLog || now - this._lastDiagLog > 5000) {
          console.log(`
[WEBRTC NETWORK]
ICE candidate pair: ${this._wanDiagnostics?.activePair}
local candidate type: ${this._wanDiagnostics?.localType}
remote candidate type: ${this._wanDiagnostics?.remoteType}
connection path: ${this._wanDiagnostics?.path}
transport: ${this._wanDiagnostics?.transport}
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

        this.onProgress({ ...this.progress });'''

c = re.sub(pattern_progress, replacement_progress, c)

with open('src/lib/WebRTCTransport.js', 'w', encoding='utf-8') as f:
    f.write(c)

print("Updates applied to WebRTCTransport.js")
