from pathlib import Path

p = Path('scripts/.v09x_stress_patch.py')
text = p.read_text()
start_marker = 'old = """  return `# CMI evaluation'
end_marker = '\n\n\n# JSON Schema parity.'
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('formatting recovery markers not found')
replacement = r'''# Formatting is patched by stable line fragments rather than matching the whole template literal.
format_record_anchor = "- Protocol: ${record.protocol.kind}\\n- Repository class:"
if format_record_anchor not in t:
    raise SystemExit('evaluation format protocol line missing')
t = t.replace(
    format_record_anchor,
    "- Protocol: ${record.protocol.kind}\\n- Stress: ${record.stress.scenario || 'n/a'} · ${record.stress.outcome} (${record.stress.passedInvariantCount}/${record.stress.expectedInvariantCount} invariants passed)\\n- Repository class:",
    1,
)
format_report_anchor = "Repository classes: ${Object.keys(external.repositoryClasses).length} · task kinds: ${Object.keys(external.taskKinds).length}\\nReviewed observational external records:"
if format_report_anchor not in t:
    raise SystemExit('evaluation report task-kind line missing')
t = t.replace(
    format_report_anchor,
    "Repository classes: ${Object.keys(external.repositoryClasses).length} · observational task kinds: ${Object.keys(external.observationalTaskKinds).length}\\nControlled stress: ${report.controlledStress.records} records · ${Object.keys(report.controlledStress.scenarios).length} scenarios · record pass rate ${report.controlledStress.passRate ?? 'n/a'} · invariant pass rate ${report.controlledStress.invariantPassRate ?? 'n/a'}\\nReviewed observational external records:",
    1,
)
p.write_text(t)'''
p.write_text(text[:start] + replacement + text[end:])
