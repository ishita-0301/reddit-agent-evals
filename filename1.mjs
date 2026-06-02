#!/usr/bin/env node
import fs from "node:fs";

const SUBREDDITS = ["MachineLearning", "startups", "programming", "AskReddit", "entrepreneur"];

const TASK_TEMPLATES = {
  MachineLearning: [
    "Share new paper on transformer attention efficiency",
    "Ask about training data for medical imaging model",
    "Post benchmark comparison for vision LLMs",
    "Request feedback on novel RL algorithm",
  ],
  startups: [
    "Announce YC-batch fintech launch",
    "Ask for cofounder feedback",
    "Share fundraising lessons learned",
    "Promote new SaaS product",
  ],
  programming: [
    "Share blog post about Rust memory model",
    "Ask for code review on open source library",
    "Post performance optimization writeup",
    "Discuss design patterns in microservices",
  ],
  AskReddit: [
    "Ask philosophical question about future of work",
    "Pose lighthearted question about hobbies",
    "Ask survey question for personal research",
    "Ask poll-style question on travel",
  ],
  entrepreneur: [
    "Share growth marketing case study",
    "Ask about pricing strategy",
    "Discuss founder mental health",
    "Promote affiliate product",
  ],
};

const PROFILES = [
  { name: "quality_success",     outcome: "success",         weight: 18, retryProb: 0.10, violationProb: 0.00, content: "good" },
  { name: "success_with_retry",  outcome: "success",         weight:  7, retryProb: 0.70, violationProb: 0.05, content: "good" },
  { name: "rule_violation",      outcome: "partial_failure", weight:  8, retryProb: 0.40, violationProb: 0.90, content: "rule_violating" },
  { name: "off_topic",           outcome: "partial_failure", weight:  6, retryProb: 0.30, violationProb: 0.60, content: "off_topic" },
  { name: "spam_like",           outcome: "full_failure",    weight:  6, retryProb: 0.30, violationProb: 0.95, content: "spam" },
  { name: "error_cascade",       outcome: "full_failure",    weight:  5, retryProb: 0.95, violationProb: 0.30, content: "good" },
];

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
const rand = (rng, lo, hi) => Math.floor(rng() * (hi - lo + 1)) + lo;
const randomId = (rng) =>
  Array.from({ length: 6 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(rng() * 36)]).join("");

function pickProfile(rng) {
  const total = PROFILES.reduce((s, p) => s + p.weight, 0);
  let r = rng() * total;
  for (const p of PROFILES) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return PROFILES[0];
}

function generateDraft(subreddit, task, content, rng) {
  if (content === "good") {
    const titles = {
      MachineLearning: `[R] ${task} — preliminary results`,
      startups: `[Lessons] ${task}`,
      programming: `${task} — writeup with benchmarks`,
      AskReddit: `${task}?`,
      entrepreneur: `${task} — what worked, what didn't`,
    };
    return {
      title: titles[subreddit],
      body: `Hey r/${subreddit}, I wanted to share thoughts on ${task.toLowerCase()}. Here's the context, approach, and results, with sources linked at the bottom. Open to discussion in the comments.`,
    };
  }
  if (content === "rule_violating") {
    return {
      title: `Check out my product: ${task}`,
      body: `Hey everyone, I built a thing related to ${task.toLowerCase()}. Buy it at mysite.com — first 100 get a discount. DM me for affiliate codes.`,
    };
  }
  if (content === "off_topic") {
    const wrongTopic = pick(["my cat's birthday", "a political rant", "crypto airdrops", "MLM opportunity"], rng);
    return {
      title: `${wrongTopic} (somehow related to ${task})`,
      body: `So this isn't really about ${task.toLowerCase()} but I wanted to talk about ${wrongTopic}.`,
    };
  }
  // spam
  return {
    title: `🔥🔥 ${task.toUpperCase()} 🔥🔥 CLICK NOW`,
    body: `URGENT!!! Don't miss out!!! Limited time!!! Visit bit.ly/spamlink for exclusive access. Repost this everywhere!!!`,
  };
}

