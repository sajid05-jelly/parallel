import re

# Receiver Fix
with open('src/lib/WebRTCReceiverTransport.js', 'r', encoding='utf-8') as f:
    r_content = f.read()

r_pattern = r"\} else if \(state === 'failed'\) \{.*?if \(!this\.isCompleted && this\.status !== 'COMPLETED'\) \{\n\s+if \(this\.status === 'TRANSFERRING' \|\| this\.status === 'CONNECTED'\) \{\n\s+this\._updateStatus\('RECOVERING'\);\n\s+this\._recoveryStartTime = Date\.now\(\);\n\s+this\._startRecoveryWatchdog\(\);\n\s+\}\n\s+\}\n\s+\}"

r_replacement = '''} else if (state === 'failed') {
        this._logDiagnostics('ICE_FAILED');
        if (this._connectionTimeout) {
          clearTimeout(this._connectionTimeout);
          this._connectionTimeout = null;
        }
        if (!this.isCompleted && this.status !== 'COMPLETED') {
          if (this.status === 'TRANSFERRING' || this.status === 'CONNECTED') {
            this._updateStatus('RECOVERING');
            this._recoveryStartTime = Date.now();
            this._startRecoveryWatchdog();
          } else {
            console.warn('[ReceiverTransport] ICE failed during negotiation. Failing transfer.');
            this.onError(new Error('Connection failed. Sender may have closed the portal or network is unreachable.'));
            this._updateStatus('FAILED');
          }
        }
      }'''

r_content = re.sub(r_pattern, r_replacement, r_content, flags=re.DOTALL)

with open('src/lib/WebRTCReceiverTransport.js', 'w', encoding='utf-8') as f:
    f.write(r_content)


# Sender Fix
with open('src/lib/WebRTCTransport.js', 'r', encoding='utf-8') as f:
    s_content = f.read()

s_pattern = r"\} else if \(state === 'failed'\) \{.*?if \(this\.status === 'TRANSFERRING' \|\| this\.status === 'CONNECTED'\) \{\n\s+this\._updateStatus\('RECOVERING'\);\n\s+\}\n\s+// Single recovery entry point\n\s+this\._attemptRecovery\(\);\n\s+\}"

s_replacement = '''} else if (state === 'failed') {
        this._iceHealthy = false;
        this._logDiagnostics('ICE_FAILED');
        if (this.isTransferCancelled || this.isCompleted) return;
        if (this.status === 'TRANSFERRING' || this.status === 'CONNECTED') {
          this._updateStatus('RECOVERING');
        } else {
          console.warn('[WebRTCTransport] ICE failed during negotiation. Failing transfer.');
          this.onError(new Error('Connection failed. Check your network and try again.'));
          this._updateStatus('FAILED');
          return;
        }
        // Single recovery entry point
        this._attemptRecovery();
      }'''

s_content = re.sub(s_pattern, s_replacement, s_content, flags=re.DOTALL)

with open('src/lib/WebRTCTransport.js', 'w', encoding='utf-8') as f:
    f.write(s_content)

print("Applied connection failover fix.")
