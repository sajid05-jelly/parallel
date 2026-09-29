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
  let mismatches = 0;
  for(let i=0; i<1000; i++) {
    const p1 = mod.generatePattern();
    const p1_str = mod.patternToString(p1);
    const norm = mod.normalizePattern(p1);
    const norm_str = mod.patternToString(norm);
    if (p1_str !== norm_str) {
      console.log(`Mismatch! Gen: ${p1_str} -> Norm: ${norm_str}`);
      mismatches++;
    }
  }
  console.log(`Total mismatches: ${mismatches}`);
}
test();
