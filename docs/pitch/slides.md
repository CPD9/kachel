---
marp: true
size: 16:9
paginate: false
title: Kachel
description: Your AI heats your home. Two slides for the DigitalHeat pitch.
# Display font: Anton, SIL Open Font License 1.1, from Google Fonts. Text: the system sans.
style: |
  @import url("https://fonts.googleapis.com/css2?family=Anton&display=swap");
  :root { --sun: #ffb347; --ember: #ff6a3d; --dusk: #c2367a; --night: #2a1446; --ink: #fff6ea; }
  section {
    font-family: "Helvetica Neue", Arial, "Liberation Sans", sans-serif;
    background: linear-gradient(160deg, #3a1850 0%, #1a0f2e 55%, #0e0a1c 100%);
    color: var(--ink);
    padding: 52px 64px;
    font-size: 30px;
    line-height: 1.3;
  }
  h1, h2 {
    font-family: "Anton", Impact, sans-serif;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.01em;
    line-height: 0.95;
    margin: 0;
  }
  h1 {
    font-size: 150px;
    background: linear-gradient(180deg, #ffe08a 0%, var(--sun) 35%, var(--ember) 70%, var(--dusk) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 6px 0 #1a0f2e) drop-shadow(0 10px 18px rgba(0,0,0,0.6));
  }
  h2 { font-size: 54px; color: var(--sun); text-shadow: 0 4px 0 #1a0f2e; margin: 0 0 14px; }
  ul + h2 { margin-top: 26px; }
  strong { color: var(--sun); }
  ul { margin: 0; padding-left: 1em; }
  li { margin: 0 0 12px; }
  .src { color: #d9c9d6; font-size: 18px; }
  .tag {
    display: inline-block; font-weight: 800; font-size: 34px;
    background: var(--ink); color: #1a0f2e; padding: 6px 18px; transform: rotate(-2deg);
    box-shadow: 6px 6px 0 var(--ember);
  }
  .credit { position: absolute; bottom: 16px; left: 64px; color: #f0e6e0; font-size: 15px; text-shadow: 0 1px 4px #000; }

  /* Title: sunset poster with a slot for the Kachi hero poster on the right. */
  .shade { position: absolute; inset: -4px; z-index: 0; }
  section > *:not(.shade) { position: relative; z-index: 1; }
  section.title .shade { background: linear-gradient(180deg, rgba(255,140,60,0.30) 0%, rgba(194,54,122,0.30) 45%, rgba(14,10,28,0.80) 100%); }
  section.title .credit { position: absolute; }
  section.title {
    display: grid; grid-template-columns: 1.35fr 1fr; gap: 36px; align-items: center;
  }
  .hero {
    height: 560px; border: 6px solid var(--ink); border-radius: 6px; overflow: hidden;
    box-shadow: 14px 14px 0 var(--ember), 0 20px 40px rgba(0,0,0,0.6); transform: rotate(2deg);
    background: #1a0f2e;
  }
  .hero p { margin: 0; height: 100%; }
  .hero img { width: 100%; height: 100%; object-fit: cover; display: block; }

  /* Slide 1: loading-screen look over the plant room. */
  section.load .shade { background: linear-gradient(90deg, rgba(26,15,46,0.96) 0%, rgba(26,15,46,0.9) 50%, rgba(194,54,122,0.25) 75%, rgba(255,140,60,0.15) 100%); }
  section.load .col { width: 58%; }

  /* Slide 2: numbers as poster tiles. */
  .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin: 6px 0 20px; }
  .kpi {
    background: rgba(255,246,234,0.07); border-left: 8px solid var(--ember);
    padding: 12px 18px; box-shadow: 0 8px 20px rgba(0,0,0,0.35);
  }
  .kpi b { display: block; font-family: "Anton", Impact, sans-serif; font-weight: 400; font-size: 60px; line-height: 1.05; color: var(--sun); }
  .kpi span { display: block; font-size: 21px; }
  .kpi i { display: block; font-style: normal; font-size: 16px; color: #d9c9d6; margin-top: 4px; }
  .ask { font-size: 26px; }
---

<!-- _class: title -->

![bg](../media/skyline-dusk.webp)

<div class="shade"></div>

<div>

# Kachel

<span class="tag">Your AI heats your home.</span>

</div>

<!-- Kachi hero poster slot: swap this image for the Blender poster once it lands. -->
<div class="hero">

![A close-up of one server in the rack](../media/server-closeup-34.webp)

</div>

<div class="credit">Basel at dusk. Buildings © swisstopo (swissBUILDINGS3D 3.0, 2024 edition)</div>

---

<!-- _class: load -->

![bg](../images/plantroom.webp)

<div class="shade"></div>

<div class="col">

## The problem

- Basel-Stadt voted for **net zero by 2037**. <span class="src">[8]</span>
- Data centres used **415 TWh** in 2024, about **1.5%** of world electricity. Their heat is cooled away. <span class="src">[7]</span>
- Homes still burn oil and gas for heat.

## The idea

Servers in the basement run AI jobs **only when the house can use their heat**: space heating and hot water.

<div class="src">[7] IEA, Energy and AI (2025). [8] SRF, 27 Nov 2022. Both listed in docs/economics/README.md.</div>

</div>

---

## One Basel house. Six servers. One year.

<div class="kpis">
<div class="kpi"><b>79.6%</b><span>of the heat demand covered</span><i>kpis.json</i></div>
<div class="kpi"><b>31,075</b><span>server-hours sold</span><i>kpis.json</i></div>
<div class="kpi"><b>0.188 CHF</b><span>break-even per server-hour</span><i>kpis.json</i></div>
<div class="kpi"><b>9,683 CHF</b><span>left a year before hardware</span><i>summary.json</i></div>
<div class="kpi"><b>1,415 CHF</b><span>left a year after hardware, mid case</span><i>summary.json</i></div>
<div class="kpi"><b>4.2 years</b><span>payback, mid case</span><i>summary.json</i></div>
</div>

<div class="ask">

**Model:** the buyer pays per server-hour (we assume 0.50 CHF), the home gets the heat.
**Ask:** a Basel building for a pilot, buyers of compute that can pause, and a fitter's quote.

</div>

<div class="src">Six 1 kW servers, Basel 2025 weather (Open-Meteo). kpis.json: services/scheduler/out. summary.json: docs/economics/data. The 0.50 CHF is our assumption.</div>
