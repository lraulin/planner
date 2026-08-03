# Achieve Planner reference pack

Authoritative **source material for how Effexis Achieve Planner worked and was meant to
be used**. Agents and humans should consult these when implementing or debating fidelity
to the original — especially before inventing behavior or deliberately diverging.

This is a personal research archive for a reimplementation. It is not an official Effexis
distribution.

## Documents

| File                                                     | What it is                                                    | Use when…                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [`user-manual.md`](./user-manual.md)                     | Official Achieve Planner user manual (PDF → MD)               | Field meanings, tutorials, tab/wizard behavior                                                      |
| [`workflow-and-training.md`](./workflow-and-training.md) | Training center + product tour + GTD setup (from effexis.com) | **Creator intent** — weekly planning, project blocks, Task Chooser, structured vs unstructured work |
| [`online-help.md`](./online-help.md)                     | Consolidated HTML online help                                 | Scoring formulas, scheduling, options, menus, form details                                          |
| [`faq.md`](./faq.md)                                     | Product FAQ from the site                                     | Edge cases and intended defaults                                                                    |
| [`file-formats.md`](./file-formats.md)                   | Our reverse-engineering of AP data formats / import           | XML/ACX import-export, schema mapping                                                               |
| [`release-log.txt`](./release-log.txt)                   | Achieve release notes (vendor log)                            | When a feature appeared or changed historically                                                     |

## Reading order (for agents)

1. **Workflow first** — `workflow-and-training.md` (especially structured vs unstructured,
   weekly planning / project blocks, Task Chooser).
2. **Manual** — `user-manual.md` for the feature under discussion.
3. **Online help** — `online-help.md` when you need precise settings, scoring, or menu
   commands.
4. **FAQ / release log** — only if the above is silent.
5. **File formats** — only for import/export work.

## How this repo treats Achieve fidelity

- Default: match Achieve’s **workflow and semantics** (not Win32 chrome).
- If the app intentionally differs, the active feature spec should say so explicitly.
- Prefer these docs + existing frozen specs over guessing from screenshots alone.

## Provenance

- User manual: converted from the installer PDF.
- Workflow + online help + FAQ: text scraped once from `http://www.effexis.com/` (2026-08-03);
  videos and binaries omitted. The live site is a customer archive and may disappear.
- File formats: reverse-engineered from real `.ach` / XML samples and the Wine install.
