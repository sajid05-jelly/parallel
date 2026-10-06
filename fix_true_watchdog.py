import re

with open('src/lib/WebRTCTransport.js', 'r', encoding='utf-8') as f:
    c = f.read()

pattern = r"// STALL WATCHDOG: If we are transferring, have data in buffer, but speed is 0 for 5\+ seconds -> Force ICE Restart.*?const remainingBytes = this\.progress\.totalBytes - actualSentBytes;"

replacement = '''// --- TRUE AVERAGE WATCHDOG ---
        if (this._watchdogBytes === undefined) this._watchdogBytes = actualSentBytes;
        if (this._watchdogStartTime === undefined) this._watchdogStartTime = now;
        
        const watchdogElapsed = (now - this._watchdogStartTime) / 1000;
        
        if (this.status === 'TRANSFERRING' && buffered > 0) {
          if (watchdogElapsed >= 15) { // Evaluate exactly every 15 seconds
            const bytesSentInWindow = actualSentBytes - this._watchdogBytes;
            const trueAverageSpeed = bytesSentInWindow / watchdogElapsed;
            
            if (trueAverageSpeed < 1000 * 1024) { // Less than 1 MB/s average over full 15s
              console.warn([WebRTCTransport] TRUE AVERAGE STALL DETECTED! Avg speed:  + trueAverageSpeed + /s. Forcing TCP/TLS Relay Fallback.);
              
              if (!this._forceRelayFallback) {
                this._forceRelayFallback = true;
                this._attemptRecovery();
              } else {
                this._attemptRecovery();
              }
            }
            
            // Reset window for next 15s block
            this._watchdogStartTime = now;
            this._watchdogBytes = actualSentBytes;
          }
        } else {
          // Reset window if not actively pushing against backpressure
          this._watchdogStartTime = now;
          this._watchdogBytes = actualSentBytes;
        }
        // -----------------------------

        const remainingBytes = this.progress.totalBytes - actualSentBytes;'''

c = re.sub(pattern, replacement, c, flags=re.DOTALL)

with open('src/lib/WebRTCTransport.js', 'w', encoding='utf-8') as f:
    f.write(c)

print("Applied true average watchdog.")
