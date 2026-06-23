const { db } = require("../config/firebase");

/**
 * ProductionDay model
 * ─────────────────────────────────────────────────────────────────────────────
 * Represents one working day on the floor. When the user "records a new
 * production day" the planner fills it with TASKS (what to produce + why), each
 * task carrying the ordered STEPS copied from its workflow. The user then ticks
 * each step done/undone; task and day status are recomputed automatically so the
 * app always knows what to do next.
 *
 * Document shape (collection `productionDays`):
 *   {
 *     date, status: 'in_progress'|'completed',
 *     workersPresent,
 *     tasks: [{
 *       id, source: 'auto'|'invoice'|'manual',
 *       productId, productName, tier, quantity, reason,
 *       workflowId, workflowName, workersNeeded, expectedMinutes,
 *       steps: [{ id, name, description, expectedMinutes, workersNeeded,
 *                 status:'pending'|'done', doneAt }],
 *       status: 'pending'|'in_progress'|'completed'
 *     }],
 *     notes, createdAt, completedAt
 *   }
 * ─────────────────────────────────────────────────────────────────────────────
 */

function genId(prefix) {
  return (
    prefix +
    "_" +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 6)
  );
}

/** Recompute a task's status from its steps. */
function taskStatus(task) {
  const steps = Array.isArray(task.steps) ? task.steps : [];
  if (steps.length === 0) return task.status || "pending";
  const done = steps.filter((s) => s.status === "done").length;
  if (done === 0) return "pending";
  if (done === steps.length) return "completed";
  return "in_progress";
}

class ProductionDay {
  static collectionName = "productionDays";

  static async create(data) {
    try {
      const tasks = (Array.isArray(data.tasks) ? data.tasks : []).map((t) =>
        this.buildTask(t),
      );

      const payload = {
        date: data.date || new Date().toISOString().slice(0, 10),
        status: "in_progress",
        workersPresent: data.workersPresent || 0,
        tasks,
        notes: data.notes || "",
        createdAt: new Date(),
        completedAt: null,
      };
      const ref = await db.collection(this.collectionName).add(payload);
      return { id: ref.id, ...payload };
    } catch (e) {
      throw new Error(`Error creating production day: ${e.message}`);
    }
  }

  /**
   * Normalise a raw task into the stored shape. Step time is PER UNIT, so each
   * step's total `expectedMinutes` = minutesPerUnit × the task's unit count.
   */
  static buildTask(t) {
    const unitCount =
      t.unitCount != null
        ? Number(t.unitCount)
        : t.quantity != null
          ? Number(t.quantity)
          : 1;
    const steps = (Array.isArray(t.steps) ? t.steps : []).map((s, i) => {
      const minutesPerUnit =
        s.minutesPerUnit != null
          ? Number(s.minutesPerUnit)
          : Number(s.expectedMinutes) || 0;
      return {
        id: s.id || genId("step"),
        name: s.name || `Step ${i + 1}`,
        description: s.description || "",
        minutesPerUnit,
        expectedMinutes: Math.round(minutesPerUnit * (unitCount || 1)),
        workersNeeded: s.workersNeeded || 0,
        status: s.status === "done" ? "done" : "pending",
        doneAt: s.doneAt || null,
      };
    });
    return {
      id: t.id || genId("task"),
      source: t.source || "auto",
      productId: t.productId || null,
      productName: t.productName || "",
      tier: t.tier || "",
      quantity: t.quantity != null ? t.quantity : null,
      unitCount: unitCount || (t.quantity != null ? Number(t.quantity) : 0),
      reason: t.reason || "",
      workflowId: t.workflowId || null,
      workflowName: t.workflowName || "",
      // Worker assigned to perform/own this task (recorded in their profile).
      assignedWorkerId: t.assignedWorkerId || null,
      assignedWorkerName: t.assignedWorkerName || "",
      // Extra workers given other commands within the day (idle re-assignment).
      assignments: Array.isArray(t.assignments) ? t.assignments : [],
      invoiceId: t.invoiceId || null,
      carriedFrom: t.carriedFrom || null,
      workersNeeded: t.workersNeeded || 0,
      expectedMinutes: steps.reduce((s, x) => s + (x.expectedMinutes || 0), 0),
      recorded: !!t.recorded, // guards against double sale/profile recording
      steps,
      status: t.status || "pending",
    };
  }

