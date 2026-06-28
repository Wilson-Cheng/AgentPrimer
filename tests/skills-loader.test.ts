import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

let tempDir: string;

async function loadModules() {
  vi.resetModules();
  const skillsLoader = await import("../lib/skills-loader");
  const db = await import("../lib/db");
  return { ...skillsLoader, ...db };
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentprimer-skills-"));
  vi.spyOn(process, "cwd").mockReturnValue(tempDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const VALID_SKILL_MD = [
  "---",
  "name: hello-world",
  "description: Greet users by name. Use for greeting tasks.",
  "---",
  "",
  "# Hello World Skill",
  "",
  "When asked to greet someone, respond warmly.",
  "",
].join("\n");

describe("skills loader (SKILL.md format)", () => {
  it("loads enabled skills and returns their context", async () => {
    const { loadSkillContext, upsertSkill } = await loadModules();
    const skillDir = path.join(tempDir, "data", "skills", "hello-world");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), VALID_SKILL_MD, "utf-8");

    upsertSkill({
      id: "skill-1", name: "hello-world", github_url: "builtin://hello-world",
      local_path: skillDir, enabled: 1, manifest_json: VALID_SKILL_MD,
    });

    const contexts = loadSkillContext("all");
    expect(contexts).toHaveLength(1);
    expect(contexts[0].name).toBe("hello-world");
    expect(contexts[0].description).toBe("Greet users by name. Use for greeting tasks.");
    expect(contexts[0].body).toContain("# Hello World Skill");
  });

  it("filters skills by name and skips disabled skills", async () => {
    const { loadSkillContext, upsertSkill } = await loadModules();
    const skillDir1 = path.join(tempDir, "data", "skills", "hello-world");
    const skillDir2 = path.join(tempDir, "data", "skills", "code-reviewer");
    fs.mkdirSync(skillDir1, { recursive: true });
    fs.mkdirSync(skillDir2, { recursive: true });
    fs.writeFileSync(path.join(skillDir1, "SKILL.md"), VALID_SKILL_MD, "utf-8");
    fs.writeFileSync(path.join(skillDir2, "SKILL.md"),
      "---\nname: code-reviewer\ndescription: Review code.\n---\n# Code Reviewer", "utf-8");

    upsertSkill({ id: "sk-1", name: "hello-world",  github_url: "builtin://hello-world",  local_path: skillDir1, enabled: 1, manifest_json: VALID_SKILL_MD });
    upsertSkill({ id: "sk-2", name: "code-reviewer", github_url: "builtin://code-reviewer", local_path: skillDir2, enabled: 1, manifest_json: "" });
    upsertSkill({ id: "sk-3", name: "disabled",      github_url: "builtin://disabled",      local_path: "/tmp/x",  enabled: 0, manifest_json: "" });

    const filtered = loadSkillContext(["hello-world"]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("hello-world");

    const all = loadSkillContext("all");
    expect(all.map(c => c.name)).toContain("hello-world");
    expect(all.map(c => c.name)).toContain("code-reviewer");
    expect(all.map(c => c.name)).not.toContain("disabled");
  });

  it("buildSkillContextSection returns empty string when no skills active", async () => {
    const { buildSkillContextSection } = await loadModules();
    expect(buildSkillContextSection("all")).toBe("");
  });

  it("buildSkillContextSection injects skill bodies into formatted section", async () => {
    const { buildSkillContextSection, upsertSkill } = await loadModules();
    const skillDir = path.join(tempDir, "data", "skills", "hello-world");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), VALID_SKILL_MD, "utf-8");
    upsertSkill({ id: "sk-1", name: "hello-world", github_url: "builtin://hello-world", local_path: skillDir, enabled: 1, manifest_json: VALID_SKILL_MD });

    const section = buildSkillContextSection("all");
    expect(section).toContain("## Active Skills");
    expect(section).toContain("### Skill: hello-world");
    expect(section).toContain("# Hello World Skill");
  });

  it("buildSkillDiscoverySection lists only name + description, NOT the body", async () => {
    const { buildSkillDiscoverySection, upsertSkill } = await loadModules();
    const skillDir = path.join(tempDir, "data", "skills", "hello-world");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), VALID_SKILL_MD, "utf-8");
    upsertSkill({ id: "sk-1", name: "hello-world", github_url: "builtin://hello-world", local_path: skillDir, enabled: 1, manifest_json: VALID_SKILL_MD });

    const { section, skills } = buildSkillDiscoverySection("all");

    // Stage 1: name + description only — body must NOT leak into the prompt
    expect(section).toContain("## Available Skills");
    expect(section).toContain("hello-world");
    expect(section).toContain("Greet users by name");
    expect(section).toContain("load_skill"); // tells the model how to activate
    expect(section).not.toContain("# Hello World Skill"); // body absent
    expect(section).not.toContain("respond warmly");      // body absent

    expect(skills).toEqual([
      { name: "hello-world", description: "Greet users by name. Use for greeting tasks." },
    ]);
  });

  it("buildSkillDiscoverySection returns empty when no enabled skills", async () => {
    const { buildSkillDiscoverySection } = await loadModules();
    expect(buildSkillDiscoverySection("all")).toEqual({ section: "", skills: [] });
  });

  it("loadOneSkillBody returns the full body for an allowed skill", async () => {
    const { loadOneSkillBody, upsertSkill } = await loadModules();
    const skillDir = path.join(tempDir, "data", "skills", "hello-world");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), VALID_SKILL_MD, "utf-8");
    upsertSkill({ id: "sk-1", name: "hello-world", github_url: "builtin://hello-world", local_path: skillDir, enabled: 1, manifest_json: VALID_SKILL_MD });

    const result = loadOneSkillBody("hello-world", "all");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("hello-world");
    expect(result!.body).toContain("# Hello World Skill");
    expect(result!.body).toContain("respond warmly");
    expect(result!.path).toContain("SKILL.md");
  });

  it("loadOneSkillBody respects the per-agent allow-list and disabled skills", async () => {
    const { loadOneSkillBody, upsertSkill } = await loadModules();
    const skillDir = path.join(tempDir, "data", "skills", "hello-world");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), VALID_SKILL_MD, "utf-8");
    upsertSkill({ id: "sk-1", name: "hello-world", github_url: "builtin://hello-world", local_path: skillDir, enabled: 1, manifest_json: VALID_SKILL_MD });
    upsertSkill({ id: "sk-2", name: "off-skill", github_url: "builtin://off-skill", local_path: skillDir, enabled: 0, manifest_json: "" });

    // Not in the filter list → null (cannot side-load)
    expect(loadOneSkillBody("hello-world", ["other-skill"])).toBeNull();
    // Disabled skill → null even when present in filter
    expect(loadOneSkillBody("off-skill", "all")).toBeNull();
    // Unknown skill → null
    expect(loadOneSkillBody("does-not-exist", "all")).toBeNull();
    // Allowed + enabled → returns body
    expect(loadOneSkillBody("hello-world", ["hello-world"])).not.toBeNull();
  });
});
