import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { Job } from "../../domain/job/Job.js";
import { JobName } from "../../domain/job/JobName.js";
import type { JobRepository } from "../../domain/job/JobRepository.js";

export class YamlJobRepository implements JobRepository {
  constructor(private readonly dir: string) {}

  private yamlPath(name: string): string {
    return path.join(this.dir, `${name}.yaml`);
  }

  async list(): Promise<Job[]> {
    await fs.mkdir(this.dir, { recursive: true });
    const entries = await fs.readdir(this.dir);
    const yamls = entries.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
    const jobs: Job[] = [];
    for (const file of yamls) {
      try {
        const raw = await fs.readFile(path.join(this.dir, file), "utf8");
        jobs.push(Job.fromPlain(YAML.parse(raw)));
      } catch (err) {
        // Skip unreadable / invalid files rather than failing the whole list.
        // Could be surfaced as a warning later.
        console.error(`failed to load ${file}: ${(err as Error).message}`);
      }
    }
    return jobs.sort((a, b) => a.name.value.localeCompare(b.name.value));
  }

  async find(name: JobName): Promise<Job | null> {
    try {
      const raw = await fs.readFile(this.yamlPath(name.value), "utf8");
      return Job.fromPlain(YAML.parse(raw));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async save(job: Job): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const yaml = YAML.stringify(job.toPlain(), { lineWidth: 0 });
    await fs.writeFile(this.yamlPath(job.name.value), yaml, "utf8");
  }

  async delete(name: JobName): Promise<boolean> {
    try {
      await fs.unlink(this.yamlPath(name.value));
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw err;
    }
  }
}
