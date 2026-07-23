import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const EMPTY_DATA = Object.freeze({ mandates: [], executions: [], approvals: [] });

export class JsonMandateStore {
  constructor(path) {
    this.path = path;
    this.writeQueue = Promise.resolve();
  }

  async initialize(seed = EMPTY_DATA) {
    try {
      await readFile(this.path, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await this.write(seed);
    }
    return this.read();
  }

  async read() {
    const data = JSON.parse(await readFile(this.path, "utf8"));
    return normalizeData(data);
  }

  async listMandates() {
    return (await this.read()).mandates;
  }

  async getMandate(id) {
    return (await this.listMandates()).find((mandate) => mandate.id === id) || null;
  }

  async saveMandate(mandate) {
    return this.update((data) => {
      const index = data.mandates.findIndex((item) => item.id === mandate.id);
      if (index === -1) data.mandates.unshift(mandate);
      else data.mandates[index] = mandate;
      return mandate;
    });
  }

  async listExecutions(mandateId = null) {
    const executions = (await this.read()).executions;
    return mandateId ? executions.filter((item) => item.mandateId === mandateId) : executions;
  }

  async saveExecution(execution) {
    return this.update((data) => {
      const existing = data.executions.find((item) => item.idempotencyKey === execution.idempotencyKey);
      if (existing) return existing;
      data.executions.unshift(execution);
      return execution;
    });
  }

  async seenIdempotencyKeys(mandateId) {
    const executions = await this.listExecutions(mandateId);
    return new Set(executions.map((item) => item.idempotencyKey));
  }

  async update(mutator) {
    let result;
    this.writeQueue = this.writeQueue.then(async () => {
      const data = await this.read();
      result = await mutator(data);
      await this.write(data);
    });
    await this.writeQueue;
    return result;
  }

  async write(data) {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(normalizeData(data), null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.path);
  }
}

export class MemoryMandateStore {
  constructor(seed = EMPTY_DATA) {
    this.data = structuredClone(normalizeData(seed));
  }

  async initialize() {
    return structuredClone(this.data);
  }

  async read() {
    return structuredClone(this.data);
  }

  async listMandates() {
    return (await this.read()).mandates;
  }

  async getMandate(id) {
    return (await this.listMandates()).find((mandate) => mandate.id === id) || null;
  }

  async saveMandate(mandate) {
    const index = this.data.mandates.findIndex((item) => item.id === mandate.id);
    if (index === -1) this.data.mandates.unshift(structuredClone(mandate));
    else this.data.mandates[index] = structuredClone(mandate);
    return mandate;
  }

  async listExecutions(mandateId = null) {
    const executions = (await this.read()).executions;
    return mandateId ? executions.filter((item) => item.mandateId === mandateId) : executions;
  }

  async saveExecution(execution) {
    const existing = this.data.executions.find((item) => item.idempotencyKey === execution.idempotencyKey);
    if (existing) return structuredClone(existing);
    this.data.executions.unshift(structuredClone(execution));
    return execution;
  }

  async seenIdempotencyKeys(mandateId) {
    return new Set((await this.listExecutions(mandateId)).map((item) => item.idempotencyKey));
  }
}

function normalizeData(data) {
  return {
    mandates: Array.isArray(data?.mandates) ? data.mandates : [],
    executions: Array.isArray(data?.executions) ? data.executions : [],
    approvals: Array.isArray(data?.approvals) ? data.approvals : []
  };
}
