# GeoScope: Training-Free Program Execution beyond the Counting Horizon for Ultra-High-Resolution Remote Sensing Question Answering

[![Paper](https://img.shields.io/badge/Paper-arXiv%3A2611.12699-red)](https://arxiv.org/abs/2611.12699)
[![Project Page](https://img.shields.io/badge/Project-Page-blue)](https://avalon-s.github.io/GeoScope/)
![Code](https://img.shields.io/badge/Code-on%20publication-lightgrey)

Guohui Deng\*†, Yuhang Jiang\*, Chengjun Wang, Zhongwen Hu, Zhaocong Wu, Linsheng Huang, Jinling Zhao, Chao Ruan,
Miaozhong Xu, Chi Chen

\* Equal contribution · † Corresponding author

## Overview

In ultra-high-resolution (UHR) remote sensing images, the objects that a question counts or relates by direction
often span only a few pixels. We measure frozen vision–language models (VLMs) as one calibrates a sensor: all eight
open VLMs we test count a view with little bias only up to a certain number of objects, about five for most models on
DOTA aerial images, and fall increasingly short beyond it. We call this range the **counting horizon**. It narrows as
views grow and objects appear smaller.

GeoScope uses the VLM only within that range. A text-only language model writes the question as a typed spatial
program; a deterministic executor chooses every view and its resolution, asks the frozen VLM only to ground and count
in it, splits views counted beyond the horizon and computes directions from the grounded boxes. Nothing is trained.

## Results

Gain over the same frozen backbone (Qwen3-VL-8B), paired on held-out test questions:

| Benchmark | Task | Gain (points) |
|---|---|---|
| XLRS-Bench | Regional counting | +16.3 |
| XLRS-Bench | Object spatial relationship | +10.5 |
| MME-RealWorld (remote sensing) | Counting | +11.4 |
| UHR-Micro | Global counting | +16.8 |
| UHR-Micro | Regional counting | +36.2 |

On XLRS-Bench, GeoScope has the highest reported accuracy on regional counting and on the whole benchmark by question,
trained methods included. Details, ablations, reproduced baselines and failure cases are in the paper and its
Supplementary Material.

## Repository

- `docs/` — the project page, served by GitHub Pages.
- The code, prompts and evaluation scripts will be released here when the paper is published.

## Citation

```bibtex
@misc{deng2026geoscope,
  title         = {GeoScope: Training-Free Program Execution beyond the Counting Horizon
                   for Ultra-High-Resolution Remote Sensing Question Answering},
  author        = {Deng, Guohui and Jiang, Yuhang and Wang, Chengjun and Hu, Zhongwen and
                   Wu, Zhaocong and Huang, Linsheng and Zhao, Jinling and Ruan, Chao and Xu, Miaozhong and Chen, Chi},
  year          = {2026},
  eprint        = {2611.12699},
  archivePrefix = {arXiv},
  primaryClass  = {cs.CV},
  url           = {https://arxiv.org/abs/2611.12699}
}
```

## Acknowledgements

We thank the authors of XLRS-Bench, MME-RealWorld, UHR-Micro, DOTA, FAIR1M, DIOR and VisDrone for releasing their
benchmarks and datasets. The example crops on the project page come from these benchmarks and remain under their
licences.