function generateSession(idx) {
  const rng = mulberry32(1000 + idx);
  const subShort = pick(SUBREDDITS, rng);
  const subreddit = `r/${subShort}`;
  const task = pick(TASK_TEMPLATES[subShort], rng);
  const profile = pickProfile(rng);
  const steps = [];
  let stepId = 1;

  steps.push({
    step_id: stepId++,
    action: "search_subreddit",
    input: { query: subShort, sort: "hot", limit: 25 },
    output: { results_count: rand(rng, 8, 25), top_post_score: rand(rng, 100, 8000) },
    status: "success",
  });

  const readRules = profile.content === "good" || rng() > 0.5;
  if (readRules) {
    steps.push({
      step_id: stepId++,
      action: "read_rules",
      input: { subreddit },
      output: {
        rule_count: rand(rng, 6, 14),
        key_rules: ["No spam or self-promotion", "Stay on-topic", "Use appropriate flair", "No low-effort posts"],
      },
      status: "success",
    });
  }

  const draft = generateDraft(subShort, task, profile.content, rng);
  steps.push({
    step_id: stepId++,
    action: "draft_post",
    input: { topic: task, target_length: rand(rng, 200, 800) },
    output: { title: draft.title, body_preview: draft.body.slice(0, 220), length_chars: draft.body.length },
    status: "success",
  });

  const toneScore = profile.content === "good" ? rand(rng, 7, 10) : profile.content === "spam" ? rand(rng, 1, 3) : rand(rng, 3, 6);
  const toneFlags = [];
  if (profile.content === "spam") toneFlags.push("excessive_caps", "promotional", "clickbait");
  if (profile.content === "rule_violating") toneFlags.push("promotional");
  if (profile.content === "off_topic") toneFlags.push("off_topic");
  steps.push({
    step_id: stepId++,
    action: "check_tone",
    input: { draft_preview: draft.body.slice(0, 100) },
    output: { tone_score: toneScore, flags: toneFlags },
    status: toneScore >= 6 ? "success" : "warning",
  });

  const retryCount = rng() < profile.retryProb ? rand(rng, 1, 3) : 0;
  for (let j = 0; j < retryCount; j++) {
    const err = pick(["rate_limit_429", "automod_filter", "title_too_long", "image_upload_failed", "shadowban_warning"], rng);
    const recovered = j < retryCount - 1 || profile.outcome !== "full_failure" ? rng() > 0.2 : false;
    steps.push({
      step_id: stepId++,
      action: "handle_error",
      input: { error: err, attempt: j + 1 },
      output: { recovered, action_taken: recovered ? "retried_with_backoff" : "gave_up" },
      status: recovered ? "success" : "failure",
    });
  }

  const submitOk = profile.outcome === "success" || (profile.outcome === "partial_failure" && rng() > 0.5);
  steps.push({
    step_id: stepId++,
    action: "submit_post",
    input: { title: draft.title, flair: subShort === "MachineLearning" ? "Research" : null },
    output: submitOk
      ? { post_id: `t3_${randomId(rng)}`, url: `https://reddit.com/${subreddit}/comments/${randomId(rng)}/`, upvotes_after_1min: rand(rng, 0, 12) }
      : { error: pick(["AUTOMOD_REMOVED", "RULE_VIOLATION", "SUBMISSION_BLOCKED", "ACCOUNT_RATE_LIMITED"], rng) },
    status: submitOk ? "success" : "failure",
  });

  const violations = [];
  if (!readRules) violations.push("did_not_read_rules");
  if (profile.content === "rule_violating" || profile.content === "spam") violations.push("self_promotion");
  if (profile.content === "off_topic") violations.push("off_topic");
  if (profile.content === "spam") violations.push("low_effort", "excessive_formatting");
  if (rng() < profile.violationProb * 0.3) violations.push("missing_flair");

  let finalOutcome = profile.outcome;
  if (profile.outcome === "success" && !submitOk) finalOutcome = "partial_failure";
  if (profile.outcome === "partial_failure" && !submitOk && retryCount >= 2) finalOutcome = "full_failure";

  return {
    session_id: `sess_${String(idx).padStart(4, "0")}_${randomId(rng)}`,
    timestamp: new Date(Date.UTC(2026, 4, 1 + (idx % 30), rand(rng, 0, 23), rand(rng, 0, 59))).toISOString(),
    subreddit,
    task_description: task,
    profile_tag: profile.name,
    steps,
    final_outcome: finalOutcome,
    metadata: {
      duration_seconds: rand(rng, 30, 720),
      retry_count: retryCount,
      rule_violations: [...new Set(violations)],
    },
  };
}

const lines = [];
for (let i = 0; i < 50; i++) lines.push(JSON.stringify(generateSession(i)));
fs.writeFileSync("sessions.jsonl", lines.join("\n") + "\n");

const byOutcome = {};
const byProfile = {};
for (const l of lines) {
  const s = JSON.parse(l);
  byOutcome[s.final_outcome] = (byOutcome[s.final_outcome] || 0) + 1;
  byProfile[s.profile_tag] = (byProfile[s.profile_tag] || 0) + 1;
}
console.log(`Wrote ${lines.length} sessions to sessions.jsonl`);
console.log("By outcome:", byOutcome);
console.log("By profile:", byProfile);
