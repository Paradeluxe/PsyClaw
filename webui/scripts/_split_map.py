# one-shot analysis helper
from pathlib import Path
root = Path(__file__).resolve().parents[1] / "frontend"
text = (root / "app.js").read_text(encoding="utf-8").splitlines()
for i in range(3620, min(3757, len(text))):
    if any(k in text[i] for k in ("lastSystem", "systemCheck", "runSystem", "paintGate")):
        print(i + 1, text[i][:120])
print("--- builder fns ---")
b = (root / "builder.js").read_text(encoding="utf-8").splitlines()
print("builder lines", len(b))
for i, l in enumerate(b):
    s = l.strip()
    if s.startswith("function ") and any(
        k in s
        for k in (
            "render",
            "wire",
            "setHost",
            "default",
            "boot",
            "mount",
            "updateDisplay",
            "rebuild",
            "ensure",
            "getDesign",
            "setDesign",
        )
    ):
        print(f"{i+1:5d}", s[:100])
