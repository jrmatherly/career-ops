# Migrating from Reactive Resume

For anyone who kept a resume and a job tracker in [Reactive Resume](https://rxresu.me) and wants both in career-ops. Three steps move the data, one step checks it. Each command previews first and writes nothing until you add `--confirm`.

Run every command from your data root (`~/career-ops-data` for a plugin install, the checkout for a repository install; see [SETUP.md](SETUP.md)). Finish onboarding first so `config/profile.yml` exists.

## 1. Export from Reactive Resume

Two exports, both from the Reactive Resume web app:

- **Each resume as JSON.** Open the resume, choose Export, pick JSON. One file per resume you want to bring over.
- **The account as a zip.** Account settings, "Export everything". The zip holds your applications, timeline notes, interviews, contacts and follow-ups.

The CSV export of applications works too, but it carries no timeline notes and no follow-ups, so prefer the zip.

## 2. Import the resume

`cv.md` is the canonical CV in career-ops. The import writes it and a derived `data/resume.json` that the structured editor on the dashboard's CV page reads.

```bash
node resume.mjs import my-resume.json --format rr
```

The preview prints each section it will write and anything in the export it cannot place. Read it, then write:

```bash
node resume.mjs import my-resume.json --format rr --confirm
```

If a `cv.md` already exists, add `--replace-cv`. The old file is kept as `cv.md.bak`. Import never merges two CVs, so bring one resume and tailor from it afterwards.

Then confirm the round trip and the ATS checks:

```bash
node resume.mjs absorb --json
```

```bash
node resume.mjs check
```

`absorb` reports `lossless: true` when `cv.md` and `data/resume.json` agree. `check` scores your CV against the 23 Reactive Resume Check rules and two career-ops bullet rules and prints the score and its findings; it is advisory. The weak-opening bullet rule applies to English resumes only.

## 3. Import the applications

```bash
node import-tracker.mjs --rr-zip reactive-resume-export.zip
```

The preview lists every application against your existing tracker rows: `import` for a new row, `tracked` for one already there, and the mapping of each Reactive Resume status to a career-ops state. Applications you only saved in Reactive Resume go to the pipeline inbox, not the tracker. When the preview reads right:

```bash
node import-tracker.mjs --rr-zip reactive-resume-export.zip --confirm
```

Timeline notes, interviews, contacts and follow-ups land in their sidecar files beside `data/applications.md` (the layout is in [DATA_CONTRACT.md](../DATA_CONTRACT.md)).

## 4. Move the data root (self-hosting only)

Skip this if career-ops stays on your machine. To run the dashboard on a server or cluster, copy the data root as [DEPLOYMENT.md](DEPLOYMENT.md#moving-the-data-root-off-a-mac) describes and point the pod at it with `CAREER_OPS_ROOT`. Stop the machine you copied from writing the same tracker.

## 5. Check it worked

Open the dashboard (`npm run ui`, or your deployed URL) and walk the pages the imports feed:

- **CV** (`/cv`) shows the imported CV. Its Edit tab holds the structured editor with its Check score.
- **Board** (`/board`) shows the imported applications in their columns, and **Pipeline** holds the saved ones.
- **Download the CV as a PDF** from **CV** → **Export** → **Download PDF**. The browser saves the imported master CV as a PDF.
- **Generate a tailored PDF** from a report. The file appears under `output/` in the data root (`/data/output` in a pod).
- **Publish a share** from `/shares` and open its link from a phone off your network. The page renders and the view counter moves.
- **Plugin install:** run `/career-ops:career-ops` in Claude Code. The command menu lists the modes.

If a step fails, `node doctor.mjs` names the missing piece.

## Afterwards

`cv.md` is the source of truth from here. Retire any script that used to regenerate it from Reactive Resume, and edit the CV in `cv.md` or on the dashboard's CV page; `node resume.mjs absorb` keeps `data/resume.json` in step. Exports back out (`node resume.mjs export docx|rr-json|json-resume`) are in [SCRIPTS.md](SCRIPTS.md).
