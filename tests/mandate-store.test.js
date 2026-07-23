import assert from "node:assert/strict";
import test from "node:test";
import { MemoryMandateStore } from "../packages/mandate-store/index.js";

test("mandate store updates mandates and rejects duplicate execution inserts", async () => {
  const store = new MemoryMandateStore();
  await store.initialize();
  await store.saveMandate({ id: "mandate-1", status: "draft" });
  await store.saveMandate({ id: "mandate-1", status: "active" });

  const first = { id: "run-1", mandateId: "mandate-1", idempotencyKey: "action-1" };
  const duplicate = { id: "run-2", mandateId: "mandate-1", idempotencyKey: "action-1" };
  await store.saveExecution(first);
  const saved = await store.saveExecution(duplicate);

  assert.equal((await store.listMandates())[0].status, "active");
  assert.equal((await store.listExecutions("mandate-1")).length, 1);
  assert.equal(saved.id, "run-1");
});
