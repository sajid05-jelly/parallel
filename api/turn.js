export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Use standard server-side env vars instead of VITE_ prefixed client vars
  const turnUrl = process.env.TURN_URL || process.env.VITE_TURN_URL;
  const turnUsername = process.env.TURN_USERNAME || process.env.VITE_TURN_USERNAME;
  const turnCredential = process.env.TURN_CREDENTIAL || process.env.VITE_TURN_CREDENTIAL;

  if (!turnUrl || !turnUsername || !turnCredential) {
    return res.status(200).json({ servers: [] });
  }

  const rawUrls = turnUrl.split(',').map(u => u.trim()).filter(Boolean);
  const sortedUrls = rawUrls.sort((a, b) => {
    const aIsUdp = !a.includes('transport=tcp') && !a.startsWith('turns:');
    const bIsUdp = !b.includes('transport=tcp') && !b.startsWith('turns:');
    if (aIsUdp && !bIsUdp) return -1;
    if (!aIsUdp && bIsUdp) return 1;
    return 0;
  });

  return res.status(200).json({
    servers: [
      {
        urls: sortedUrls.length === 1 ? sortedUrls[0] : sortedUrls,
        username: turnUsername,
        credential: turnCredential
      }
    ]
  });
}