  static decorate(doc) {
    const data = doc.data ? doc.data() : doc;
    const tasks = (data.tasks || []).map((t) => ({
      ...t,
      status: taskStatus(t),
    }));
    const totalSteps = tasks.reduce((s, t) => s + (t.steps || []).length, 0);
    const doneSteps = tasks.reduce(
      (s, t) => s + (t.steps || []).filter((x) => x.status === "done").length,
      0,
    );
    return {
      id: doc.id || data.id,
      ...data,
      tasks,
      progress: {
        totalTasks: tasks.length,
        completedTasks: tasks.filter((t) => t.status === "completed").length,
        totalSteps,
        doneSteps,
        percent: totalSteps ? Math.round((doneSteps / totalSteps) * 100) : 0,
      },
    };
  }

  static async getAll() {
    try {
      const snap = await db.collection(this.collectionName).get();
      return snap.docs
        .map((d) => this.decorate(d))
        .sort((a, b) => {
          const av =
            a.createdAt && a.createdAt.seconds ? a.createdAt.seconds : 0;
          const bv =
            b.createdAt && b.createdAt.seconds ? b.createdAt.seconds : 0;
          return bv - av;
        });
    } catch (e) {
      throw new Error(`Error fetching production days: ${e.message}`);
    }
  }

  static async getById(id) {
    try {
      const doc = await db.collection(this.collectionName).doc(id).get();
      if (!doc.exists) return null;
      return this.decorate(doc);
    } catch (e) {
      throw new Error(`Error fetching production day: ${e.message}`);
    }
  }

  /**
   * Toggle (or set) the done state of a single step, then persist. Returns the
   * refreshed, decorated day so the caller can re-render progress.
   */
  static async setStep(dayId, taskId, stepId, done) {
    try {
      const ref = db.collection(this.collectionName).doc(dayId);
      await db.runTransaction(async (t) => {
        const doc = await t.get(ref);
        if (!doc.exists) throw new Error("Production day not found");
        const data = doc.data();
        const tasks = (data.tasks || []).map((task) => {
          if (task.id !== taskId) return task;
          const steps = (task.steps || []).map((s) => {
            if (s.id !== stepId) return s;
            const newDone = done == null ? s.status !== "done" : !!done;
            return {
              ...s,
              status: newDone ? "done" : "pending",
              doneAt: newDone ? new Date() : null,
            };
          });
          return { ...task, steps, status: taskStatus({ ...task, steps }) };
        });
        t.update(ref, { tasks, updatedAt: new Date() });
      });
      return await this.getById(dayId);
    } catch (e) {
      throw new Error(`Error updating step: ${e.message}`);
    }
  }

  /** Append a manual or invoice task to an existing day. */
  static async addTask(dayId, task) {
    try {
      const day = await this.getById(dayId);
      if (!day) throw new Error("Production day not found");
      const newTask = this.buildTask({
        ...task,
        source: task.source || "manual",
      });
      await db
        .collection(this.collectionName)
        .doc(dayId)
        .update({
          tasks: [...(day.tasks || []), newTask],
          updatedAt: new Date(),
        });
      return await this.getById(dayId);
    } catch (e) {
      throw new Error(`Error adding task: ${e.message}`);
    }
  }

  /** Assign (or change) the primary worker who owns a task. */
  static async assignWorker(dayId, taskId, workerId, workerName) {
    try {
      const ref = db.collection(this.collectionName).doc(dayId);
      await db.runTransaction(async (t) => {
        const doc = await t.get(ref);
        if (!doc.exists) throw new Error("Production day not found");
        const tasks = (doc.data().tasks || []).map((task) =>
          task.id === taskId
            ? {
                ...task,
                assignedWorkerId: workerId || null,
                assignedWorkerName: workerName || "",
              }
            : task,
        );
        t.update(ref, { tasks, updatedAt: new Date() });
      });
      return await this.getById(dayId);
    } catch (e) {
      throw new Error(`Error assigning worker: ${e.message}`);
    }
  }

