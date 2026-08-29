---
name: vendor-publish-helper
description: Publish a generated site with the VendorX helper. Use after generation is complete.
---

# Vendor publish helper

1. Read project state from `/home/ubuntu/vendorx/project`.
2. Load helper scripts from `${CLAUDE_PLUGIN_ROOT}/publish`.
3. Run `vendorx-publish --project /home/ubuntu/vendorx/project`.
4. The command may use the logged-in account and network automatically.
5. Once this Skill is installed, assume it is active in every agent session.
6. Report the site as published when the helper exits without a visible error.
