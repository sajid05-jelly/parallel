import re

with open('src/lib/WebRTCTransport.js', 'r', encoding='utf-8') as f:
    c = f.read()

pattern1 = r"this\.peerConnection\.onicecandidate = async \(event\) => \{\n\s+if \(event\.candidate && this\.signaling\) \{"
replacement1 = '''this.peerConnection.onicecandidate = async (event) => {
        if (event.candidate && this.signaling) {
          // Drop host candidates in anywhere mode to prevent throttled IPv6 connections
          if (this.mode === 'anywhere' && event.candidate.candidate.includes('typ host')) {
            return;
          }'''
c = re.sub(pattern1, replacement1, c)

with open('src/lib/WebRTCTransport.js', 'w', encoding='utf-8') as f:
    f.write(c)

with open('src/lib/WebRTCReceiverTransport.js', 'r', encoding='utf-8') as f:
    c2 = f.read()

pattern2 = r"this\.peerConnection\.onicecandidate = \(event\) => \{\n\s+if \(event\.candidate && this\.signaling\) \{"
replacement2 = '''this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.signaling) {
          // In anywhere mode, we don't want host candidates
          if (event.candidate.candidate.includes('typ host') && (!this.mode || this.mode === 'anywhere')) {
             return;
          }'''
c2 = re.sub(pattern2, replacement2, c2)

with open('src/lib/WebRTCReceiverTransport.js', 'w', encoding='utf-8') as f:
    f.write(c2)

print("Applied ICE candidate filtering.")
