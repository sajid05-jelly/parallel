const crypto = require('crypto');
global.window = {
  crypto: {
    getRandomValues: (arr) => crypto.randomFillSync(arr),
    subtle: {
      digest: async (algo, data) => crypto.createHash('sha256').update(data).digest()
    }
  }
};

async function test() {
  const mod = await import('./src/lib/patternUtils.js');
  
  const testCases = [
    [0,1,2,5,8],
    [0,4,8],
    [0,1,4,7,8],
    [0,8], // should normalize to 0,4,8
  ];
  
  for(const p of testCases) {
    const norm = mod.normalizePattern(p);
    const hash = await mod.hashPattern(norm);
    console.log(`Input: ${JSON.stringify(p)}`);
    console.log(`Norm:  ${JSON.stringify(norm)}`);
    console.log(`Str:   ${mod.patternToString(norm)}`);
    console.log(`Hash:  ${hash}\n`);
  }
}
test();
