# SAT Words to Focus — public website

Two parts:

- `site/` — the website itself (plain HTML, CSS and JavaScript). Host it free on GitHub Pages.
- `relay/worker.js` — a tiny Cloudflare Worker that passes each visitor's request to NVIDIA. It's needed because NVIDIA's API refuses requests sent straight from a web page. It never stores or logs anyone's key.

Setup takes about 15 minutes. You need a free GitHub account and a free Cloudflare account.

---

## 1. Put the site on GitHub Pages

1. Sign in at github.com and create a new **public** repository, for example `sat-words`.
2. Click **Add file → Upload files** and (already done: the site files are in the root of this repository). Commit.
3. Go to **Settings → Pages**. Under *Build and deployment*, set Source to **Deploy from a branch**, Branch **main**, folder **/ (root)**. Save.
4. After a minute your site is live at `https://YOUR-GITHUB-NAME.github.io/sat-words/`. Note the part before the first `/` after `https://`, for example `https://YOUR-GITHUB-NAME.github.io`. That's your site's *origin*, which you need in step 2.

## 2. Deploy the relay on Cloudflare

1. Sign in at dash.cloudflare.com and open **Workers & Pages → Create → Create Worker**. Name it `sat-words-relay`, then **Deploy**.
2. Click **Edit code**, delete the sample code, paste the whole contents of `relay/worker.js`, and click **Deploy**.
3. Open the Worker's **Settings → Variables and Secrets → Add**:
   - Name: `ALLOWED_ORIGINS`
   - Value: your site's origin from step 1.4, for example `https://YOUR-GITHUB-NAME.github.io` (no trailing slash, no path)
   Save and deploy.
4. Copy the Worker's address shown at the top, for example `https://sat-words-relay.YOUR-NAME.workers.dev`.

## 3. Connect the two

1. In your GitHub repository, open `config.js`, click the pencil to edit, and paste the Worker address:
   ```js
   RELAY_URL: "https://sat-words-relay.YOUR-NAME.workers.dev",
   ```
   Commit. The site updates within a minute.

## 4. Try it

1. Open your site. Choose **Start from the SAT Words to Focus list** or **Start with an empty list**.
   - Your own link: add `#mine` to the end (`…/sat-words/#mine`). It always starts from your full list without asking.
2. Open **Settings**, paste an NVIDIA key from build.nvidia.com, and click **Save key**.
3. Click **Add a word**, type a word, and press Enter.

---

## How the key is protected

- The key is typed into a password field and stays in the visitor's own browser. By default it lasts only until the tab closes; **Remember on this device** keeps it on that computer. **Forget key** removes it.
- The page's security policy only allows it to send data to your `*.workers.dev` relay, and only scripts from your own site can run. This blocks other websites and injected scripts from sending the key anywhere else.
- The relay only accepts requests from your site's address and only forwards to NVIDIA's chat endpoint for the Nemotron model. It doesn't save or log the key.
- Each visitor's key is used only for their own requests and billed to their own NVIDIA account.

No browser-side setup is perfectly secure. Anyone who can use the visitor's unlocked computer could find a remembered key. That's why remembering is off by default.

## Word lists

- Each visitor's words are saved in their own browser. Nobody else sees them, and clearing browser data deletes them.
- **Settings → Download my list** saves a backup file. **Load a list file** brings it back, for example on another computer.
- To update the starting list everyone gets, download your list and upload it to the repository as `words.json`, replacing the old file.

## Note on content

The definitions, examples and notes in `words.json` are original text. The Word Smart headwords and pronunciation respellings come from the book. On a public site, consider whether you're comfortable publishing those, or replace them with your own.
