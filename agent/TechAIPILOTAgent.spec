from pathlib import Path


PROJECT_ROOT = Path.cwd() / "agent"
SRC_DIR = PROJECT_ROOT / "src"


a = Analysis(
    [str(SRC_DIR / "techpilot_agent" / "main.py")],
    pathex=[str(SRC_DIR)],
    binaries=[],
    datas=[],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="TechAIPILOTAgent",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
)