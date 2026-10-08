import re

# Receiver Fix
with open('src/lib/WebRTCReceiverTransport.js', 'r', encoding='utf-8') as f:
    r_content = f.read()

r_pattern = r"\} else \{.*?console\.warn\('\[ReceiverTransport\] ICE failed during negotiation\. Failing transfer\.'\);\n\s+this\.onError\(new Error\('Connection failed\. Sender may have closed the portal or network is unreachable\.'\)\);\n\s+this\._updateStatus\('FAILED'\);\n\s+\}\n\s+\}\n\s+\}"

r_replacement = '''} else {
            console.warn('[ReceiverTransport] ICE failed during initial negotiation. Strict network detected (e.g. College WiFi). Waiting for Sender to force TCP/Relay Fallback.');
            this._updateStatus('RECOVERING');
            this._recoveryStartTime = Date.now();
            this._startRecoveryWatchdog();
          }
        }
      }'''

r_content = re.sub(r_pattern, r_replacement, r_content, flags=re.DOTALL)

with open('src/lib/WebRTCReceiverTransport.js', 'w', encoding='utf-8') as f:
    f.write(r_content)


# Sender Fix
with open('src/lib/WebRTCTransport.js', 'r', encoding='utf-8') as f:
    s_content = f.read()

s_pattern = r"\} else \{.*?console\.warn\('\[WebRTCTransport\] ICE failed during negotiation\. Failing transfer\.'\);\n\s+this\.onError\(new Error\('Connection failed\. Check your network and try again\.'\)\);\n\s+this\._updateStatus\('FAILED'\);\n\s+return;\n\s+\}\n\s+// Single recovery entry point\n\s+this\._attemptRecovery\(\);\n\s+\}"

s_replacement = '''} else {
          console.warn('[WebRTCTransport] ICE failed during initial negotiation. Strict network detected (e.g. College WiFi). Forcing TCP/Relay Fallback!');
          this._forceRelayFallback = true;
          this._updateStatus('RECOVERING');
        }
        // Single recovery entry point
        this._attemptRecovery();
      }'''

s_content = re.sub(s_pattern, s_replacement, s_content, flags=re.DOTALL)

with open('src/lib/WebRTCTransport.js', 'w', encoding='utf-8') as f:
    f.write(s_content)

print("Applied strict network initial fallback fix.")
