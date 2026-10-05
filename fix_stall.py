import re

with open('src/lib/WebRTCTransport.js', 'r', encoding='utf-8') as f:
    c = f.read()

# Add watchdog properties to constructor
if "this._stallWatchdog = null;" not in c:
    c = c.replace("this.isTransferCancelled = false;", "this.isTransferCancelled = false;\n    this._stallWatchdog = null;\n    this._zeroSpeedCount = 0;")

# In _updateProgressStats, implement the watchdog
pattern = r"this\.progress\.speed = rollingSpeed;"
replacement = '''this.progress.speed = rollingSpeed;
        
        // STALL WATCHDOG: If we are transferring, have data in buffer, but speed is 0 for 5+ seconds -> Force ICE Restart
        if (this.status === 'TRANSFERRING' && buffered > 0) {
          if (rollingSpeed < 1000) { // less than 1KB/s
            this._zeroSpeedCount = (this._zeroSpeedCount || 0) + 1;
          } else {
            this._zeroSpeedCount = 0;
          }

          if (this._zeroSpeedCount > 50) { // 50 ticks * 0.1s = 5 seconds
            console.warn('[WebRTCTransport] STALL DETECTED! Forcing ICE Restart to find a better path.');
            this._zeroSpeedCount = 0;
            this._attemptRecovery();
          }
        } else {
          this._zeroSpeedCount = 0;
        }'''

if "STALL WATCHDOG" not in c:
    c = re.sub(pattern, replacement, c)

with open('src/lib/WebRTCTransport.js', 'w', encoding='utf-8') as f:
    f.write(c)
