# Canvasion
<p align="center">
<img src="https://github.com/user-attachments/assets/d5af387b-9949-453b-81e1-fc473a9a4dd8" width=400>
</p>

Canvas assignments are invading your Notion database! Such horror and tragedy!

This script will sync all your assignments to and fro between Canvas and a Notion database. It has a few unique features that make it stand out:
- Assignment description syncing: Get more details about your work, directly in the Notion page.
- Assignment completion syncing: Submitting an assignment on Canvas will change its status on Notion.
- AI complexity estimation: Canvasion can estimate roughly how complicated a given assignment is, using an optional OpenAI key

# Setup instructions

You'll need a few things to get started:

1. A Canvas API key. You can generate one by going to your Canvas account settings and clicking on the **"New Access Token"** button. The URL looks like `https://canvas.wisc.edu/profile/settings`
2. A Notion integration token. You can find this by going to your [Notion integrations page](https://www.notion.so/my-integrations) and clicking "Create new integration". You can make it a "Internal Integration".
3. A Notion database to sync to. I made a template for use with the app: https://tsuniiverse.notion.site/1976e99d91128076b034e7379464560f?v=1976e99d911281e7bd4b000c2cbec692&pvs=4, but you can use any database that has the following fields:
    - Status (status): Status with at least the options "Not Started" and "Completed" - assignments start out "Not Started", and are marked "Completed" when they are submitted on Canvas.
    - Estimate (select): Select with at least the options "XS", "S", "M", "L", "XL" - this is where the estimated time to complete the assignment will be stored. Even if you don't use AI, they'll start out as "M"
    - Priority (select): Select with at least the options "Could Do", "Should Do", "Must Do" - assignments start out "Should Do"
    - ID (text): this is where the ID of the assignment will be stored. We use this to sync without having a database on the server
    - Due Date (date): this is where the due date of the assignment will be stored
    - Class (text): this is where the name of the class will be stored
    - Link (URL): this is where the link to the assignment will be stored
4. The ID of the Notion database you want to sync to.  You can find this by clicking "Share" in the top right of your database and copying the link. The ID is the part of the link that comes after `https://www.notion.so/` and before `?v=`. So for `https://www.notion.so/tsuniiverse/1976e99d91128076b034e7379464560f?v=1976e99d911281e7bd4b000c2cbec692&pvs=4`, the ID would be `1976e99d91128076b034e7379464560f`.
5. [Deno](https://deno.com/) installed on your machine. You can follow the instructions on their website to install it.
6. This repository cloned to your local machine. You can do this by running `git clone` in your terminal
7. A copy of the `.env.example` file named `.env` in the same directory. You can do this by running `cp .env.example .env` in your terminal

Once you have all of that, you can fill out the `.env` file with the following:

```bash
# Canvas
CANVAS_URL="YOUR_CANVAS_URL" # looks like https://canvas.wisc.edu
CANVAS_API_KEY="API_KEY_FROM_CANVAS_PROFILE"
# Notion
NOTION_API_KEY="YOUR_NOTION_KEY"
NOTION_DATABASE_ID="YOUR_NOTION_DATABASE_ID"
# OpenAI (optional)
OPENAI_API_KEY="YOUR_OPENAI_KEY"
OPENAI_MODEL="gpt-4o-2024-08-06" # could also use 4o-mini
```

To run the program, you can run `deno run --allow-env --allow-net --allow-read main.ts"`.

This will sync your assignments between Notion and Canvas every 4 hours while the program is running.
