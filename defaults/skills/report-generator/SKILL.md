---
name: report-generator
description: Generate a 5-10 page formatted report from a topic, notes, or requirements. Creates a print-ready A4 HTML document with title page, table of contents, numbered sections, and automatic preview. Use when the user says "write a report on X", "create a document about Y", "generate a whitepaper", or asks for a structured multi-page output.
metadata:
  author: AgentPrimer
  version: "2.0"
  level: Intermediate
  requires: open_preview tool, write_file tool, run_shell tool (curl)
---

# Report Generator

Generate a polished 5–10 page report from a user's request. The skill handles everything from structuring the content to producing a print-friendly A4 HTML document and opening it in the preview panel — all in one workflow.

## What This Skill Does

1. **Analyse the request** — determine report topic, audience, depth, and any specific sections requested
2. **Plan the structure** — outline a logical 5–10 page structure (title page, TOC, sections, references)
3. **Research** — optionally use web search to gather current information on the topic
4. **Generate the report** — write full prose content and build an A4-styled HTML document
5. **Bauhaus design** — bold sans-serif typography (Google Sans Flex), primary colour accents (red, blue, yellow), geometric decorative bar, clean modern layout
6. **Light/Dark theme toggle** — a toggle button at the top-right of the page (scrolls with content, not sticky) switches between light and dark mode, persisted via localStorage
7. **Smooth scroll** — TOC anchor links smoothly scroll to sections; `scroll-padding-top: 3rem` prevents headers from being clipped
8. **High contrast text** — no mid/dark grays in dark mode, no mid/light grays in light mode; all body text is crisp and readable
9. **SVG dual-theme support** — all standalone chart/diagram SVGs ship in light and dark variants, toggled via CSS classes `.svg-light`/`.svg-dark`
10. **Code block contrast** — `pre` and `code` use explicit dark text (`#1a1a1a`) on light backgrounds and light text (`#e0e0e0`) on dark backgrounds; no gray text inheritance
11. **Diagrams, flowcharts &amp; charts** — include visual elements whenever appropriate: timeline charts, bar charts, comparison tables with visual cues, flow diagrams, architecture diagrams, or any other SVG/CSS-based graphics that make data more engaging. Use inline SVG, CSS-drawn shapes, or HTML tables styled as charts. **For complex charts, save them as separate files** (`.svg`, `.html`) in the same folder as the report and link using `./filename`. Never produce a text-only report.
12. **External images** — search for relevant photographs, illustrations, or infographics, verify they load (HTTP 200 via curl), download them to the report folder, and link using `./filename`. **Never read image binary content** — it wastes tokens.
13. **Relative paths only** — all file references in the HTML (images, iframes, links to chart files, etc.) must use relative paths starting with `./`. Never use absolute root paths like `/images/` — you don't know where the system root points to.
14. **Preview automatically** — open the report in the preview panel so the user sees it immediately

## Instructions

### Step 1 — Analyse & Plan

First, clarify what the user wants. Ask if unclear, otherwise infer from context:

- **Topic**: what is the report about?
- **Purpose**: informative, persuasive, analytical, instructional?
- **Audience**: general public, executive, technical, academic?
- **Tone**: formal, neutral, professional?
- **Length**: 5–10 pages (default), confirm if user specifies otherwise

Create an outline with these standard sections (adapt as needed):

1. Title Page
2. Table of Contents
3. Executive Summary / Introduction
4. Background / Context
5. Main Body (2-4 numbered sections with subsections)
6. Conclusion / Recommendations
7. References / Further Reading

### Step 2 — Write the Content

Write full prose for each section. Guidelines:
- **5-10 pages** at ~300–400 words per page means **1,500-4,000 words** total
- Use clear section headers with numbered hierarchy (1, 1.1, 1.2, 2, …)
- Include concrete examples, data points, or case studies
- Vary paragraph length — mix short punchy paragraphs with longer analytical ones
- End each main section with a brief transition or summary sentence

### Step 3 — Gather Images & Build Chart/Diagram Files

Before building the HTML, prepare visual assets in the report folder:

