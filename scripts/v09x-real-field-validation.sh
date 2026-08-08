#!/usr/bin/env bash
set -euo pipefail

CMI_ROOT="${CMI_ROOT:-$GITHUB_WORKSPACE}"
CANDIDATE="3eb6e42848c98e1982c4fdd9cb821495834fcd31"
OUT="${OUT:-$RUNNER_TEMP/v09x-field-v3}"
mkdir -p "$OUT/records"

clone_repo() {
  local name="$1" url="$2" depth="${3:-1}"
  local target="$RUNNER_TEMP/$name"
  rm -rf "$target"
  git clone --depth "$depth" "$url" "$target" >/dev/null 2>&1
  printf '%s' "$target"
}

cmi() {
  local root="$1"; shift
  (cd "$root" && node "$CMI_ROOT/src/cli-entry.js" "$@")
}

capture() {
  local root="$1" name="$2"; shift 2
  cmi "$root" evaluate capture "$@" --json > "$OUT/records/$name.json"
}

assert_json() {
  local file="$1" expression="$2" message="$3"
  node - "$file" "$expression" "$message" <<'NODE'
const fs=require('fs');
const data=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const expression=process.argv[3];
const message=process.argv[4];
const ok=Function('x', `return Boolean(${expression})`)(data);
if (!ok) { console.error(JSON.stringify(data,null,2)); throw new Error(message); }
NODE
}