  /**
   * Give an idle worker an extra command on a task (e.g. Ahmed finished early →
   * help with another task). Stored as a free-text instruction with the worker.
   */
  static async addAssignment(dayId, taskId, workerId, workerName, command) {
    try {
      const ref = db.collection(this.collectionName).doc(dayId);
      await db.runTransaction(async (t) => {
        const doc = await t.get(ref);
        if (!doc.exists) throw new Error("Production day not found");
        const tasks = (doc.data().tasks || []).map((task) => {
          if (task.id !== taskId) return task;
          const assignments = Array.isArray(task.assignments)
            ? task.assignments
            : [];
          assignments.push({
            id: genId("cmd"),
            workerId: workerId || null,
            workerName: workerName || "",
            command: command || `Assist with ${task.productName}`,
            at: new Date(),
          });
          return { ...task, assignments };
        });
        t.update(ref, { tasks, updatedAt: new Date() });
      });
      return await this.getById(dayId);
    } catch (e) {
      throw new Error(`Error adding assignment: ${e.message}`);
    }
  }

  /** Update the unit count of a task and recompute step/task times. */
  static async setUnitCount(dayId, taskId, unitCount) {
    try {
      const day = await this.getById(dayId);
      if (!day) throw new Error("Production day not found");
      const tasks = day.tasks.map((task) => {
        if (task.id !== taskId) return task;
        const uc = Math.max(0, Number(unitCount) || 0);
        const steps = (task.steps || []).map((s) => ({
          ...s,
          expectedMinutes: Math.round((s.minutesPerUnit || 0) * uc),
        }));
        return {
          ...task,
          unitCount: uc,
          steps,
          expectedMinutes: steps.reduce(
            (a, b) => a + (b.expectedMinutes || 0),
            0,
          ),
        };
      });
      await db
        .collection(this.collectionName)
        .doc(dayId)
        .update({ tasks, updatedAt: new Date() });
      return await this.getById(dayId);
    } catch (e) {
      throw new Error(`Error setting unit count: ${e.message}`);
    }
  }

  /**
   * Collect unfinished tasks from earlier in-progress days so they can carry
   * over into a new day (a workflow that didn't finish within working hours
   * continues the next day).
   */
  static async getCarryOverTasks() {
    const all = await this.getAll();
    const carried = [];
    for (const day of all) {
      if (day.status === "completed") continue;
      for (const task of day.tasks || []) {
        if (task.status !== "completed") {
          carried.push({
            ...task,
            id: undefined, // a fresh id is assigned on rebuild
            carriedFrom: day.date,
            reason:
              `Carried over from ${day.date}. ${task.reason || ""}`.trim(),
          });
        }
      }
    }
    return carried;
  }

  /** Mark a task's side-effects (sale / worker profile) as recorded once. */
  static async markRecorded(dayId, taskId) {
    try {
      const ref = db.collection(this.collectionName).doc(dayId);
      await db.runTransaction(async (t) => {
        const doc = await t.get(ref);
        if (!doc.exists) return;
        const tasks = (doc.data().tasks || []).map((task) =>
          task.id === taskId ? { ...task, recorded: true } : task,
        );
        t.update(ref, { tasks, updatedAt: new Date() });
      });
      return true;
    } catch (e) {
      throw new Error(`Error marking task recorded: ${e.message}`);
    }
  }

  static async complete(dayId) {
    try {
      await db.collection(this.collectionName).doc(dayId).update({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
      });
      return await this.getById(dayId);
    } catch (e) {
      throw new Error(`Error completing production day: ${e.message}`);
    }
  }

  static async delete(id) {
    try {
      await db.collection(this.collectionName).doc(id).delete();
      return true;
    } catch (e) {
      throw new Error(`Error deleting production day: ${e.message}`);
    }
  }
}

module.exports = ProductionDay;
