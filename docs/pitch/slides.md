---
marp: true
size: 16:9
paginate: false
title: Kachel
description: Your AI heats your home. Two slides for the DigitalHeat pitch.
style: |
  section {
    font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
    background: #12141a;
    color: #f2efe9;
    padding: 56px 64px;
    font-size: 30px;
    line-height: 1.3;
  }
  h1 { color: #f2efe9; font-size: 64px; margin: 0 0 12px; line-height: 1.1; }
  h2 { color: #f0a050; font-size: 32px; margin: 0 0 18px; }
  ul + h2 { margin-top: 30px; }
  strong { color: #f0a050; }
  ul { margin: 0; padding-left: 1em; }
  li { margin: 0 0 14px; }
  .src { color: #a9a39a; font-size: 18px; }
  .credit { position: absolute; bottom: 18px; left: 64px; color: #e6e1d8; font-size: 16px; text-shadow: 0 1px 4px #000, 0 0 2px #000; }
  .two { display: grid; grid-template-columns: 1.15fr 1fr; gap: 40px; align-items: center; }
  .two img { width: 100%; border-radius: 10px; display: block; }
  .two figcaption, .cap { color: #a9a39a; font-size: 16px; margin-top: 6px; }
  section.title { display: flex; flex-direction: column; justify-content: flex-start; padding-top: 40px; }
  section.title h1 { font-size: 96px; }
  section.title p { font-size: 40px; margin: 0; }
  .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin: 4px 0 22px; }
  .kpi { background: #1e222b; border-radius: 10px; padding: 14px 18px; }
  .kpi b { display: block; font-size: 46px; color: #f0a050; line-height: 1.1; }
  .kpi span { display: block; font-size: 21px; color: #f2efe9; }
  .kpi i { display: block; font-style: normal; font-size: 16px; color: #a9a39a; margin-top: 4px; }
  .ask { font-size: 26px; }
---

<!-- _class: title -->

![bg brightness:0.75](../media/skyline-dusk.webp)

# Kachel

Your AI heats your home.

<div class="credit">Basel at dusk. Buildings © swisstopo (swissBUILDINGS3D 3.0, 2024 edition)</div>

---

<div class="two">
<div>

## The problem

- Basel-Stadt voted for **net zero by 2037**. <span class="src">[8]</span>
- Data centres used **415 TWh** in 2024, about **1.5%** of world electricity. Their heat is cooled away. <span class="src">[7]</span>
- Homes still burn oil and gas for heat.

## The idea

Servers in the basement run AI jobs **only when the house can use their heat**: space heating and hot water.

</div>
<div>

![A basement plant room: server rack, plate heat exchanger and hot-water tank](../images/plantroom.webp)

<div class="cap">The plant room: rack, heat exchanger, tank.</div>
</div>
</div>

<div class="src">[7] IEA, Energy and AI (2025). [8] SRF, 27 Nov 2022. Both listed in docs/economics/README.md.</div>

---

## One Basel house, six 1 kW servers, one year

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

<div class="src">Basel 2025 weather (Open-Meteo). kpis.json: services/scheduler/out. summary.json: docs/economics/data. The 0.50 CHF is our assumption.</div>
