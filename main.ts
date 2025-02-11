import { Client, isFullPage } from "npm:@notionhq/client"
import TurndownService from "npm:turndown";
import Bottleneck from "npm:bottleneck";
import { markdownToBlocks } from "npm:@tryfabric/martian";
import { OpenAIConfig, systemPrompt } from "./const.ts";
import type { PlannerItem, CanvasAssignment, NotionAssignment, NotionRichText, PlannerOverride } from "./main.d.ts";

const ONE_DAY = 8.64e7;
const DAYS_TO_FETCH = 16;
const REFRESH_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
const turndown = new TurndownService();
const canvasRateLimit = new Bottleneck({
  maxConcurrent: 1,
  minTime: 333
});
const notionRateLimit = new Bottleneck({
  maxConcurrent: 1,
  minTime: 333
});
const openaiRateLimit = new Bottleneck({
  maxConcurrent: 1,
  minTime: 333
});

export interface UserConfig {
  canvasURL: string;
  canvasAPIKey: string;
  notionAPIKey: string;
  notionDatabaseID: string;
  openAIAPIKey: string;
  openAIModel: string;
}

export class SyncManager {
  private users: Map<string, UserConfig> = new Map();
  private intervalId?: number;

  addUser(userId: string, config: UserConfig): void {
    this.users.set(userId, config);
  }

  removeUser(userId: string): void {
    this.users.delete(userId);
  }

