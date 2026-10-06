import re

with open('src/lib/WebRTCTransport.js', 'r', encoding='utf-8') as f:
    c = f.read()

# Add _forceRelayFallback and _slowSpeedCount
if "_forceRelayFallback" not in c:
    c = c.replace("this._zeroSpeedCount = 0;", "this._zeroSpeedCount = 0;\n    this._slowSpeedCount = 0;\n    this._forceRelayFallback = false;")

# Update peer connection config
pattern_pc = r"const config = \{\n\s+iceServers: this\.mode === 'nearby' \? NEARBY_ICE_SERVERS : ICE_SERVERS\n\s+\};"
replacement_pc = '''const config = {
      iceServers: this.mode === 'nearby' ? NEARBY_ICE_SERVERS : ICE_SERVERS,
      iceTransportPolicy: this._forceRelayFallback ? 'relay' : 'all'
    };'''
if "iceTransportPolicy: this._forceRelayFallback" not in c:
    c = re.sub(pattern_pc, replacement_pc, c)

# Update watchdog
pattern_watchdog = r"// STALL WATCHDOG:.*?this\._zeroSpeedCount = 0;\n\s+\}"
replacement_watchdog = '''// STALL & THROTTLE WATCHDOG
        if (this.status === 'TRANSFERRING' && buffered > 0) {
          if (rollingSpeed < 1000) {
            this._zeroSpeedCount = (this._zeroSpeedCount || 0) + 1;
          } else {
            this._zeroSpeedCount = 0;
          }

          if (rollingSpeed > 1000 && rollingSpeed < 200 * 1024) { // Between 1KB/s and 200KB/s
            this._slowSpeedCount = (this._slowSpeedCount || 0) + 1;
          } else {
            this._slowSpeedCount = 0;
          }

          if (this._zeroSpeedCount > 50 || this._slowSpeedCount > 150) { // 5s zero OR 15s slow
            console.warn('[WebRTCTransport] THROTTLE/STALL DETECTED! Forcing Relay Fallback.');
            this._zeroSpeedCount = 0;
            this._slowSpeedCount = 0;
            if (!this._forceRelayFallback) {
              this._forceRelayFallback = true;
              this._attemptRecovery();
            } else {
              // Already in relay mode, just recover
              this._attemptRecovery();
            }
          }
        } else {
          this._zeroSpeedCount = 0;
          this._slowSpeedCount = 0;
        }'''
if "THROTTLE/STALL DETECTED" not in c:
    c = re.sub(pattern_watchdog, replacement_watchdog, c, flags=re.DOTALL)

with open('src/lib/WebRTCTransport.js', 'w', encoding='utf-8') as f:
    f.write(c)

print("Added bandwidth watchdog and relay fallback")
