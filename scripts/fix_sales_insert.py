import re
import sys

script_path = "/opt/crm/crm/scripts/reimport-vmset.mjs"
with open(script_path, "r") as f:
    content = f.read()

# Pattern to match the unsafe string interpolation INSERT blocks
# There are two occurrences in the script (main loop + final batch)
old_pattern = r"""const values = salesBatch\.map\(s =>\s*`\('\$\{s\.sourceFile\.replace\(/'/g,"''"\)\}',\$\{s\.sourceRow\},'\$\{s\.sourceKey\.replace\(/'/g,"''"\)\}','\$\{s\.data\.replace\(/'/g,"''"\)\}'\)`\s*\)\.join\(","\);\s*await pgClient\.query\(\s*`INSERT INTO "ImportedSale" \("sourceFile","sourceRow","sourceKey","data"\) VALUES \$\{values\} ON CONFLICT DO NOTHING`\s*\);"""

new_code = """// Use parameterized inserts to avoid SQL injection and silent failures from special chars
      const placeholders = [];
      const params = [];
      for (let i = 0; i < salesBatch.length; i++) {
        const s = salesBatch[i];
        const base = i * 4 + 1;
        placeholders.push(`($${base},$${base+1},$${base+2},$${base+3})`);
        params.push(s.sourceFile, s.sourceRow, s.sourceKey, s.data);
      }
      await pgClient.query(
        `INSERT INTO "ImportedSale" ("sourceFile","sourceRow","sourceKey","data") VALUES ${placeholders.join(",")} ON CONFLICT DO NOTHING`,
        params
      );"""

count = len(re.findall(old_pattern, content))
print(f"Found {count} occurrences of unsafe INSERT pattern")

if count > 0:
    content = re.sub(old_pattern, new_code, content)
    with open(script_path, "w") as f:
        f.write(content)
    print("Script updated successfully")
else:
    print("Pattern not found - showing current insert logic:")
    lines = content.split("\n")
    for i, line in enumerate(lines):
        if "INSERT INTO" in line and "ImportedSale" in line:
            start = max(0, i-5)
            end = min(len(lines), i+3)
            for j in range(start, end):
                print(f"  {j}: {lines[j]}")
            print("---")