  async start(): Promise<void> {
    // Initial sync for all users
    await this.syncAll();
    
    // Start refresh loop
    this.intervalId = setInterval(async () => {
      await this.syncAll();
    }, REFRESH_INTERVAL);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  private async syncAll(): Promise<void> {
    const syncPromises = Array.from(this.users.entries()).map(async ([userId, config]) => {
      try {
        await runApp(
          config.canvasURL,
          config.canvasAPIKey,
          config.notionAPIKey,
          config.notionDatabaseID,
          config.openAIAPIKey,
          config.openAIModel
        );
        console.log(`Successfully synced user ${userId}`);
      } catch (error) {
        console.error(`Failed to sync user ${userId}:`, error);
      }
    });

    await Promise.all(syncPromises);
  }
}

/**
 * Process a due date to determine if it should be truncated.
 * If the time is X:59:59 or X:59:00 (typical midnight assignments),
 * returns just the date portion. Otherwise, returns the full ISO string
 * to preserve the specific time.
 * @param isoDate An ISO date string (e.g. "2025-02-13T05:59:59Z")
 * @returns ISO date string, either date-only or with time based on the rules
 */
export function processDueDate(isoDate: string): string {
  if (!isoDate) return "";
  
  // Parse the date, which handles various ISO formats
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return "";
  
  // Extract hours, minutes, seconds
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  // If time is X:59:59 or X:59:00 (typical midnight assignments)
  // return just the date portion in YYYY-MM-DD format
  // Timezones are tricky here: if our "midnight assignment" is due at 0:59:00 or later, we want to return the day before
  if (minutes === 59 && (seconds === 59 || seconds === 0)) {
    const shouldReturnYesterday = hours < 12;
    const yesterday = new Date(date.getTime() - ONE_DAY);
    return shouldReturnYesterday ? yesterday.toISOString().split('T')[0] : date.toISOString().split('T')[0];
  }
  
  // For specific times, return in a consistent format: YYYY-MM-DDTHH:mm:ssZ
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function getCanvasUserID(canvasURL: string, canvasAPIKey: string): Promise<number> {
  return canvasRateLimit.schedule(() => fetch(canvasURL + "/api/v1/users/self", { headers: { Authorization: `Bearer ${canvasAPIKey}` } })
    .then(res => {
      if (!res.ok) {
        throw new Error("Failed to fetch Canvas user ID");
      }
      return res.json()
    })
    .then(res => res.id)
    .catch(err => { throw new Error(err) }));
}

export function getCanvasPlanner(canvasURL: string, canvasAPIKey: string): Promise<PlannerItem[]> {
  const query = new URLSearchParams({
    start_date: new Date(Date.now() - 8.64e7).toISOString(),
    end_date: new Date(Date.now() + DAYS_TO_FETCH * ONE_DAY).toISOString(),
    per_page: "75"
  });
  return fetch(canvasURL + "/api/v1/planner/items?" + query.toString(), { headers: { Authorization: `Bearer ${canvasAPIKey}` } })
    .then(res => {
      if (!res.ok) {
        throw new Error("Failed to fetch Canvas planner");
      }
      return res.json()
    })
    .catch(err => { throw new Error(err) });
}

export function getCanvasAssignmentDetails(canvasURL: string, canvasAPIKey: string, planner: PlannerItem): Promise<CanvasAssignment> {
  return canvasRateLimit.schedule(() => fetch(canvasURL + "/api/v1" + planner.html_url, { headers: { Authorization: `Bearer ${canvasAPIKey}` } })
    .then(res => {
      if (!res.ok) {
        throw new Error("Failed to fetch Canvas assignment details: " + res.statusText);
      }
      return res.json()
    })
    .catch(err => { throw new Error(err) }));
}

export function flattenNotionProperties(page: { properties: { [key: string]: { type: string, [key: string]: unknown } }, [key: string]: unknown }): NotionAssignment {
  const notionRichTextToString = (richText: NotionRichText): string => {
    return richText.map(item => item.plain_text).join("");
  }
  const properties = page.properties;
  const flattened: Record<string, unknown> = {};
  for (const key in properties) {
    const property = properties[key];
    const normalized = key.toLowerCase().replace(/ /g, "_");
    const type = property.type;
    const value = type === "rich_text" ?
      notionRichTextToString(property[type] as NotionRichText) :
      property[type];

    flattened["property_" + normalized] = value;
  }
  return { ...page, ...flattened } as unknown as NotionAssignment;
}

export function getNotionDatabase(notionClient: Client, notionDatabaseID: string): Promise<NotionAssignment[]> {
  const notionQuery = (start_cursor?: string) => notionClient.databases.query({
    database_id: notionDatabaseID,
    filter: {
      property: "Last edited time",
      date: {
        after: new Date(Date.now() - DAYS_TO_FETCH * ONE_DAY).toISOString()
      }
    },
    page_size: 100,
    start_cursor: start_cursor ?? undefined
  });
  return notionRateLimit.schedule(() => notionQuery().then(async (res) => {
    const results = res.results;
    let response = res;
    while (response.has_more) {
      response = await notionQuery(response.next_cursor ?? undefined);
      results.push(...res.results);
    }
    return results.filter(e => isFullPage(e)).map(flattenNotionProperties);
  }));

}

/**
 * Compare two arrays of objects by a key. Items from a and b are paired together when the values of their chosen keys match.
 * @param a The first array of objects
 * @param b The second array of objects
 * @param keyA The key to compare in the first array
 * @param keyB The key to compare in the second array. Must point to the same type as keyA
 */
export function mergeByKey<U, T>(a: U[], b: T[], keyA: keyof U, keyB: keyof T): { both: [U, T][], onlyA: U[], onlyB: T[] } {
  const aKeys: ({ key: U[keyof U]; item: U; } | null)[] = a.map(item => ({ key: item[keyA], item }));
  const bKeys: ({ key: T[keyof T]; item: T; } | null)[] = b.map(item => ({ key: item[keyB], item }));
  const both = [];
  for (let i = 0; i < aKeys.length; i++) {
    const aItem = aKeys[i]!;
    const bIndex = bKeys.findIndex(bItem => bItem && bItem.key == (aItem.key as unknown));
    if (bIndex !== -1) {
      both.push([aItem.item, bKeys[bIndex]!.item] as [U, T]);
      bKeys[bIndex] = null;
      aKeys[i] = null;
    }
  }
  return {
    both,
    onlyA: aKeys.filter(e => e).map(e => e!.item),
    onlyB: bKeys.filter(e => e).map(e => e!.item)
  };
}

export function GetOpenAIEstimate(openAIAPIKey: string, openAIModel: string, planner: PlannerItem, assignment: CanvasAssignment): Promise<"" | "XS" | "S" | "M" | "L" | "XL"> {
  const assignment_title = assignment.title;
  const course_name = planner.context_name;
  const description = assignment.description || assignment.message;
  const markdown = turndown.turndown(description).slice(0, 3000);
  if (!openAIAPIKey || !openAIModel) {
    console.warn("OpenAI API key or model not set");
    return Promise.resolve("");
  }
  return openaiRateLimit.schedule(() => fetch("https://api.openai.com/v1/chat/completions", {
    body: JSON.stringify({
      ...OpenAIConfig,
      "messages": [
        {
          "role": "system",
          "content": systemPrompt
        },
        {
          "role": "user",
          "content": `# ${assignment_title}\n## Course\n${course_name}\n## Description\n${markdown}`
        }
      ]
    })
  }).then(res => {
    if (!res.ok) {
      throw new Error("Failed to categorize assignment");
    }
    return res.json();
  }).then(res => {
    return JSON.parse(res.choices[0].message.content).estimate;
  }).catch(err => { throw new Error(err) }));
}

export function addAssignmentToNotion(notionClient: Client, notionDatabaseID: string, planner: PlannerItem, assignment: CanvasAssignment, estimate?: "" | "XS" | "S" | "M" | "L" | "XL") {
  const description = assignment.description || assignment.message || "";
  const plannableDue = planner.plannable.due_at || planner.plannable.todo_date || assignment.due_at || "";
  const markdown = turndown.turndown(description).slice(0, 3000);
  return notionRateLimit.schedule(() => notionClient.pages.create({
    "parent": {
      "type": "database_id",
      "database_id": notionDatabaseID
    },
    "properties": {
      "Name": {
        title: [
          {
            text: {
              content: assignment.title || planner.plannable.title
            }
          }
        ]
      },
      "ID": {
        rich_text: [
          {
            text: {
              content: planner.plannable_id.toString()
            }
          }
        ]
      },
      "Due Date": {
        date: {
          start: processDueDate(plannableDue)
        }
      },
      "Status": {
        status: {
          name: "Not Started"
        }
      },
      "Class": {
        rich_text: [
          {
            text: {
              content: planner.context_name.replace(/:.*/, "")
            }
          }
        ]
      },
      "Link": {
        url: assignment.html_url
      },
      "Estimate": {
        select: {
          name: estimate || "M"
        }
      },
      "Priority": {
        select: {
          name: "Should Do"
        }
      },
    },
    // @ts-expect-error The Notion API is not typed properly in this case
    "children": markdownToBlocks(markdown)
  }));
}

async function runApp(canvasURL: string,
  canvasAPIKey: string,
  notionAPIKey: string,
  notionDatabaseID: string,
  openAIAPIKey: string,
  openAIModel: string) {
  const notionClient = new Client({
    auth: notionAPIKey
  })
  const canvasUserID = await getCanvasUserID(canvasURL, canvasAPIKey);
  const canvasPlanner = await getCanvasPlanner(canvasURL, canvasAPIKey);
  const notionDatabase = await getNotionDatabase(notionClient, notionDatabaseID);
  const { both, onlyA: onlyCanvas } = mergeByKey(canvasPlanner, notionDatabase, "plannable_id", "property_id");
  // Add new assignments to Notion
  const assignments = onlyCanvas.filter(assignment => 
    assignment.plannable_type !== "calendar_event" && 
    assignment.plannable_type !== "announcement"
  );
  const newPromises = assignments.map(async (planner) => {
    if (planner.html_url.includes("/submissions/")) {
      planner.html_url = planner.html_url.replace(/\/submissions\/\d+$/, "");
    }
    const assignment = await getCanvasAssignmentDetails(canvasURL, canvasAPIKey, planner);
    if (assignment.locked_for_user) return;
    // OpenAI Categorization (we only care about the assignments that are not locked)
    const estimate = await GetOpenAIEstimate(openAIAPIKey, openAIModel, planner, assignment);
    // Add to Notion
    await addAssignmentToNotion(notionClient, notionDatabaseID, planner, assignment, estimate);
  })
  // Update assignments already in Notion
  const updatePromises = both.map(async ([planner, nassign]) => {
    const plannableDue = planner.plannable.due_at || planner.plannable.todo_date || "";
    const processedCanvasDate = processDueDate(plannableDue);
    const processedNotionDate = processDueDate(nassign.property_due_date?.start || "");
    const isDifferentDueDate = processedCanvasDate !== processedNotionDate;
    const isCanvasDone = planner.submissions.submitted || (planner.planner_override && planner.planner_override.marked_complete) || false;
    const isCanvasOverrideSet = planner.planner_override !== false;
    const isNotionNotStarted = nassign.property_status.name === "Not Started";
    const isNotionDone = nassign.property_status.name === "Completed";
    // Update due date on assignments with different due dates
    if (isDifferentDueDate && !isCanvasDone && processedCanvasDate.length > 0) {
      await notionRateLimit.schedule(() => notionClient.pages.update({
        page_id: nassign.id,
        properties: {
          "Due Date": {
            date: {
              start: processedCanvasDate
            }
          }
        }
      }));
    }
    // Update Notion status on Canvas completed assignments
    if (isCanvasDone && isNotionNotStarted) {
      await notionRateLimit.schedule(() => notionClient.pages.update({
        page_id: nassign.id,
        properties: {
          "Status": {
            status: {
              name: "Completed"
            }
          }
        }
      }));
    }
    // Update Canvas status on Notion completed assignments
    if (isNotionDone && !isCanvasDone && !isCanvasOverrideSet) {
      await canvasRateLimit.schedule(() => fetch(`${canvasURL}/api/v1/planner/overrides`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${canvasAPIKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          "id": null,
          "plannable_id": planner.plannable_id,
          "plannable_type": "assignment",
          "user_id": canvasUserID.toString(),
          "marked_complete": true
        })
      }));
    }
    if (isNotionDone && !isCanvasDone && isCanvasOverrideSet) {
      const plannerOverride = planner.planner_override as PlannerOverride;
      await canvasRateLimit.schedule(() => fetch(`${canvasURL}/api/v1/planner/overrides/${plannerOverride.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${canvasAPIKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          "id": plannerOverride.id,
          "plannable_id": planner.plannable_id,
          "plannable_type": "assignment",
          "user_id": canvasUserID.toString(),
          "marked_complete": true
        })
      }));
    }
  });
  await Promise.all([...newPromises, ...updatePromises]);
}

if (import.meta.main) {
  await import("jsr:@std/dotenv/load");
  const canvasURL = Deno.env.get("CANVAS_URL");
  const canvasAPIKey = Deno.env.get("CANVAS_API_KEY");
  const notionAPIKey = Deno.env.get("NOTION_API_KEY");
  const notionDatabaseID = Deno.env.get("NOTION_DATABASE_ID");
  const openAIAPIKey = Deno.env.get("OPENAI_API_KEY");
  const openAIModel = Deno.env.get("OPENAI_MODEL");

  if (!canvasURL || !canvasAPIKey || !notionAPIKey || !notionDatabaseID || !openAIAPIKey || !openAIModel) {
    console.error("Missing environment variables. Please set CANVAS_URL, CANVAS_API_KEY, NOTION_API_KEY, NOTION_DATABASE_ID, OPENAI_API_KEY, and OPENAI_MODEL.");
  } else {
    const syncManager = new SyncManager();
    
    // Add the initial user from environment variables
    syncManager.addUser("default", {
      canvasURL,
      canvasAPIKey,
      notionAPIKey,
      notionDatabaseID,
      openAIAPIKey,
      openAIModel
    });

    // Start the sync manager
    await syncManager.start();

    // Keep the process running
    await new Promise(() => {});
  }
}
