#!/usr/bin/env python3
"""Validate split Flutter release APKs; optionally restore missing Flutter AOT libraries.

Some AGP/Flutter combinations package libflutter.so without the generated app.so.
A signed APK without lib/<abi>/libapp.so fails on startup. The --repair mode
repackages the AOT artifact produced by this very build, aligns and resigns it.
No signing passwords or keystores are ever copied into the output APKs.
"""
import argparse
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

ABIS = ('armeabi-v7a', 'arm64-v8a', 'x86_64')
ROOT = Path(__file__).resolve().parent.parent
DEFAULT_APKS = ROOT / 'build/app/outputs/flutter-apk'


def env_file() -> dict[str, str]:
    result = {}
    for line in (ROOT / '.env').read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in ('"', "'"):
            v = v[1:-1]
        result[k.strip()] = v
    for key in ('KEYSTORE_PASSWORD', 'KEY_PASSWORD', 'KEY_ALIAS'):
        if not result.get(key):
            raise RuntimeError(f'Missing {key} in .env')
    if not (ROOT / 'release.jks').is_file():
        raise RuntimeError('Missing release.jks')
    return result


def signing_env(props: dict[str, str]) -> dict[str, str]:
    return {**os.environ,
            '_SK_KEYSTORE_PASSWORD': props['KEYSTORE_PASSWORD'],
            '_SK_KEY_PASSWORD': props['KEY_PASSWORD']}


def run(cmd: list[str], *, env: dict[str, str] | None = None) -> str:
    result = subprocess.run(cmd, check=False, env=env, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f'{cmd[0]} failed ({result.returncode}): {result.stderr[-1000:]}')
    return result.stdout


def fingerprint(props: dict[str, str]) -> str:
    result = run(['keytool', '-list', '-v', '-keystore', str(ROOT / 'release.jks'),
                  '-alias', props['KEY_ALIAS'], '-storepass:env', '_SK_KEYSTORE_PASSWORD'],
                 env=signing_env(props))
    match = re.search(r'SHA256:\s*([0-9a-fA-F:]{95})', result)
    if not match:
        raise RuntimeError('Cannot read release certificate SHA-256')
    return match.group(1).replace(':', '').lower()


def apk_metadata(apk: Path, abi: str) -> bool:
    with zipfile.ZipFile(apk) as z:
        corrupt = z.testzip()
        if corrupt:
            raise RuntimeError(f'Corrupt APK {apk.name}: {corrupt}')
        libraries = [name for name in z.namelist() if name.startswith('lib/') and name.endswith('.so')]
        if not any(name == f'lib/{abi}/libflutter.so' for name in libraries):
            raise RuntimeError(f'Missing libflutter.so in {apk.name}')
        if any(name.split('/')[1] != abi for name in libraries):
            raise RuntimeError(f'Multiple or wrong native ABIs in {apk.name}')
        return f'lib/{abi}/libapp.so' in libraries


def locate_aot(abi: str) -> Path:
    options = list((ROOT / '.dart_tool/flutter_build').glob(f'*/{abi}/app.so'))
    if not options:
        raise RuntimeError(f'Flutter AOT app.so not found for {abi}; cannot repair APK')
    path = max(options, key=lambda p: p.stat().st_mtime_ns)
    if path.read_bytes()[:4] != b'\x7fELF':
        raise RuntimeError(f'Invalid AOT binary for {abi}')
    return path


