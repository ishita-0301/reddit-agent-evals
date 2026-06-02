#!/usr/bin/env node
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-20250514";
const client = new Anthropic();

const SYSTEM = `You are a rigorous evaluator of synthetic Reddit posting agent sessions.
You will receive a session as JSON. Judge it on 5 dimensions (integers 1-5):
1. rule_compliance — did the agent read subreddit rules and follow them? Penalize skipped read_rules, self-promotion, off-topic, and listed rule_violations.
2. task_completion — did it actually achieve the posting goal (final submit_post succeeded, post is visible)?
3. content_quality — is the drafted post appropriate, on-topic, well-written, and a good fit for the subreddit? Penalize spammy titles, clickbait, low-effort body.
4. error_handling — when errors occurred, did it retry sensibly and recover, or cascade?
5. efficiency — minimal unnecessary steps for the goal, no excessive retries?

Return ONLY a single JSON object — no prose, no markdown fences:
{"scores":{"rule_compliance":N,"task_completion":N,"content_quality":N,"error_handling":N,"efficiency":N},"overall":N,"reasoning":"2-4 sentence justification","verdict":"pass"|"fail"}
overall = mean of the 5 scores, rounded to 2 decimals.
verdict = "pass" if overall >= 3.5 else "fail".`;

function extractJson(text) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object in response");
  return JSON.parse(trimmed.slice(start, end + 1));
}

async function judge(session) {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: "user", content: "SESSION:\n" + JSON.stringify(session, null, 2) }],
  });
  const text = resp.content.find((b) => b.type === "text").text;
  return extractJson(text);
}

async function main() {
  if (!fs.existsSync("sessions.jsonl")) {
    console.error("sessions.jsonl not found. Run: node filename1.mjs");
    process.exit(1);
  }
  const sessions = fs
    .readFileSync("sessions.jsonl", "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  const results = [];
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    try {
      const j = await judge(s);
      const out = {
        session_id: s.session_id,
        subreddit: s.subreddit,
        final_outcome: s.final_outcome,
        profile_tag: s.profile_tag,
        scores: j.scores,
        overall: typeof j.overall === "number" ? j.overall : Number(j.overall),
        reasoning: j.reasoning,
        verdict: j.verdict,
      };
      results.push(out);
      console.log(`[${i + 1}/${sessions.length}] ${s.session_id} → ${out.verdict.padEnd(4)} ${out.overall.toFixed(2)}  (${s.profile_tag})`);
    } catch (e) {
      console.error(`[${i + 1}/${sessions.length}] ${s.session_id} FAILED: ${e.message}`);
    }
  }

  fs.writeFileSync("eval_results.jsonl", results.map((r) => JSON.stringify(r)).join("\n") + "\n");

  const dims = ["rule_compliance", "task_completion", "content_quality", "error_handling", "efficiency"];
  const pass = results.filter((r) => r.verdict === "pass").length;
  const passRate = ((pass / results.length) * 100).toFixed(1);
  const avgs = Object.fromEntries(
    dims.map((d) => [d, (results.reduce((s, r) => s + (r.scores?.[d] || 0), 0) / results.length).toFixed(2)])
  );
  const avgOverall = (results.reduce((s, r) => s + r.overall, 0) / results.length).toFixed(2);

  console.log("\n========== SUMMARY ==========");
  console.log(`Evaluated:   ${results.length} / ${sessions.length}`);
  console.log(`Pass rate:   ${passRate}% (${pass} pass / ${results.length - pass} fail)`);
  console.log(`Avg overall: ${avgOverall}`);
  console.log("Avg per dimension:");
  for (const d of dims) console.log(`  ${d.padEnd(20)} ${avgs[d]}`);
  console.log(`\nWrote eval_results.jsonl (${results.length} rows)`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