**External Images (photos, illustrations, infographics):**
1. Search for relevant openly-available images using web search (look for Wikimedia Commons, Unsplash, or similar sources)
2. For each candidate URL, verify it returns HTTP 200:
   ```bash
   curl -sI "https://example.com/image.jpg" -o /dev/null -w "%{http_code}"
   ```
3. Only download if status is `200`:
   ```bash
   curl -sL "https://example.com/image.jpg" -o "./data/projects/reports/<slug>/image-filename.jpg"
   ```
4. **⚠️ NEVER read the downloaded image file** (`read_file` with base64/hex). It burns expensive tokens and is never needed — just reference it in the HTML via `./image-filename.jpg`.
5. Reference images in HTML using a wrapper with a capped height:
   ```html
   <div class="spotlight-img">
     <img src="./image-filename.jpg" alt="..." />
     <div class="img-cap">Caption text</div>
   </div>
   ```
   **Always limit image display height** — add this CSS in the report `<style>` block:
   ```css
   .spotlight-img { margin: 1.2rem 0; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
   .spotlight-img img { width: 100%; max-height: 400px; object-fit: contain; display: block; }
   .spotlight-img .img-cap { padding: 0.5rem 0.8rem; font-size: 0.8rem; color: #444; background: #f8f8f8; text-align: center; }
   ```
   This ensures all linked images render at a consistent height (max 400px) without distorting aspect ratio.

**Diagrams, Charts & Flowcharts:**
For any data or concept that benefits from visual explanation, build a dedicated chart/diagram file:

- **Bar/line/pie charts** → create a standalone HTML/SVG file with the chart, save to the report folder, and embed via `<iframe src="./chart-filename.html"></iframe>` or `<img src="./chart-filename.svg" />`
- **Flowcharts / architecture diagrams** → build with SVG or an HTML file using a lightweight JS library or pure CSS/SVG
- **Timelines** → vertical timeline HTML with CSS styling, saved as a separate file
- **Comparison tables with visual cues** → embed directly in the report HTML (inline)
- **Simple conceptual diagrams** → inline SVG directly in the report HTML is fine

Name chart files descriptively, e.g. `revenue-timeline.svg`, `architecture-flow.html`, `comparison-chart.svg`. Always link via `./filename`.

**SVG Text Contrast Rules (CRITICAL):**
SVG files are static — they cannot respond to the page's CSS dark mode. Follow these rules:

1. **Light mode text colors**: Use only dark fills — `#222`, `#333`, `#2c3e50`, `#1a1a1a`, or `#444` for secondary text. **Never** use `#555`, `#666`, `#888`, `#999` or lighter for any text that must be read.

2. **Dual-SVG dark mode support**: Generate two versions of every SVG chart:
   - `chart-filename.svg` — light background with dark text (as above)
   - `chart-filename-dark.svg` — dark background (`#2a2a40` or `#1a1a2e`) with light text (`#ddd`, `#e0e0e0`, `#bbb` for secondary)

3. **Embed with dual-theme container** — use the template's built-in SVG dual-theme pattern:
   ```html
   <div class="svg-chart-wrap">
     <img src="./chart-filename.svg" alt="..." class="svg-light">
     <img src="./chart-filename-dark.svg" alt="..." class="svg-dark">
     <div class="caption">Figure N: Chart title</div>
   </div>
   ```
   The CSS classes `.svg-light`/`.svg-dark` automatically show/hide based on the active theme.

4. **Inline SVGs**: If you put `<svg>` directly in the HTML, it inherits page CSS. Use `fill="currentColor"` or `var(--text-color)` so text responds to dark mode. Prefer external SVGs with the dual-theme pattern for complex charts.

### Step 4 — Build the HTML

Use the template at `./data/skills/report-generator/assets/template.html` as the base. The template uses `{{TITLE}}` and `{{{CONTENT}}}` as placeholders. Strictly use the font size setting of each type of tag in the template file, do not try to alter it.

Populate `{{TITLE}}` with the report title, and `{{{CONTENT}}}` with the full report body HTML:

```html
<!-- Title Page -->
<div class="title-page">
  <h1>Report Title</h1>
  <p class="subtitle">Subtitle or tagline</p>
  <div class="meta">
    <p>Prepared by: Author Name</p>
    <p>Date: Month DD, YYYY</p>
  </div>
</div>

<!-- Table of Contents -->
<div class="toc">
  <h1>Table of Contents</h1>
  <ul>
    <li class="toc-l1"><a href="#section-1">1. Section Title</a></li>
    <li class="toc-l2"><a href="#section-1-1">1.1 Subsection</a></li>
    ...
  </ul>
</div>

<!-- Sections -->
<h1 id="section-1">1. Section Title</h1>
<p>Content paragraphs...</p>
<h2 id="section-1-1">1.1 Subsection Title</h2>
<p>Content...</p>
...
```

**Styling rules:**
- Use heading levels: `<h1>` for top-level sections (page-break), `<h2>` for subsections (auto-numbered), `<h3>` for sub-subsections
- Wrap tables in `<table>` — always include `<thead>` and `<tbody>`
- Use `<blockquote>` for pull quotes or highlighted insights
- Use `<pre><code>` for any code snippets — ensure text color is explicit (`#1a1a1a` in light mode, `#e0e0e0` in dark mode); never let code text inherit a gray tone
- Add a `<div class="footer">Report Title — Page 1</div>` at the bottom of the main content
- Include `.spotlight-img` CSS rules (see Step 3) to cap linked image height at 400px
- For SVG charts, always use the **dual-theme pattern** (see Step 3) if the chart is a standalone file. If inline, use `fill="currentColor"` so text respects the theme.

### Step 5 — Save & Preview

1. Save all files to `./data/projects/reports/<slug>/`:
   - `report.html` — the main report (using `./data/skills/report-generator/assets/template.html`)
   - All downloaded images (e.g. `cover-photo.jpg`, `architecture-diagram.png`)
   - All chart/diagram files — **for each SVG chart, save both a light and dark variant** (e.g. `timeline-chart.svg` and `timeline-chart-dark.svg`)
   - Create slug from topic: lowercase, hyphens, alphanumeric only
   - Create directory if it doesn't exist
2. Call `open_preview` on `report.html` with a descriptive title
3. Optionally inform the user of the word count, page estimate, and number of visual assets included

### Step 6 — Offer revisions

After previewing, ask if the user wants changes:
- Add/remove sections
- Adjust tone or depth
- Change formatting
- Export to another format (PDF via browser print, Markdown, etc.)

## Examples

### Example 1 — Business Report

**User**: "Write a report on the impact of AI on software development"

**Output**: A 7-page report with:
- Title Page: "The Impact of Artificial Intelligence on Software Development"
- Sections: Executive Summary, Evolution of AI in Dev Tools, Current Landscape, Case Studies (GitHub Copilot, Cursor, etc.), Challenges & Risks, Future Outlook, References
- Auto-opened in preview panel

### Example 2 — Educational Report

**User**: "Create a report about climate change for high school students"

**Output**: A 6-page report with:
- Simplified language, glossary of terms, visual callout boxes
- Sections: What is Climate Change?, Causes, Effects, What Can We Do?, Key Takeaways
- Auto-opened in preview panel

## Edge Cases

- **Very broad topic** → ask the user to narrow it down, or pick 3–4 key angles
- **Very narrow topic** → expand with context, history, or future outlook to reach 5 pages
- **User provides their own notes/draft** → incorporate their material as the core, build structure around it
- **No template file found** → the template lives at `./data/skills/report-generator/assets/template.html`. If missing, embed the CSS directly (Bauhaus style with light/dark toggle, smooth scroll, proper contrast, SVG dual-theme support, and code block contrast).
- **Preview panel unavailable** → save the file and tell the user where it is so they can open it manually
- **Image URL inaccessible (non-200, timeout, blocked)** → skip that image gracefully. Rely on self-built charts/diagrams instead. Never fail the report because an image can't be downloaded.
- **curl unavailable on the system** → skip external images and focus on self-built charts/diagrams only
