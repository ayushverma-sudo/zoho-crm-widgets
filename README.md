# Zoho CRM Widgets Workspace

This workspace lets you manage multiple widgets inside a single project so you do not have to duplicate folders for every new idea.

## Project layout

- `apps/<widget-id>/` – self-contained widget sources (HTML, JS, translations, assets).
- `shared/` – optional shared helpers that every widget can import.
- `scripts/` – utility scripts for scaffolding (`new-widget`) and packaging (`build`).
- `dist/` – output zips per widget after running the build script.
- `plugin-manifest.json` – declares every widget (URL, scope, placement) that Zoho CRM should load.

## email-template-sender widget

The current Zoho CRM button/widget (the form sender and response viewer) lives in `apps/email-template-sender/`.

### Local development

```bash
npm install          # one time
npm run dev          # serves https://127.0.0.1:5000/
```

Open `https://127.0.0.1:5000/apps/email-template-sender/widget.html` (accept the browser certificate warning once). Inside Zoho CRM (sandbox), point your custom button/tab to the same local URL while developing.

- The UI markup, CSS, and logic live entirely in `apps/email-template-sender/widget.html`.
- The widget uses the EmbeddedApp SDK v1.4, so a sandbox Lead list “info” button will pass the selected lead ID through `ZOHO.embeddedApp.on("PageLoad")`.

### Creator microservice integration

The widget calls the published Creator microservice `https://www.zohoapis.ca/creator/custom/lbelectric572/Fetch_Records` to load every response for the active lead.

- API key header: `public-key: 6BfBtAJKpX2byv2P`
- Query parameter: `lead_id`, wrapped in quotes. The widget queries by Lead Id first; if no rows are returned, it fetches the CRM lead record to retry by email.
- Returned payload: the microservice should respond with `{ code: 3000, result: { responses: [...] } }`. Each response object can include `number_series`, `response_date`, `response_url`, `status`, etc. Whatever fields you return are rendered in the table.

To rotate the key or change the endpoint, edit the constants near the top of `widget.html`:

```js
const CREATOR_ENDPOINT = "https://...";
const CREATOR_PUBLIC_KEY = "....";
```

### Sending templates from CRM

The widget still loads CRM email templates via `ZOHO.CRM.API.getAllRecords({ Entity: "settings/email_templates" })` and calls the existing CRM function `emailsendfunction` to send the selected template. If you rename or relocate that function, update the function name in `widget.html`.

### Packaging & deployment

1. Run `npm run build`. The script zips every widget declared in `plugin-manifest.json` into `dist/<widget-id>.zip`. For this widget the artifact is `dist/email-template-sender.zip`.
2. Upload the zip through Zoho CRM’s Extension/WI build pipeline (or via `zet pack` if you migrate back to the legacy layout).
3. After uploading, approve the extension and add the widget/button to the desired Lead layout or list.

### Creating or cloning widgets

Use the scaffold script to spin up a new widget sharing the same toolchain:

```bash
npm run new-widget -- --name follow-up-notes --title "Follow Up Notes"
```

- A new folder under `apps/` is created with starter HTML/JS.
- The script automatically adds the widget entry to `plugin-manifest.json`. Update the manifest (scopes, location, URL) as required.
- Implement your UI inside the generated folder, then rebuild (`npm run build`) to get its zip in `dist/`.

## Running locally

```bash
npm install
npm run dev
```

Open `https://127.0.0.1:5000/` (accept the browser warning once) and pick the widget you want to test. Inside Zoho CRM, point your custom button/tab URL to the same HTTPS endpoint (for example `https://127.0.0.1:5000/apps/email-template-sender/widget.html`).

## Adding a widget

```bash
npm run new-widget -- --name follow-up-notes --title "Follow Up Notes"
```

The script scaffolds `apps/follow-up-notes/` and appends the widget to `plugin-manifest.json`. Update the placement, scopes or default HTML as needed.

## Packaging

```bash
npm run build
```

Each widget is bundled into `dist/<widget-id>.zip`, keeping the legacy `app/` structure so it remains compatible with existing upload workflows. Upload the desired zip to Zoho, or wrap them further depending on your deployment process.

For partial builds in CI you can also call:

```bash
node scripts/build.js          # same as npm run build
```

> Note: `zet pack` expects the old single-widget `app/` directory. Because this workspace contains multiple widgets under `apps/`, use `npm run build` instead.