# ---------- Observational task diversity ----------
EXPRESS=$(clone_repo v09x-obs-express https://github.com/expressjs/express.git)
cmi "$EXPRESS" scan --json > "$OUT/obs-express-scan.json"
cmi "$EXPRESS" boundaries --json > "$OUT/obs-express-boundaries.json"
cmi "$EXPRESS" prepare "review middleware routing boundaries" --json > "$OUT/obs-express-prepare.json"
cmi "$EXPRESS" session start "review middleware routing boundaries" --json > "$OUT/obs-express-session.json"
cmi "$EXPRESS" session close latest --outcome investigated --accomplished "Reviewed bounded architecture and change-risk evidence." --json > "$OUT/obs-express-close.json"
capture "$EXPRESS" obs-review --source-kind external-real --protocol observational --repository-class library --task-kind review
rm -rf "$EXPRESS/.codex-memory"
test -z "$(git -C "$EXPRESS" status --porcelain)"

CLICK=$(clone_repo v09x-obs-click https://github.com/pallets/click.git)
cmi "$CLICK" scan --json > "$OUT/obs-click-scan.json"
cmi "$CLICK" context "command parsing architecture" --json > "$OUT/obs-click-context.json"
cmi "$CLICK" session start "research command parsing architecture" --json > "$OUT/obs-click-session.json"
cmi "$CLICK" session close latest --outcome investigated --accomplished "Researched bounded project context without editing product files." --json > "$OUT/obs-click-close.json"
capture "$CLICK" obs-research --source-kind external-real --protocol observational --repository-class cli-tool --task-kind research
rm -rf "$CLICK/.codex-memory"
test -z "$(git -C "$CLICK" status --porcelain)"

COBRA=$(clone_repo v09x-obs-cobra https://github.com/spf13/cobra.git 10)
cmi "$COBRA" scan --json > "$OUT/obs-cobra-scan.json"
cmi "$COBRA" status --json > "$OUT/obs-cobra-status.json"
cmi "$COBRA" doctor --json > "$OUT/obs-cobra-doctor.json"
cmi "$COBRA" session start "verify repository intelligence health" --json > "$OUT/obs-cobra-session.json"
cmi "$COBRA" session close latest --outcome investigated --accomplished "Verified current CMI repository-health evidence." --json > "$OUT/obs-cobra-close.json"
capture "$COBRA" obs-verification --source-kind external-real --protocol observational --repository-class library --task-kind verification
rm -rf "$COBRA/.codex-memory"
test -z "$(git -C "$COBRA" status --porcelain)"

# ---------- Controlled stress: rename-after-scan ----------
RENAME=$(clone_repo v09x-stress-rename https://github.com/expressjs/express.git)
cmi "$RENAME" scan --json > "$OUT/rename-scan.json"
OLD=$(git -C "$RENAME" ls-files '*.js' | head -n 1)
test -n "$OLD"
DIR=$(dirname "$OLD"); BASE=$(basename "$OLD" .js); NEW="$DIR/${BASE}.cmi-renamed.js"
git -C "$RENAME" mv "$OLD" "$NEW"
cmi "$RENAME" status --json > "$OUT/rename-status.json"
assert_json "$OUT/rename-status.json" "x.graphHealth.current===false && x.evidenceHealth.state==='blocked'" "rename did not block stale graph evidence"
cmi "$RENAME" impact "$OLD" --json > "$OUT/rename-impact.json"
assert_json "$OUT/rename-impact.json" "x.blocked===true && x.found===false && x.graphHealth.current===false && x.recommendedAction?.command==='cmi scan'" "rename impact did not fail closed structurally"
cmi "$RENAME" scan --json > "$OUT/rename-rescan.json"
cmi "$RENAME" status --json > "$OUT/rename-refreshed.json"
assert_json "$OUT/rename-refreshed.json" "x.graphHealth.current===true" "rename rescan did not restore current graph"
capture "$RENAME" stress-rename --source-kind external-real --protocol controlled-stress --repository-class library --task-kind verification --session none --stress-scenario rename-after-scan --stress-expected 3 --stress-passed 3 --stress-failed 0
git -C "$RENAME" reset --hard HEAD >/dev/null
rm -rf "$RENAME/.codex-memory"
test -z "$(git -C "$RENAME" status --porcelain)"

# ---------- Controlled stress: dirty worktree ----------
DIRTY=$(clone_repo v09x-stress-dirty https://github.com/pallets/click.git)
cmi "$DIRTY" scan --json > "$OUT/dirty-scan.json"
DIRTY_FILE=$(git -C "$DIRTY" ls-files '*.py' | head -n 1)
test -n "$DIRTY_FILE"
printf '\n# cmi controlled dirty-worktree stress\n' >> "$DIRTY/$DIRTY_FILE"
cmi "$DIRTY" session start "inspect dirty worktree attribution" --json > "$OUT/dirty-session.json"
cmi "$DIRTY" session status latest --json > "$OUT/dirty-assess.json"
assert_json "$OUT/dirty-assess.json" "x.findings.some(i=>i.category==='preexisting-worktree')" "preexisting-worktree finding missing"
assert_json "$OUT/dirty-assess.json" "x.guardrails.some(i=>i.id==='do-not-overattribute-dirty-worktree')" "dirty-worktree guardrail missing"
cmi "$DIRTY" session close latest --outcome investigated --json > "$OUT/dirty-close.json"
capture "$DIRTY" stress-dirty --source-kind external-real --protocol controlled-stress --repository-class cli-tool --task-kind verification --stress-scenario dirty-worktree --stress-expected 2 --stress-passed 2 --stress-failed 0
git -C "$DIRTY" reset --hard HEAD >/dev/null
rm -rf "$DIRTY/.codex-memory"
test -z "$(git -C "$DIRTY" status --porcelain)"

# ---------- Controlled stress: rewritten Git history ----------
REWRITE=$(clone_repo v09x-stress-rewrite https://github.com/spf13/cobra.git 20)
git -C "$REWRITE" config user.email 'cmi-field@example.invalid'
git -C "$REWRITE" config user.name 'CMI Field Validation'
REWRITE_BASE=$(git -C "$REWRITE" rev-parse HEAD)
printf 'package cobra\n\nconst cmiOldLine = 1\n' > "$REWRITE/cmi_stress_old.go"
git -C "$REWRITE" add cmi_stress_old.go
git -C "$REWRITE" commit -m 'cmi stress old line' >/dev/null
cmi "$REWRITE" scan --json > "$OUT/rewrite-scan.json"
cmi "$REWRITE" session start "inspect history rewrite attribution" --json > "$OUT/rewrite-session.json"
git -C "$REWRITE" reset --hard "$REWRITE_BASE" >/dev/null
printf 'package cobra\n\nconst cmiNewLine = 1\n' > "$REWRITE/cmi_stress_new.go"
git -C "$REWRITE" add cmi_stress_new.go
git -C "$REWRITE" commit -m 'cmi stress new line' >/dev/null
cmi "$REWRITE" session status latest --json > "$OUT/rewrite-assess.json"
assert_json "$OUT/rewrite-assess.json" "x.scope.gitContinuity.state==='rewritten'" "history rewrite continuity was not detected"
assert_json "$OUT/rewrite-assess.json" "Array.isArray(x.scope.committedPaths) && x.scope.committedPaths.length===0" "rewritten commit paths were attributed"
assert_json "$OUT/rewrite-assess.json" "x.findings.some(i=>i.category==='git-history-rewrite')" "history rewrite finding missing"
assert_json "$OUT/rewrite-assess.json" "x.guardrails.some(i=>i.id==='do-not-overattribute-rewritten-history')" "history rewrite guardrail missing"
cmi "$REWRITE" session close latest --outcome investigated --json > "$OUT/rewrite-close.json"
capture "$REWRITE" stress-rewrite --source-kind external-real --protocol controlled-stress --repository-class library --task-kind verification --stress-scenario history-rewrite --stress-expected 4 --stress-passed 4 --stress-failed 0
rm -rf "$REWRITE/.codex-memory"

# ---------- Controlled stress: filesystem clock skew ----------
CLOCK=$(clone_repo v09x-stress-clock https://github.com/pallets/click.git)
cmi "$CLOCK" scan --json > "$OUT/clock-scan.json"
CLOCK_FILE=$(git -C "$CLOCK" ls-files '*.py' | head -n 1)
test -n "$CLOCK_FILE"
python3 - "$CLOCK/$CLOCK_FILE" <<'PY'
import os,sys,time
future=time.time()+86400*365
os.utime(sys.argv[1],(future,future))
PY
test -z "$(git -C "$CLOCK" status --porcelain)"
cmi "$CLOCK" status --json > "$OUT/clock-status.json"
assert_json "$OUT/clock-status.json" "x.graphHealth.current===false && x.evidenceHealth.state==='blocked'" "clock skew did not block metadata-stale graph evidence"
cmi "$CLOCK" impact "$CLOCK_FILE" --json > "$OUT/clock-impact.json"
assert_json "$OUT/clock-impact.json" "x.blocked===true && x.found===false && x.graphHealth.current===false && x.recommendedAction?.command==='cmi scan'" "clock-skew impact did not fail closed structurally"
cmi "$CLOCK" scan --json > "$OUT/clock-rescan.json"
cmi "$CLOCK" status --json > "$OUT/clock-refreshed.json"
assert_json "$OUT/clock-refreshed.json" "x.graphHealth.current===true" "clock-skew rescan did not restore current graph"
capture "$CLOCK" stress-clock --source-kind external-real --protocol controlled-stress --repository-class cli-tool --task-kind verification --session none --stress-scenario clock-skew --stress-expected 4 --stress-passed 4 --stress-failed 0
rm -rf "$CLOCK/.codex-memory"
test -z "$(git -C "$CLOCK" status --porcelain)"

# ---------- Controlled stress: large public monorepo ----------
LARGE=$(clone_repo v09x-stress-large https://github.com/pnpm/pnpm.git)
timeout 180 bash -c "cd '$LARGE' && node '$CMI_ROOT/src/cli-entry.js' scan --json" > "$OUT/large-scan.json"
cmi "$LARGE" status --json > "$OUT/large-status.json"
assert_json "$OUT/large-status.json" "(x.workspaces?.count||0)>=2" "large monorepo did not expose multiple workspaces"
assert_json "$OUT/large-status.json" "x.graphHealth?.available===true && x.graphHealth.current===true" "large monorepo graph was not current immediately after scan"
assert_json "$OUT/large-status.json" "x.graphHealth.truncated ? (x.healthy===false && x.evidenceHealth.state==='degraded') : ['healthy','degraded'].includes(x.evidenceHealth.state)" "large monorepo health did not represent graph completeness honestly"
assert_json "$OUT/large-scan.json" "Number.isFinite(x.durationMs) && x.durationMs>0" "large monorepo scan duration missing"
capture "$LARGE" stress-large --source-kind external-real --protocol controlled-stress --repository-class monorepo --task-kind verification --session none --stress-scenario large-monorepo --stress-expected 4 --stress-passed 4 --stress-failed 0
rm -rf "$LARGE/.codex-memory"
test -z "$(git -C "$LARGE" status --porcelain)"

# ---------- Aggregate anonymized exact-candidate evidence ----------
node --input-type=module - "$OUT" "$CANDIDATE" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import { buildEvaluationReport, validateEvaluationRecord } from './src/evaluation.js';
const out=process.argv[2], candidate=process.argv[3];
const recordsDir=path.join(out,'records');
const names=fs.readdirSync(recordsDir).filter((name)=>name.endsWith('.json')).sort();
if (names.length!==8) throw new Error(`expected 8 records, got ${names.length}`);
const corpusRoot=path.join(out,'corpus');
const corpusDir=path.join(corpusRoot,'.codex-memory','evaluations');
fs.mkdirSync(corpusDir,{recursive:true});
const fingerprints=new Set();
const forbidden=/expressjs|pallets|spf13|pnpm\/pnpm|github\.com|\/home\/runner|middleware routing boundaries|command parsing architecture|repository intelligence health/i;
for (const name of names) {
  const text=fs.readFileSync(path.join(recordsDir,name),'utf8');
  if (forbidden.test(text)) throw new Error(`${name}: retained identity leak`);
  const record=JSON.parse(text);
  if (!validateEvaluationRecord(record)) throw new Error(`${name}: invalid runtime evaluation record`);
  if (record.subject.version!=='0.9.0' || record.subject.sourceRevision!==candidate) throw new Error(`${name}: wrong CMI subject provenance`);
  if (record.source.kind!=='external-real' || record.source.independent!==true) throw new Error(`${name}: wrong external-real classification`);
  if (record.review.outcome!=='unreviewed' || record.review.provenance!=='unreviewed') throw new Error(`${name}: usefulness was asserted without review`);
  fingerprints.add(record.repository.fingerprint);
  fs.copyFileSync(path.join(recordsDir,name),path.join(corpusDir,`${record.id}.json`));
}
const report=await buildEvaluationReport(corpusRoot);
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
if (report.corpus.externalReal.observationalRecords!==3) throw new Error('expected 3 observational records');
if (report.coverage.state!=='external-multi-repository-multi-context') throw new Error(`unexpected coverage ${report.coverage.state}`);
if (!report.coverage.hasMultipleExternalTaskKinds) throw new Error('multi-task observational coverage missing');
if (Object.keys(report.corpus.externalReal.observationalTaskKinds).length!==3) throw new Error('expected 3 observational task kinds');
if (report.controlledStress.records!==5 || Object.keys(report.controlledStress.scenarios).length!==5) throw new Error('expected 5 controlled-stress scenarios');
if (report.controlledStress.passRate!==1 || report.controlledStress.invariantPassRate!==1) throw new Error('controlled-stress pass rates are not 1.0');
if (report.controlledStress.expectedInvariantCount!==17 || report.controlledStress.passedInvariantCount!==17 || report.controlledStress.failedInvariantCount!==0) throw new Error('controlled-stress invariant aggregate mismatch');
if (report.reviewedUsefulness.reviewedExternalRecords!==0) throw new Error('unreviewed evidence became usefulness evidence');
if (fingerprints.size<4) throw new Error(`expected >=4 repository fingerprints, got ${fingerprints.size}`);
NODE
