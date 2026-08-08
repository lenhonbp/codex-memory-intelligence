from pathlib import Path
import json

ROOT = Path('.')

def read(path):
    return (ROOT / path).read_text()

def write(path, text):
    (ROOT / path).write_text(text if text.endswith('\n') else text + '\n')

def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one anchor, found {count}: {old!r}')
    write(path, text.replace(old, new, 1))

package_path = ROOT / 'package.json'
package = json.loads(package_path.read_text())
if package.get('version') != '0.8.1':
    raise SystemExit(f"Expected package version 0.8.1 before release prep, got {package.get('version')}")
package['version'] = '0.9.0'
package_path.write_text(json.dumps(package, indent=2, ensure_ascii=False) + '\n')

replace_once('src/version.js', "export const VERSION = '0.8.1';", "export const VERSION = '0.9.0';")
replace_once(
    'CHANGELOG.md',
    '## [Unreleased]\n\n### Added\n',
    '## [Unreleased]\n\nNo unreleased changes yet.\n\n## [0.9.0] - 2026-08-08\n\n### Added\n',
)
replace_once(
    'README.md',
    '`v0.8.1` is the current published release line. It hardens the v0.8 intelligence layer with complete-vs-truncated graph health, stale-impact fail-closed behavior, project-local durable-storage guards, owner-tagged lease locking, broader best-effort secret detection, and a strict separation between source-fingerprint refresh and semantic review. The current development line adds v0.9 Evidence Integrity: unified evidence health, Git-history continuity guardrails, and runtime/schema contract parity. The npm badge above remains the authoritative indicator of the version currently published to the registry.',
    '`v0.9.0` is the current source release line for **Evidence Integrity**. It adds unified evidence health, Git-history continuity guardrails for change/session attribution, runtime durable-contract validation, and CI-enforced schema/runtime parity on top of the v0.8 trust hardening, Behavioral Change Intelligence, and Session Continuation layers. The npm badge above remains the authoritative indicator of the version currently published to the registry.',
)

print('CMI v0.9.0 release metadata prepared')
