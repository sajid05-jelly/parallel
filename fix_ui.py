import re

with open('src/components/TransferProgress.jsx', 'r', encoding='utf-8') as f:
    c = f.read()

pattern = r"</GlassCard>\s*</div>"

replacement = '''</GlassCard>

      {progress?.diagnostics && (
        <div className="mt-4 p-4 rounded-xl border border-[#5BA5A5]/30 bg-black/40 text-xs font-mono text-[#F3F4F6] space-y-1">
          <div className="font-bold text-[#5BA5A5] mb-2 uppercase tracking-widest">[UNIVERSAL DIAGNOSTICS]</div>
          <div className="flex justify-between"><span>PATH:</span> <span className="text-amber-400">{progress.diagnostics.path}</span></div>
          <div className="flex justify-between"><span>TRANSPORT:</span> <span className="text-amber-400">{progress.diagnostics.transport}</span></div>
          <div className="flex justify-between"><span>LOCAL:</span> <span>{progress.diagnostics.localType}</span></div>
          <div className="flex justify-between"><span>REMOTE:</span> <span>{progress.diagnostics.remoteType}</span></div>
          <div className="flex justify-between"><span>CHUNK SIZE:</span> <span>{progress.diagnostics.chunkSize} B</span></div>
          <div className="flex justify-between"><span>BUFFERED AMT:</span> <span className={progress.diagnostics.bufferedAmount > 524288 ? 'text-red-400' : ''}>{progress.diagnostics.bufferedAmount} B</span></div>
          <div className="flex justify-between"><span>ACK WINDOW:</span> <span>{progress.diagnostics.ackWindow} B</span></div>
          <div className="flex justify-between"><span>REAL THROUGHPUT:</span> <span className="text-[#5BA5A5]">{progress.diagnostics.actualThroughput}</span></div>
        </div>
      )}
    </div>'''

if "</GlassCard>" in c:
    c = re.sub(pattern, replacement, c)
    with open('src/components/TransferProgress.jsx', 'w', encoding='utf-8') as f:
        f.write(c)
    print("Successfully updated TransferProgress.jsx")
else:
    print("Could not find insertion point")
