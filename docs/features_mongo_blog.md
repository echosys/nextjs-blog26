# MongoDB Blog — Feature Reference

## Overview

The `/mongo` route provides a blog management interface backed by MongoDB (or a local JSON file in development). All CRUD operations go through `/api/blogs`.

## Content Editor

- Content is edited in a WYSIWYG `contenteditable` div (`ContentEditor` component in `src/components/ContentEditor.tsx`).
- Content is stored and retrieved as **raw HTML**.
- List previews strip HTML tags to show plain-text excerpts.
- The post preview modal renders HTML via `dangerouslySetInnerHTML`. Before render, `<script>` tags and `on*` event attributes are stripped to prevent XSS from user-authored content.

## Inline Image Paste

- Paste an image (from clipboard or drag-and-drop) into the editor.
- The image is compressed using `canvas.toBlob` to a maximum of `inlineImageMaxSizeMB` MB (configured in `config/config.json`, default **3 MB**).
- A loading spinner is shown in the editor corner during compression.
- The compressed image is inserted as an `<img>` element at the cursor position — visible immediately in the editor.
- Images are embedded as **base64 data URLs** directly in the `content` HTML string.
- Images persist through edit sessions because they are part of the saved `content` field — no separate state required.

## File Attachments

- One manual file attachment per post (separate from inline editor images).
- Uploaded as base64 on form submit.
- Attachment is stored alongside the post document in MongoDB.
- Shown as a download link in the post list and preview modal.

## API Limits

- Next.js pages router body parser raised to **4.5 MB** (matching Vercel's API request limit).
- This accommodates inline images embedded in the content field alongside other post fields.
- MongoDB document size limit (16 MB BSON) is a secondary ceiling; the 4.5 MB Vercel limit is the practical constraint.

## Layout

- Create Post and Edit Post pages use a two-column layout: narrow left sidebar (title, tags, attachment, submit) and full-height right panel (ContentEditor).
- Responsive: columns stack on mobile (`lg:grid-cols-[320px_minmax(0,1fr)]`).

## Tab Navigation

- `src/app/mongo/loading.tsx` renders a skeleton immediately when the route loads, eliminating blank states.
- `ActiveNavLink` calls `router.prefetch()` so the other tab's data is pre-warmed.

## Local Development

- In local mode (`config/config.json` → `local.mongoBlogStorage: "json"`), data persists to `config/localBlogData_mongo.json`.
- All features work identically in local mode.
