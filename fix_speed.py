import re

with open('src/config/constants.js', 'r', encoding='utf-8') as f:
    c = f.read()

c = re.sub(r"export const HIGH_WATER_MARK = .*?;", "export const HIGH_WATER_MARK = 4 * 1024 * 1024; // 4 MB", c)
c = re.sub(r"export const LOW_WATER_MARK = .*?;", "export const LOW_WATER_MARK = 1 * 1024 * 1024; // 1 MB", c)

with open('src/config/constants.js', 'w', encoding='utf-8') as f:
    f.write(c)

with open('src/lib/WebRTCTransport.js', 'r', encoding='utf-8') as f:
    t = f.read()

t = re.sub(r"const MAX_IN_FLIGHT = 2 \* 1024 \* 1024;", "const MAX_IN_FLIGHT = 8 * 1024 * 1024;", t)
t = re.sub(r"rollingSpeed > 1000 && rollingSpeed < 200 \* 1024", "rollingSpeed > 1000 && rollingSpeed < 1000 * 1024", t)

with open('src/lib/WebRTCTransport.js', 'w', encoding='utf-8') as f:
    f.write(t)

print("Applied ultimate speed fix.")
