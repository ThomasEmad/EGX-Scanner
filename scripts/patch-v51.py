#!/usr/bin/env python3
"""Patch provider v5.1 (thinking control) + analysis route (word budget)."""
import re, shutil, sys

# ---------- 1. provider.ts -> v5.1 ----------
P = "/tmp/my-project/src/lib/ai/provider.ts"
src = open(P).read()
if "v5.1" not in src:
    # history entry after the v5 block
    src = src.replace(
        "//   max_tokens (AI_MAX_TOKENS, default 8192) is now sent explicitly: NIM\n"
        "//   applies a small per-model output default and a truncated mid-JSON\n"
        "//   analysis is worse than a slower one.\n",
        "//   max_tokens (AI_MAX_TOKENS, default 8192) is now sent explicitly: NIM\n"
        "//   applies a small per-model output default and a truncated mid-JSON\n"
        "//   analysis is worse than a slower one.\n"
        "//   v5.1 (2026-11-07): latency. A/B on 40KB grounded prompts showed the\n"
        "//   NVIDIA reasoning phase delays first content 5-15s (5.3/13.6s ON vs\n"
        "//   1.5/2.4s OFF) while cutting useful output 3x in the same window.\n"
        "//   NVIDIA requests now send chat_template_kwargs {enable_thinking} per\n"
        "//   AI_THINKING (default off); the analysis route adds a word budget\n"
        "//   (AI_ANALYSIS_MAX_WORDS, default 600) because total time tracks the\n"
        "//   generated length (~150 tok/s), not the prompt size.\n",
    )
    # thinking control next to maxTokens
    src = src.replace(
        '  const maxTokens = Number(process.env.AI_MAX_TOKENS || "") || DEFAULT_MAX_TOKENS\n',
        '  const maxTokens = Number(process.env.AI_MAX_TOKENS || "") || DEFAULT_MAX_TOKENS\n'
        '  // v5.1: NVIDIA reasoning phase measured 5-15s of dead time on 40KB prompts\n'
        '  // before the first content byte; OFF makes the answer stream immediately.\n'
        '  const nvidiaThinking = (process.env.AI_THINKING || "off").trim().toLowerCase() === "on"\n',
    )
    src = src.replace(
        '          ...(baseUrl.includes("generativelanguage") ? { reasoning_effort: "low" } : {}),\n',
        '          ...(baseUrl.includes("generativelanguage") ? { reasoning_effort: "low" } : {}),\n'
        '          ...(baseUrl.includes("nvidia")\n'
        '            ? { chat_template_kwargs: { enable_thinking: nvidiaThinking } }\n'
        '            : {}),\n',
    )
    open(P, "w").write(src)
    print("provider.ts -> v5.1 OK")
else:
    print("provider.ts already v5.1")

# ---------- 2. analysis route: word budget ----------
R = "/tmp/my-project/src/app/api/v1/companies/[id]/ai-analysis/route.ts"
r = open(R).read()
if "AI_ANALYSIS_MAX_WORDS" not in r:
    r = r.replace(
        "const AI_TIMEOUT_MS = 100_000\n",
        "const AI_TIMEOUT_MS = 100_000\n"
        "// v5.1 speed cap: NVIDIA streams ~150 tok/s, so a sprawling 3-5k-token\n"
        "// report costs 50s+ end-to-end. A hard word budget keeps the report dense\n"
        "// and the request fast (600 words ≈ 20-30s). Set 0 to uncapped.\n"
        'const AI_MAX_WORDS = Number(process.env.AI_ANALYSIS_MAX_WORDS || "") || 600\n'
        "const LENGTH_BUDGET =\n"
        "  AI_MAX_WORDS > 0\n"
        '    ? `\\n\\nLength budget: the entire report must stay under ${AI_MAX_WORDS} words total — dense and numeric, every section tight, zero filler or repetition. This budget overrides any longer count implied by the section notes.`\n'
        "    : \"\"\n",
    )
    r = r.replace(
        'user: "Company data (JSON):\\n" + snapshotJson + (lang === "ar" ? AR_INSTRUCTION : EN_INSTRUCTION),',
        'user: "Company data (JSON):\\n" + snapshotJson + (lang === "ar" ? AR_INSTRUCTION : EN_INSTRUCTION) + LENGTH_BUDGET,',
    )
    open(R, "w").write(r)
    print("analysis route -> word budget OK")
else:
    print("analysis route already patched")

shutil.copy(P, "/home/z/my-project/scripts/patches/provider-v5.1.ts")
print("backup saved")