def repair(apk: Path, abi: str, props: dict[str, str], build_tools: Path) -> None:
    aot = locate_aot(abi)
    temp_parent = Path('/dev/shm') if Path('/dev/shm').is_dir() else None
    with tempfile.TemporaryDirectory(prefix='json-notebook-apk-', dir=temp_parent) as d:
        unsigned = Path(d) / 'unsigned.apk'
        aligned = Path(d) / 'aligned.apk'
        signed = Path(d) / 'signed.apk'
        with zipfile.ZipFile(apk) as original, zipfile.ZipFile(unsigned, 'w') as fixed:
            for entry in original.infolist():
                if entry.filename.startswith('META-INF/') and (
                        entry.filename.endswith('.RSA') or entry.filename.endswith('.SF')):
                    continue
                fixed.writestr(entry, original.read(entry.filename))
            info = zipfile.ZipInfo(f'lib/{abi}/libapp.so')
            info.compress_type = zipfile.ZIP_STORED
            info.external_attr = 0o644 << 16
            fixed.writestr(info, aot.read_bytes())
        run([str(build_tools / 'zipalign'), '-P', '16', '-f', '4',
             str(unsigned), str(aligned)])
        run([str(build_tools / 'apksigner'), 'sign', '--ks', str(ROOT / 'release.jks'),
             '--ks-key-alias', props['KEY_ALIAS'],
             '--ks-pass', 'env:_SK_KEYSTORE_PASSWORD',
             '--key-pass', 'env:_SK_KEY_PASSWORD',
             '--out', str(signed), str(aligned)], env=signing_env(props))
        run([str(build_tools / 'zipalign'), '-P', '16', '-c', '4', str(signed)])
        # Stage the validated, resigned file on the same filesystem before replacing.
        destination_tmp = apk.with_suffix('.repaired.tmp')
        try:
            shutil.copyfile(signed, destination_tmp)
            os.replace(destination_tmp, apk)
        finally:
            destination_tmp.unlink(missing_ok=True)
    print(f'Repaired missing Flutter AOT library in {apk.name} ({aot.stat().st_size} bytes)')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repair', action='store_true', help='restore missing AOT and re-sign')
    parser.add_argument('--apk-dir', type=Path, default=DEFAULT_APKS)
    args = parser.parse_args()
    props = env_file()
    tools_dir = Path(os.getenv('ANDROID_HOME', '/opt/android-sdk')) / 'build-tools'
    versions = sorted((p for p in tools_dir.iterdir() if p.is_dir()), reverse=True)
    if not versions:
        raise RuntimeError('Android build-tools not found')
    build_tools = versions[0]
    expected = fingerprint(props)
    checks = []
    for abi in ABIS:
        apk = args.apk_dir / f'app-{abi}-release.apk'
        if not apk.is_file():
            raise RuntimeError(f'APK missing: {apk}')
        if not apk_metadata(apk, abi):
            if not args.repair:
                raise RuntimeError(f'FATAL: {apk.name} is missing lib/{abi}/libapp.so; app would crash at startup')
            repair(apk, abi, props, build_tools)
        # Validate once more after any repair, including signing certificate.
        assert apk_metadata(apk, abi)
        run([str(build_tools / 'zipalign'), '-P', '16', '-c', '4', str(apk)])
        output = run([str(build_tools / 'apksigner'), 'verify', '--verbose',
                      '--print-certs', str(apk)])
        signer = re.search(r'certificate SHA-256 digest:\s*([0-9a-fA-F]{64})', output)
        if not signer or signer.group(1).lower() != expected:
            raise RuntimeError(f'Release signing certificate mismatch: {apk.name}')
        if 'Verified using v2 scheme (APK Signature Scheme v2): true' not in output:
            raise RuntimeError(f'APK signature v2 missing: {apk.name}')
        digest = hashlib.sha256(apk.read_bytes()).hexdigest()
        checks.append(f'{digest}  {apk.name}')
        print(f'PASS {apk.name}: ABI={abi}, libapp.so present, APK signature verified, '
              f'SHA-256={digest}')
    checksum_file = args.apk_dir / 'SHA256SUMS.txt'
    checksum_file.write_text('\n'.join(checks) + '\n')
    print(f'OK: 3 APKs validated; SHA256SUMS.txt generated')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'ERROR: {error}', file=sys.stderr)
        sys.exit(1)
