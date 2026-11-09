/* Numbers shown on the page, synced with the final paper on 2026-11-05 (paper/isprs: main.tex, sec/*.tex):
   - stats, results, deltas: the table of reproduced methods (tab:main, test splits) and the UHR-Micro table
     (tab:umicro); 95% intervals of single accuracies are percentile bootstraps over questions (20,000 resamples),
     paired gains as printed in the paper
   - horizon curves: the crops.csv logs behind the horizon figure (paper/isprs/fig/make_horizon_fig.py), same bins
     and pooling
   - published results (XLRS-Bench, MME-RealWorld-RS): tab:published, all questions unless noted
   - UHR-Micro: tab:umicro, official metric
   - seconds per question: fig:cost (paper/isprs/fig/make_cost_fig.py), mean on one RTX 3090
   - limits: the results, ablation and failure-analysis sections of the paper
   - per-crop horizon data: static/data/horizon.js */
window.GS_DATA = {
  stats: [
    { v: "+16.3", t: "regional counting, XLRS-Bench RC, same frozen Qwen3-VL-8B" },
    { v: "+10.5", t: "object spatial relations, XLRS-Bench OSR" },
    { v: "+11.4", t: "counting, MME-RealWorld-RS" },
    { v: "+36.2", t: "regional counting, UHR-Micro" },
    { v: "71.82", t: "XLRS-Bench over all 3,080 questions, the highest reported, trained or not", alt: true }
  ],

  /* counting horizon: mean signed relative error by N-bin (single native view / recursive h=5); Qwen3-VL-8B pools
     both crop sets (960 crops), every other model has one set of 480 */
  bins: ["1–2", "3–5", "6–10", "11–20", "21–40", "41–80", "81–160", ">160"],
  binEdges: [[1, 2], [3, 5], [6, 10], [11, 20], [21, 40], [41, 80], [81, 160], [161, 1e9]],
  horizonModels: [
    { name: "Qwen3-VL-2B", native: [-0.01, -0.33, -0.36, -0.51, -0.60, -0.65, -0.75, -0.64],
      recursive_h5: [-0.01, -0.25, -0.23, -0.40, -0.40, -0.38, -0.48, -0.05] },
    { name: "Qwen3-VL-4B", native: [0.14, 0.04, -0.35, -0.42, -0.48, -0.52, -0.56, -0.75],
      recursive_h5: [0.21, 0.11, 0.14, -0.15, -0.21, -0.16, -0.29, -0.24] },
    { name: "Qwen3-VL-8B", native: [0.04, -0.14, -0.22, -0.33, -0.34, -0.16, -0.34, -0.57],
      recursive_h5: [0.09, -0.10, 0.07, -0.10, -0.05, 0.06, -0.10, -0.20], main: true },
    { name: "Qwen2.5-VL-7B", native: [0.51, -0.15, -0.37, -0.49, -0.50, -0.61, -0.63, -0.77],
      recursive_h5: [0.68, 0.01, -0.07, -0.22, -0.22, -0.35, -0.32, -0.42] },
    { name: "InternVL3.5-4B", native: [0.91, 0.09, -0.04, -0.18, -0.18, -0.28, -0.33, -0.49],
      recursive_h5: [1.00, 0.44, 0.11, 0.13, -0.02, -0.01, -0.11, -0.13] },
    { name: "InternVL3.5-8B", native: [1.27, 0.53, 0.03, -0.07, -0.11, -0.21, -0.38, -0.43],
      recursive_h5: [1.52, 1.38, 1.07, 0.31, 0.27, 0.03, 0.03, -0.05] },
    { name: "LLaVA-OV-7B", native: [0.57, 0.05, -0.27, -0.40, -0.52, -0.70, -0.76, -0.85],
      recursive_h5: [0.84, 0.38, 0.11, -0.01, -0.11, -0.20, -0.36, -0.39] },
    { name: "Qwen3-VL-32B (API)", native: [0.45, 0.01, -0.24, -0.32, -0.37, -0.46, -0.51, -0.63],
      recursive_h5: [0.51, 0.13, -0.21, -0.04, -0.21, -0.21, -0.33, -0.37], dashed: true }
  ],

  /* test-split accuracy (%) with 95% bootstrap interval; null: not run on that task */
  tasks: [
    { key: "RC", name: "Regional counting", n: 80 },
    { key: "OSR", name: "Spatial relations", n: 400 },
    { key: "MME", name: "MME-RS counting", n: 981 }
  ],
  results: {
    "8b": [
      { m: "Constant answer (an upper bound)", role: "faint", RC: [37.50, 27.5, 48.8], OSR: [30.25, 25.8, 34.8], MME: [31.50, 28.6, 34.5] },
      { m: "Zero-shot Qwen3-VL-8B", role: "base", RC: [47.50, 36.2, 58.8], OSR: [33.50, 29.0, 38.2], MME: [25.18, 22.5, 27.9] },
      { m: "WeaveEarth", role: "grey", RC: [45.00, 33.8, 56.2], OSR: [32.75, 28.2, 37.3], MME: [30.48, 27.6, 33.4] },
      { m: "GazeEarth", role: "grey3", RC: [47.50, 36.2, 58.8], OSR: [30.75, 26.2, 35.2], MME: [27.73, 25.0, 30.6] },
      { m: "RAP", role: "grey4", RC: null, OSR: null, MME: [30.38, 27.5, 33.3] },
      { m: "ZoomSearch (LLaVA-OV-7B)", role: "grey2", RC: [42.50, 31.2, 53.8], OSR: [32.50, 28.0, 37.2], MME: [31.50, 28.6, 34.5] },
      { m: "GeoScope", role: "ours", RC: [63.75, 52.5, 73.8], OSR: [44.00, 39.2, 49.0], MME: [36.60, 33.6, 39.7] }
    ],
    "llava": [
      { m: "Zero-shot LLaVA-OV-7B", role: "base", RC: [35.00, 25.0, 46.2], OSR: [25.00, 20.8, 29.2], MME: [32.31, 29.4, 35.4] },
      { m: "ZoomSearch", role: "grey2", RC: [42.50, 31.2, 53.8], OSR: [32.50, 28.0, 37.2], MME: [31.50, 28.6, 34.5] },
      { m: "GeoScope (LLaVA-OV-7B)", role: "ours", RC: [63.75, 53.8, 73.8], OSR: [31.00, 26.5, 35.8], MME: [34.56, 31.6, 37.6] }
    ],
    "4b": [
      { m: "Zero-shot Qwen3-VL-4B", role: "base", RC: [40.00, 30.0, 51.2], OSR: [26.50, 22.2, 30.8], MME: [14.27, 12.1, 16.5] },
      { m: "GeoScope (Qwen3-VL-4B)", role: "ours", RC: [60.00, 48.8, 71.2], OSR: [40.75, 36.0, 45.5], MME: [36.80, 33.8, 39.9] }
    ],
    "q25": [
      { m: "Zero-shot Qwen2.5-VL-7B", role: "base", RC: [41.25, 31.2, 52.5], OSR: [36.50, 31.8, 41.2], MME: [18.65, 16.2, 21.1] },
      { m: "GeoScope (Qwen2.5-VL-7B)", role: "ours", RC: [52.50, 41.2, 63.7], OSR: [40.25, 35.5, 45.2], MME: [34.45, 31.5, 37.4] }
    ]
  },
  /* paired gains over each method's own zero-shot backbone, with 95% intervals (tab:main) */
  deltas: {
    "8b": [
      { t: "RC", d: "+16.3", ci: "[+3.8, +28.7]", best: "ZoomSearch", d2: "+7.5", ci2: "[−2.5, +18.8]" },
      { t: "OSR", d: "+10.5", ci: "[+4.2, +16.8]", best: "ZoomSearch", d2: "+7.5", ci2: "[+3.2, +11.8]" },
      { t: "MME-RS counting", d: "+11.4", ci: "[+7.7, +15.1]", best: "WeaveEarth", d2: "+5.3", ci2: "[+2.5, +8.2]" }
    ],
    "llava": [
      { t: "RC", d: "+28.8", ci: "[+17.5, +40.0]", best: "ZoomSearch", d2: "+7.5", ci2: "[−2.5, +18.8]" },
      { t: "OSR", d: "+6.0", ci: "[+1.8, +10.2]", best: "ZoomSearch", d2: "+7.5", ci2: "[+3.2, +11.8]" },
      { t: "MME-RS counting", d: "+2.2", ci: "[−1.2, +5.9]", best: "ZoomSearch", d2: "−0.8", ci2: "[−4.4, +2.8]" }
    ],
    "4b": [
      { t: "RC", d: "+20.0", ci: "[+7.5, +32.5]" },
      { t: "OSR", d: "+14.3", ci: "[+8.8, +19.8]" },
      { t: "MME-RS counting", d: "+22.5", ci: "[+19.2, +25.9]" }
    ],
    "q25": [
      { t: "RC", d: "+11.3", ci: "[+1.2, +21.2]" },
      { t: "OSR", d: "+3.8", ci: "[−1.5, +9.2]" },
      { t: "MME-RS counting", d: "+15.8", ci: "[+12.4, +19.3]" }
    ]
  },

  /* published results on all questions (tab:published), values as printed there; null: not reported */
  xlrs: [
    { m: "GeoScope", note: "all questions, Qwen3-VL-8B", v: ["63.00", "46.40", "59.98", "71.82"], ours: true },
    { m: "GeoScope", note: "held-out 80%", v: ["63.75", "44.00", "59.53", "71.51"], ours: true },
    { m: "GeoScope", note: "all questions, Qwen2.5-VL-7B", v: ["51.00", "40.00", "56.39", "65.26"], ours: true },
    { m: "GazeEarth", note: "training-free, Qwen3-VL-8B", v: [null, "37.80", null, "53.51"], sep: true },
    { m: "WeaveEarth", note: "training-free, Qwen3-VL-8B", v: ["47.0", "36.40", "49.5", "47.14"] },
    { m: "ZoomSearch", note: "training-free, LLaVA-OV-7B", v: ["42.0", "32.2", "48.0", null] },
    { m: "Text-Before-Vision", note: "trained; mean of 32 sampled answers", v: [null, null, "60.40", null], sep: true },
    { m: "Text-Before-Vision", note: "trained; our re-run, one answer per question", v: ["40.00", "28.40", "50.54", "43.15"] },
    { m: "ScaleEarth", note: "trained, Qwen3-VL-8B; split not stated", v: ["54.3", "40.9", "59.4", null] },
    { m: "RS-OPSD", note: "trained (self-distilled), Qwen3-VL-8B", v: ["55.0", "29.2", "53.1", null] },
    { m: "UHR-BAT", note: "trained, LongVA-7B", v: ["33.0", "44.8", "48.6", "44.0"] },
    { m: "GeoVista", note: "trained, Qwen2.5-VL-7B", v: [null, "42.40", null, "50.65"] },
    { m: "GeoLens", note: "trained, Qwen2.5-VL-7B", v: ["40.0", "36.8", "54.2", null] },
    { m: "GeoEyes", note: "trained, Qwen2.5-VL-7B", v: ["40.0", "32.2", "54.2", null] }
  ],
  mme: [
    { m: "GeoScope", note: "all questions, Qwen3-VL-8B", v: ["74.46", "63.98", "37.93", "58.79"], ours: true },
    { m: "GeoScope", note: "held-out 80%", v: ["74.65", "63.55", "36.60", "58.26"], ours: true },
    { m: "ZoomSearch", note: "training-free, LLaVA-OV-7B", v: ["67.62", "66.14", "39.15", "57.64"], sep: true },
    { m: "RAP", note: "training-free, LLaVA-OV-7B; reported by ZoomSearch", v: ["57.62", "64.53", "40.25", "54.13"] },
    { m: "GazeEarth", note: "training-free, Qwen3-VL-8B", v: ["71.12", "63.67", "21.78", "52.19"] },
    { m: "WeaveEarth", note: "training-free, Qwen3-VL-8B", v: ["62.60", "51.39", "27.65", "47.21"] },
    { m: "ZoomEye", note: "training-free, LLaVA-OV-7B; reported by ZoomSearch", v: ["43.52", "60.88", "30.10", "44.83"] },
    { m: "RS-OPSD", note: "trained (self-distilled), Qwen3-VL-8B", v: ["76.8", "70.4", "37.4", "61.5"], sep: true },
    { m: "GeoLens", note: "trained; reported by GazeEarth", v: ["63.64", "53.23", "19.74", "45.54"] },
    { m: "ZoomEarth", note: "trained; reported by RS-OPSD", v: ["46.6", "41.9", "27.6", "38.7"] },
    { m: "GeoLLaVA-8K", note: "trained; reported by ZoomSearch", v: ["34.90", "27.92", "22.27", "28.36"] }
  ],
  /* UHR-Micro test (tab:umicro), official metric; GeoScope and our zero-shot re-runs, the rest reported by UHR-Micro */
  umicro: [
    { m: "GeoScope", note: "Qwen3-VL-8B", v: ["40.49", "49.34", "17.48", "100.00", "100.00"], ours: true },
    { m: "MAP", note: "training-free, Qwen3-VL-8B", v: ["36.87", "45.09", "24.21", "79.38", "67.92"] },
    { m: "Zero-shot", note: "Qwen3-VL-8B, our re-run", v: ["23.71", "13.13", "23.45", "65.63", "71.70"] },
    { m: "GeoScope", note: "InternVL3.5-8B", v: ["42.23", "58.77", "26.19", "100.00", "100.00"], ours: true, sep: true },
    { m: "MAP", note: "training-free, InternVL3.5-8B", v: ["43.19", "57.81", "30.86", "44.38", "38.36"] },
    { m: "Zero-shot", note: "InternVL3.5-8B, our re-run", v: ["33.99", "21.03", "26.31", "43.75", "37.11"] },
    { m: "HiDe", note: "training-free, Qwen2.5-VL-7B", v: ["40.95", "20.20", "40.84", "85.62", "41.51"], sep: true },
    { m: "Gemini-3.1-Pro", note: "zero-shot", v: ["36.67", "20.96", "31.91", "96.25", "84.28"] }
  ],

  /* mean seconds per question, MME-RS counting, one RTX 3090 (fig:cost) */
  efficiency: [
    { m: "Zero-shot", acc: 25.18, s: 2.8, role: "base" },
    { m: "WeaveEarth", acc: 30.48, s: 5.6, role: "grey" },
    { m: "GazeEarth", acc: 27.73, s: 16.0, role: "grey3" },
    { m: "GeoScope", acc: 36.60, s: 22.4, role: "ours" },
    { m: "ZoomSearch", acc: 31.50, s: 62.1, role: "grey2" },
    { m: "RAP", acc: 30.38, s: 400.1, role: "grey4" }
  ],

  limits: [
    { fig: "35.42 vs 37.50", sm: "XLRS-Bench overall counting", h: "Dozens of objects, options close together",
      p: "GeoScope lifts the zero-shot VLM from 10.42 to 35.42 but, like every method we ran, does not beat always picking the second-largest of the four numbers. Adjacent options lie about 17% apart, so a correct choice needs a count within about 8%; GeoScope's counts there are unbiased but scatter by 18% around the truth." },
    { fig: "−6.0 · −0.1", sm: "UHR-Micro conditional counting", h: "Places described in words",
      p: "Conditional counting does not improve with either backbone; both intervals include zero. Half of these questions ask for a fine-grained aircraft type such as A220. In the others the place is described in words, and when the program grounds the wrong place the count belongs to another region." },
    { fig: "+1.1", sm: "MME-RS counting, against numbers only", h: "Gains on the largest option",
      p: "Restricted to the numeric options, the backbone itself reaches 35.47. GeoScope is 1.1 points above it, which is not significant. It gains on the questions whose answer is the largest number offered, 58.1% against 7.2%, and not on the others, which mostly ask about five objects or fewer." },
    { fig: "86%", sm: "OSR, wrong answers", h: "Grounding the wrong object",
      p: "Of the wrong spatial-relation answers, 86% point more than 45 degrees away from the correct option, which correctly grounded referents would not produce. Perception limits accuracy more than program synthesis does." },
    { fig: "74.46 · 63.98", sm: "MME-RS position · colour", h: "Answered by the backbone",
      p: "GeoScope writes no programs for these two question types; the zero-shot answers of its backbone enter the MME-RealWorld-RS average." }
  ],

  /* pipeline examples: the few-shot examples from the synthesis prompts (not benchmark questions) */
  examples: {
    count: {
      q: "How many buses are parked in the parking lot to the right of the gray stadium?",
      opts: { A: "3", B: "6", C: "9", D: "12" }, pick: "B",
      program: '{"op": "count", "child":\n  {"op": "in_region",\n   "child": {"op": "detect", "cls": "bus"},\n   "region": {"op": "around", "child":\n     {"op": "filter",\n      "child": {"op": "detect", "cls": "parking lot"},\n      "pred": "RIGHT",\n      "anchor": {"op": "top1", "child":\n        {"op": "detect", "cls": "gray stadium"}}}}}}',
      checks: ["well-typed: count(Set) with a Region built from a place", "covers the question's constraints: \"gray\", \"parking lot\", \"right\""],
      steps: [
        ["ground(image, \"gray stadium\")", "coarse view of the whole image, then a native-resolution zoom confirms the box"],
        ["ground(right of stadium, \"parking lot\")", "the lot to the right of the anchor becomes the counting region"],
        ["count(lot, \"bus\") = 17", "above the horizon of 5: split into four views"],
        ["count(quarters) = 2 · 3 · 0 · 1", "all within the horizon; the zero comes from a native view, so it is kept"],
        ["total = 6", "the exact sum over accepted views"]
      ],
      answer: "Poisson projection of 6 onto the options picks B. The options are read only here, by their values."
    },
    relation: {
      q: "On the runway in the middle of the picture, in which direction is the white airplane located relative to the gray airplane?",
      opts: { A: "Upper left", B: "Directly above", C: "Right side", D: "Below" }, pick: "C",
      program: '{"op": "direction",\n "target": {"op": "refer", "expr": "the white airplane",\n            "cls": "white airplane", "plural": false,\n            "within": {"op": "refer",\n              "expr": "the runway in the middle of the picture",\n              "cls": "runway"}},\n "reference": {"op": "refer", "expr": "the gray airplane",\n               "cls": "gray airplane", "plural": false,\n               "within": <same runway>}}',
      checks: ["well-typed: direction(Set, Set), two distinct referents", "both referents share the container \"the runway in the middle\""],
      steps: [
        ["ground(image, \"the runway in the middle of the picture\")", "the place is large, so the whole-image view finds it"],
        ["ground(runway window, \"the gray airplane\")", "searched inside the runway's window, now at close to native resolution"],
        ["ground(runway window, \"the white airplane\")", "a candidate overlapping the reference is skipped"],
        ["direction matrix(white, gray)", "tiles set by the gray airplane's extent; the white one covers the east tiles"]
      ],
      answer: "The executed direction points right; cosine projection picks C."
    }
  }
};
