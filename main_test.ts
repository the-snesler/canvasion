import { assertEquals, assertObjectMatch } from "@std/assert";
import { flattenNotionProperties, mergeByKey } from "./main.ts";

const a = [
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
  { id: 3, name: "Charlie" },
];
const b = [
  { id: 2, age: 42 },
  { id: 3, age: 43 },
  { id: 4, age: 44 },
];

Deno.test(function mergeBoth() {
  const result = mergeByKey(a, b, "id", "id");
  assertEquals(result.both, [
    { id: 2, name: "Bob", age: 42 },
    { id: 3, name: "Charlie", age: 43 },
  ]);
});

Deno.test(function mergeOnlyA() {
  const result = mergeByKey(a, b, "id", "id");
  assertEquals(result.onlyA, [{ id: 1, name: "Alice" }]);
});

Deno.test(function mergeOnlyB() {
  const result = mergeByKey(a, b, "id", "id");
  assertEquals(result.onlyB, [{ id: 4, age: 44 }]);
});

Deno.test(function flattenedProperties() {
  const page = {
    properties: {
      URL: {
        type: "url",
        url: "https://www.notion.so/Getting-Started-1574b3d4f2c240a6bd2c0d8f3b0b4e4f"
      },
      Due: {
        type: "date",
        date: { start: "2024-10-23" }
      },
      Priority: {
        type: "status",
        status: { name: "Should Do" }
      },
      "Last edited time": {
        type: "last_edited_time",
        last_edited_time: "2024-10-23T22:16:00.000Z"
      },
      ID: {
        type: "rich_text",
        "rich_text": [
          {
            type: "text",
            plain_text: "2466239",
          }
        ]
      }
    }
  };

  const flattened = {
    property_url: "https://www.notion.so/Getting-Started-1574b3d4f2c240a6bd2c0d8f3b0b4e4f",
    property_due: { start: "2024-10-23" },
    property_priority: { name: "Should Do" },
    property_last_edited_time: "2024-10-23T22:16:00.000Z",
    property_id: "2466239"
  };
  assertObjectMatch(flattenNotionProperties(page), flattened);
})