import re

with open('src/lib/WebRTCTransport.js', 'r', encoding='utf-8') as f:
    c = f.read()

pattern = r"console\.warn\(\[WebRTCTransport\].*?Forcing TCP/TLS Relay Fallback\.\);"
replacement = "console.warn('[WebRTCTransport] TRUE AVERAGE STALL DETECTED! Avg speed: ' + trueAverageSpeed + '/s. Forcing TCP/TLS Relay Fallback.');"

c = re.sub(pattern, replacement, c)

with open('src/lib/WebRTCTransport.js', 'w', encoding='utf-8') as f:
    f.write(c)

