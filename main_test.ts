import { assertEquals, assertObjectMatch } from "@std/assert";
import { flattenNotionProperties, mergeByKey, processDueDate, SyncManager, UserConfig } from "./main.ts";

Deno.test(function mergeEntriesByKey() {
  const a = [
    { id: 1, name: "Alice" },
    { id: 2, name: "Bob" },
    { id: 3, name: "Charlie" },
    { id: 5, name: "Dick" },
  ];
  const b = [
    { id: 2, age: 42 },
    { id: 3, age: 43 },
    { id: 4, age: 44 },
    { id: 5, age: 69 },
  ];
  const result = mergeByKey(a, b, "id", "id");
  assertEquals(result.both, [
    [{ id: 2, name: "Bob" }, { id: 2, age: 42 }],
    [{ id: 3, name: "Charlie" }, { id: 3, age: 43 }],
    [{ id: 5, name: "Dick" }, { id: 5, age: 69 }],
  ]);
  assertEquals(result.onlyA, [{ id: 1, name: "Alice" }]);
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
});

Deno.test(function processDueDateTests() {
  // Test empty and invalid input
  assertEquals(processDueDate(""), "");
  assertEquals(processDueDate("invalid"), "");

  // Test specific times
  assertEquals(
    processDueDate("2025-02-13T14:30:00Z"),
    "2025-02-13T14:30:00Z"
  );

  // Test 00:59:00 AM and 05:59:59 AM (last day midnight)
  assertEquals(
    processDueDate("2025-02-13T00:59:00Z"),
    "2025-02-12"
  );
  assertEquals(
    processDueDate("2025-02-13T05:59:59Z"),
    "2025-02-12"
  );
  // Test 11:59:59 PM, and 11:59:00 PM (same day midnight)
  assertEquals(
    processDueDate("2025-02-13T23:59:59Z"),
    "2025-02-13"
  );
  assertEquals(
    processDueDate("2025-02-13T23:59:00Z"),
    "2025-02-13"
  );
});

Deno.test(async function syncManagerTests() {
  const manager = new SyncManager();
  const testConfig: UserConfig = {
    canvasURL: "https://canvas.test",
    canvasAPIKey: "test-key",
    notionAPIKey: "test-key",
    notionDatabaseID: "test-id",
    openAIAPIKey: "test-key",
    openAIModel: "test-model"
  };

  try {
    // Test adding and removing users
    manager.addUser("test-user", testConfig);
    manager.removeUser("test-user");

    // Test starting and stopping
    await manager.start();
    manager.stop();
  } finally {
    // Ensure cleanup even if test fails
    manager.stop();
  }
});