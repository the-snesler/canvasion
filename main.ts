import "jsr:@std/dotenv/load";
import { Client } from "npm:@notionhq/client"

const ONE_DAY = 8.64e7;
const DAYS_TO_FETCH = 16;
const notion = new Client({
  auth: Deno.env.get("NOTION_API_KEY")
})


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

// deno-lint-ignore no-explicit-any
export function getNotionDatabase(): Promise<any[]> {
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
  return notionQuery().then(async (res) => {
    const results = res.results;
    let response = res;
    while (response.has_more) {
      response = await notionQuery(response.next_cursor ?? undefined);
      results.push(...res.results);
    }
    return results;
  });

}

/**
 * Compare two arrays of objects by a key. Items from a and b are paired together when the values of their chosen keys match.
 */
// deno-lint-ignore no-explicit-any
export function mergeByKey(a: any[], b: any[], keyA: keyof typeof a, keyB: keyof typeof b): { both: (typeof a | typeof b)[], onlyA: typeof a[], onlyB: typeof b[] } {
  const aKeys = a.map(item => item[keyA]);
  const bKeys = b.map(item => item[keyB]);
  return aKeys.filter(key => bKeys.includes(key));
}

if (import.meta.main) {
  await getNotionDatabase();
  // const [canvasPlanner, notionDatabase] = await Promise.all([getCanvasPlanner(), getNotionDatabase()]);
  // console.log(canvasPlanner, notionDatabase);
  // const [both, onlyCanvas, onlyNotion] = mergeByKey(canvasPlanner, notionDatabase, "plannable_id", "property_id");
}
