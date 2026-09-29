const INTERMEDIATES = {
  '0,2': 1,
  '2,0': 1,
  '0,6': 3,
  '6,0': 3,
  '2,8': 5,
  '8,2': 5,
  '6,8': 7,
  '8,6': 7,
  '0,8': 4,
  '8,0': 4,
  '2,6': 4,
  '6,2': 4,
  '3,5': 4,
  '5,3': 4,
  '1,7': 4,
  '7,1': 4
};

export function normalizePattern(pattern) {
  if (!pattern || !Array.isArray(pattern) || pattern.length === 0) return [];
  const normalized = [pattern[0]];
  const visited = new Set([pattern[0]]);

  for (let i = 1; i < pattern.length; i++) {
    const current = pattern[i];
    const prev = normalized[normalized.length - 1];
    
    const intermediate = INTERMEDIATES[`${prev},${current}`];
    
    if (intermediate !== undefined && !visited.has(intermediate)) {
      normalized.push(intermediate);
      visited.add(intermediate);
    }
    
    if (!visited.has(current)) {
      normalized.push(current);
      visited.add(current);
    }
  }
  
  return normalized;
}

export function generatePattern() {
  const getRand = (max) => {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return array[0] % max;
  };
  
  const targetLength = 4 + getRand(4); // 4, 5, 6, 7
  const pattern = [];
  const visited = new Set();
  
  while (pattern.length < targetLength) {
    const nextNode = getRand(9);
    
    if (!visited.has(nextNode)) {
      if (pattern.length > 0) {
        const prevNode = pattern[pattern.length - 1];
        const intermediate = INTERMEDIATES[`${prevNode},${nextNode}`];
        if (intermediate !== undefined && !visited.has(intermediate)) {
          pattern.push(intermediate);
          visited.add(intermediate);
        }
      }
      
      if (!visited.has(nextNode)) {
        pattern.push(nextNode);
        visited.add(nextNode);
      }
    }
  }
  
  return pattern;
}

export function patternToString(pattern) {
  if (!pattern || !Array.isArray(pattern)) return '';
  return pattern.join('-');
}

export function stringToPattern(str) {
  if (!str || typeof str !== 'string') return [];
  return str.split('-').map(Number);
}

export async function hashPattern(pattern) {
  const str = patternToString(pattern);
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

export function validatePattern(pattern) {
  if (!Array.isArray(pattern)) return false;
  if (pattern.length < 4 || pattern.length > 9) return false;
  
  const uniqueNodes = new Set(pattern);
  if (uniqueNodes.size !== pattern.length) return false;
  
  for (const node of pattern) {
    if (typeof node !== 'number' || node < 0 || node > 8 || !Number.isInteger(node)) {
      return false;
    }
  }
  
  return true;
}
