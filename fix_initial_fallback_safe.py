with open('src/lib/WebRTCTransport.js', 'r', encoding='utf-8') as f:
    s_content = f.read()

s_old = '''        } else {
          console.warn('[WebRTCTransport] ICE failed during negotiation. Failing transfer.');
          this.onError(new Error('Connection failed. Check your network and try again.'));
          this._updateStatus('FAILED');
          return;
        }'''

s_new = '''        } else {
          console.warn('[WebRTCTransport] ICE failed during initial negotiation. Strict network detected (e.g. College WiFi). Forcing TCP/Relay Fallback!');
          this._forceRelayFallback = true;
          this._updateStatus('RECOVERING');
        }'''

if s_old in s_content:
    s_content = s_content.replace(s_old, s_new)
    with open('src/lib/WebRTCTransport.js', 'w', encoding='utf-8') as f:
        f.write(s_content)
    print("Sender fixed.")
else:
    print("Could not find exact text in WebRTCTransport.js")

with open('src/lib/WebRTCReceiverTransport.js', 'r', encoding='utf-8') as f:
    r_content = f.read()

r_old = '''          } else {
            console.warn('[ReceiverTransport] ICE failed during negotiation. Failing transfer.');
            this.onError(new Error('Connection failed. Sender may have closed the portal or network is unreachable.'));
            this._updateStatus('FAILED');
          }'''

r_new = '''          } else {
            console.warn('[ReceiverTransport] ICE failed during initial negotiation. Strict network detected (e.g. College WiFi). Waiting for Sender to force TCP/Relay Fallback.');
            this._updateStatus('RECOVERING');
            this._recoveryStartTime = Date.now();
            this._startRecoveryWatchdog();
          }'''

if r_old in r_content:
    r_content = r_content.replace(r_old, r_new)
    with open('src/lib/WebRTCReceiverTransport.js', 'w', encoding='utf-8') as f:
        f.write(r_content)
    print("Receiver fixed.")
else:
    print("Could not find exact text in WebRTCReceiverTransport.js")

