import { assertEquals } from "@std/assert";
import { mergeByKey } from "./main.ts";

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
