import "jsr:@std/dotenv/load";
import { Client, isFullPage } from "npm:@notionhq/client"
import TurndownService from "npm:turndown";
import Bottleneck from "npm:bottleneck";
import { markdownToBlocks } from "npm:@tryfabric/martian";
import { OpenAIConfig, systemPrompt } from "./const.ts";

const ONE_DAY = 8.64e7;
const DAYS_TO_FETCH = 16;
const notion = new Client({
  auth: Deno.env.get("NOTION_API_KEY")
})
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

export function getCanvasUserID(): Promise<number> {
  return canvasRateLimit.schedule(() => fetch(Deno.env.get("CANVAS_URL") + "/api/v1/users/self", { headers: { Authorization: `Bearer ${Deno.env.get("CANVAS_API_KEY")}` } })
    .then(res => {
      if (!res.ok) {
        throw new Error("Failed to fetch Canvas user ID");
      }
      return res.json()
    })
    .then(res => res.id)
    .catch(err => { throw new Error(err) }));
}

export function getCanvasPlanner(): Promise<PlannerItem[]> {
  const baseUrl = Deno.env.get("CANVAS_URL");
  const token = Deno.env.get("CANVAS_API_KEY");
  if (!baseUrl) {
    throw new Error("Canvas URL needs to be set");
  } else if (!token) {
    throw new Error("Canvas token needs to be set");
  }
  const query = new URLSearchParams({
    start_date: new Date(Date.now() - 8.64e7).toISOString(),
    end_date: new Date(Date.now() + DAYS_TO_FETCH * ONE_DAY).toISOString(),
    per_page: "75"
  });
  return fetch(baseUrl + "/api/v1/planner/items?" + query.toString(), { headers: { Authorization: `Bearer ${token}` } })
    .then(res => {
      if (!res.ok) {
        throw new Error("Failed to fetch Canvas planner");
      }
      return res.json()
    })
    .catch(err => { throw new Error(err) });
}

export function getCanvasAssignmentDetails(planner: PlannerItem): Promise<CanvasAssignment> {
  const baseUrl = Deno.env.get("CANVAS_URL");
  const token = Deno.env.get("CANVAS_API_KEY");
  if (!baseUrl) {
    throw new Error("Canvas URL needs to be set");
  } else if (!token) {
    throw new Error("Canvas token needs to be set");
  }
  return canvasRateLimit.schedule(() => fetch(baseUrl + "/api/v1" + planner.html_url, { headers: { Authorization: `Bearer ${token}` } })
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

export function getNotionDatabase(): Promise<NotionAssignment[]> {
  const databaseID = Deno.env.get("NOTION_DATABASE_ID");
  if (!databaseID) {
    throw new Error("Database ID is not set");
  }
  const notionQuery = (start_cursor?: string) => notion.databases.query({
    database_id: databaseID,
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

export function GetOpenAIEstimate(planner: PlannerItem, assignment: CanvasAssignment): Promise<"" | "XS" | "S" | "M" | "L" | "XL"> {
  const assignment_title = assignment.title;
  const course_name = planner.context_name;
  const description = assignment.description || assignment.message;
  const markdown = turndown.turndown(description).slice(0, 3000);
  const token = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_MODEL");
  if (!token || !model) {
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

export function addAssignmentToNotion(planner: PlannerItem, assignment: CanvasAssignment, estimate?: "" | "XS" | "S" | "M" | "L" | "XL") {
  const baseUrl = Deno.env.get("CANVAS_URL");
  const databaseID = Deno.env.get("NOTION_DATABASE_ID");
  if (!databaseID || !baseUrl) {
    throw new Error("How did we get here?");
  }
  const description = assignment.description || assignment.message || "";
  const plannableDue = planner.plannable.due_at || planner.plannable.todo_date || assignment.due_at || "";
  const markdown = turndown.turndown(description).slice(0, 3000);
  return notionRateLimit.schedule(() => notion.pages.create({
    "parent": {
      "type": "database_id",
      "database_id": databaseID
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
          start: new Date(plannableDue).toDateString().split('T', 1)[0]
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
        url: baseUrl + assignment.html_url
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

if (import.meta.main) {
  const [canvasUserID, canvasPlanner, notionDatabase] = await Promise.all([getCanvasUserID(), getCanvasPlanner(), getNotionDatabase()]);
  const { both, onlyA: onlyCanvas } = mergeByKey(canvasPlanner, notionDatabase, "plannable_id", "property_id");
  // Add new assignments to Notion
  const assignments = onlyCanvas.filter(assignment => assignment.plannable_type !== "calendar_event");
  const newPromises = assignments.map(async (planner) => {
    if (planner.html_url.includes("/submissions/")) {
      planner.html_url = planner.html_url.replace(/\/submissions\/\d+$/, "");
    }
    const assignment = await getCanvasAssignmentDetails(planner);
    if (assignment.locked_for_user) return;
    // OpenAI Categorization (we only care about the assignments that are not locked)
    const estimate = await GetOpenAIEstimate(planner, assignment);
    // Add to Notion
    await addAssignmentToNotion(planner, assignment, estimate);
  })
  // Update assignments already in Notion
  const updatePromises = both.map(async ([planner, nassign]) => {
    const plannableDue = planner.plannable.due_at || planner.plannable.todo_date || "";
    const isDifferentDueDate = new Date(plannableDue).toDateString() !== new Date(nassign.property_due_date.start).toDateString();
    const isCanvasDone = planner.submissions.submitted || (planner.planner_override && planner.planner_override.marked_complete) || false;
    const isCanvasOverrideSet = planner.planner_override !== false;
    const isNotionNotStarted = nassign.property_status.name === "Not Started";
    const isNotionDone = nassign.property_status.name === "Completed";
    // Update due date on assignments with different due dates
    if (isDifferentDueDate) {
      await notionRateLimit.schedule(() => notion.pages.update({
        page_id: nassign.id,
        properties: {
          "Due Date": {
            date: {
              start: new Date(plannableDue).toISOString().split('T', 1)[0]
            }
          }
        }
      }));
    }
    // Update Notion status on Canvas completed assignments
    if (isCanvasDone && isNotionNotStarted) {
      await notionRateLimit.schedule(() => notion.pages.update({
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
      await canvasRateLimit.schedule(() => fetch(`${Deno.env.get("CANVAS_URL")}/api/v1/planner/overrides`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("CANVAS_API_KEY")}`,
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
      await canvasRateLimit.schedule(() => fetch(`${Deno.env.get("CANVAS_URL")}/api/v1/planner/overrides/${plannerOverride.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${Deno.env.get("CANVAS_API_KEY")}`,
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
