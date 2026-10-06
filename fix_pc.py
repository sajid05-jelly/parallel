import re

with open('src/lib/WebRTCTransport.js', 'r', encoding='utf-8') as f:
    c = f.read()

pattern = r"const selectedServers = this\.mode === 'nearby' \? NEARBY_ICE_SERVERS : ICE_SERVERS;\n\s+console\.log\(\[WebRTCTransport\] Initializing RTCPeerConnection for mode \[\$\{this\.mode\}\]\);\n\s+this\.peerConnection = new RTCPeerConnection\(\{ iceServers: selectedServers \}\);"

replacement = '''let selectedServers = this.mode === 'nearby' ? NEARBY_ICE_SERVERS : ICE_SERVERS;

    // IF IN THROTTLE-BYPASS RELAY MODE, WE STRIP UDP RELAYS AND FORCE TCP/TLS TO SHATTER CARRIER UDP THROTTLING!
    if (this._forceRelayFallback) {
      selectedServers = selectedServers.map(server => {
        if (!server.urls) return server;
        const urlsArray = Array.isArray(server.urls) ? server.urls : [server.urls];
        const tcpUrls = urlsArray.filter(u => u.includes('transport=tcp') || u.startsWith('turns:'));
        return { ...server, urls: tcpUrls.length > 0 ? tcpUrls : urlsArray };
      });
    }

    const config = { 
      iceServers: selectedServers,
      iceTransportPolicy: this._forceRelayFallback ? 'relay' : 'all'
    };

    console.log([WebRTCTransport] Initializing RTCPeerConnection for mode [], RelayFallback: []);
    this.peerConnection = new RTCPeerConnection(config);'''

c = re.sub(pattern, replacement, c)

with open('src/lib/WebRTCTransport.js', 'w', encoding='utf-8') as f:
    f.write(c)

print("Applied setupPeerConnection fix.")
