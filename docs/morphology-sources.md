# Where the bee's proportions come from

Input to `src/morphology.ts`. The two must agree: a value in the code that is
not in this table, or a source key that resolves to nothing here, is a bug.

Every number below is a published mean for **worker** *Apis mellifera*, in
millimetres. Queens and drones are measured by these papers too and are not used
— there is no reviewer trait a caste would express.

## Status of each source

| key | source | status |
|---|---|---|
| `pathania-2022` | Pathania A, Kumar A, Dhiman S (2022). Morphometrics of *Apis mellifera* in North-Western Himalayan region of Himachal Pradesh, India. *J. Entomol. Zool. Stud.* 10(3):105–109. [doi:10.22271/j.ento.2022.v10.i3b.8997](https://doi.org/10.22271/j.ento.2022.v10.i3b.8997) | **Read in full.** Tables 1–3 of the PDF, worker row. |
| `alkahtani-2021` | AL-Kahtani SN, Taha E-KA (2021). Morphometric study of Yemeni (*Apis mellifera jemenitica*) and Carniolan (*A. m. carnica*) honeybee workers in Saudi Arabia. *PLoS ONE* 16(2):e0247262. | **Read in full**, from the manuscript XML. **Carries an Expression of Concern** — see below. |
| `sharma-1990` | Sharma SK (1990). Biometric and developmental biology of *Apis mellifera* L. workers. M.Sc. thesis, Dept. of Entomology, HPKV, Palampur, India. | **Secondary.** Unpublished thesis, not opened. Values read from the discussion of `pathania-2022`, in the PDF, by eye. |

### The Expression of Concern on `alkahtani-2021`

PLOS issued an Expression of Concern in April 2023. It concerns **authorship and
competing interests**, the integrity of peer review, and the article's
contribution given its study design. PLOS states the evidence pertaining to this
article was **inconclusive**. The article is not retracted, and no concern was
raised about the measurements themselves.

It is used anyway, and the flag is recorded in `SOURCES` in the code rather than
only here, so it travels with the number. The reasoning: an inconclusive concern
about authorship is not evidence that a wing was mismeasured, and the
alternative is no citation at all, which is strictly worse. Anyone who disagrees
should drop the key — the wing characters then lose their ranges and stop
varying, which the design already handles.

## The table

| character | mm | range | sources | note |
|---|---|---|---|---|
| headHeight | 2.45 | 2.45 – 3.19 | `pathania-2022`, `sharma-1990` | high end is Sharma's 3.19 |
| headWidth | 3.62 | 3.62 – 3.78 | `pathania-2022`, `sharma-1990` | high end is Sharma's 3.78 |
| thoraxLength | 3.72 | — | `pathania-2022` | **does not vary** — see below |
| abdomenLength | 6.63 | — | `pathania-2022` | **does not vary** — see below |
| forewingLength | 9.27 | 7.94 – 9.27 | `pathania-2022`, `alkahtani-2021` | low end is *jemenitica* 7.94; *carnica* is 9.14 |
| forewingWidth | 2.98 | 2.44 – 3.53 | `pathania-2022`, `alkahtani-2021` | 2.44 *jemenitica*, 3.53 *carnica* |
| hindwingLength | 6.20 | 5.85 – 6.74 | `pathania-2022`, `alkahtani-2021` | 5.85 *jemenitica*, 6.74 *carnica* |
| hindwingWidth | 1.82 | 1.67 – 2.21 | `pathania-2022`, `alkahtani-2021` | 1.67 *jemenitica*, 2.21 *carnica* |

The wing ranges are spans between two *subspecies* of *A. mellifera*, which is
what makes them defensible as bounds: every value inside is a bee somebody
measured, and both ends are a named subspecies rather than an error bar.

## Two claims from the spec, withdrawn on verification

**`dyer-seeley-1987`, forewing 7.64–9.70 — dropped.** The spec took this from
the discussion of `pathania-2022`, which reads: "Dyer & Seeley (1987) reported
the fore-wing length in *A. mellifera* of different altitudes between 7.64 to
9.70mm." The cited paper is *Interspecific comparisons of endothermy in
honey-bees (Apis)*, J Exp Biol 127:1–26 — a comparison of thoracic temperature
across four *Apis* **species**, not a study of *A. mellifera* across altitudes.
Its full text is paywalled, so the attribution could not be settled either way.

Not thrown out for being unreachable, which would be no evidence at all. Thrown
out because the subject of the cited paper does not match the claim attributed
to it, and because `alkahtani-2021` now supplies a forewing range that was read
first-hand. A doubtful citation carrying the widest range in the system is
exactly the thing this file exists to catch.

**`ruttner-2013`, forewing 9.33 — dropped.** Also read second-hand, also a
source that could not be opened, and it moves the forewing maximum by 0.6%. It
bought nothing that would justify a third unverified number.

## Thorax and abdomen: the search that did not settle them

The spec predicted these two might not vary, and they do not. But the reason is
sharper than "no second measurement exists" — one exists and could not be read.

**The candidate.** Ibrahim MM, Chandel YS, Anil A (2017). *Morphometrics of Apis
mellifera after Five Decades of its Introduction in North-Western Himalayan
Region of India.* Pakistan J. Zool. 49(4):1397–1403,
[doi:10.17582/journal.pjz/2017.49.4.1397.1403](https://doi.org/10.17582/journal.pjz/2017.49.4.1397.1403).
Reported as thorax length 4.26, abdomen length 5.91, head 3.19 × 3.68, forewing
9.13 × 3.00.

**Why it is not in the table.** Those numbers were seen only in search-engine
summaries. Semantic Scholar holds no abstract for the DOI, and the publisher
(researcherslinks.com) returns 403 to automated requests, including for the
PDF — despite the record being marked CC-BY. Encoding a measurement read from a
search summary would put the weakest evidence in the system underneath the
largest mass in the silhouette.

**How to promote it.** Open the article by hand in a browser and read Table 1.
If thorax 4.26 and abdomen 5.91 are confirmed, add `ibrahim-2017` to `SOURCES`,
give `thoraxLength` the range 3.72–4.26 and `abdomenLength` the range
5.91–6.63, and the two largest parts of the bee begin to vary with no other
change.

**A caution to carry if it is promoted.** `pathania-2022` and this paper report
*identical* ± terms across every shared character — 0.10, 0.09, 0.06, 0.20,
0.93, 0.18, 0.08 — against different means. Same region, same method, same
pooled error: they are two publications, but not two independent measurements.
The range would still be a real span between two published means, and that
weaker independence should be stated where it is used.

## Searches run, including the ones that found nothing

Recorded so that "no second measurement is available" is a finding rather than a
shrug, and so the next attempt does not repeat them.

```
Apis mellifera worker morphometric characters mean standard deviation head width thorax width forewing length Ruttner
honey bee worker body measurements mm head width thorax width abdomen length forewing length table
"Apis mellifera" worker morphometry "head width" "thorax width" "abdomen length" mean SD open access study
"Apis mellifera" worker morphometrics "abdomen length" "thorax length" mm mean Nigeria OR Syria OR Ethiopia study table
MDPI Insects OR "Journal of Apicultural Research" Apis mellifera worker morphometric "abdomen length" "thorax length" mean mm open access
Ibrahim Chandel 2017 "Pakistan Journal of Zoology" 49 1397 Morphometrics Apis mellifera five decades pdf full text
Dyer Seeley 1987 "Interspecific comparisons of endothermy in honey-bees" Journal of Experimental Biology 127 forewing length Apis mellifera
```

Sources that exist and could not be opened: Pakistan J. Zool. 49(4) (403);
ResearchGate copies of the Kwara State, Nigeria study and the Kashmir altitude
study (403); PMC article pages (reCAPTCHA); J Exp Biol 127 full text (paywall).
Three of these measure thorax and abdomen and would settle the question.

## What is not measured at all

`thoraxWidth` and `abdomenWidth`. No source here records either, and they are
the two widest parts of the drawing. They live in `body.ts` as `DRAWING`
conventions, expressed as a fraction of the measured length, and are marked
there as not measured. They are not in this file because this file is for
measurements.
