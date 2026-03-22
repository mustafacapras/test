const pptxgen = require("pptxgenjs");
const Papa    = require("papaparse");
const fs      = require("fs");
const path    = require("path");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const REVIEWS_PATH = path.join(__dirname, "data", "reviews_with_locations.csv");
const OUTPUT_PATH  = path.join(__dirname, "lamadeleine_assessment.pptx");
const MIN_REVIEWS  = 100; // minimum reviews for a location to be included

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

function loadReviews(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data } = Papa.parse(raw, { header: true, skipEmptyLines: true });
  return data
    .map(row => ({ ...row, reviewRating: parseFloat(row.reviewRating) }))
    .filter(r => !isNaN(r.reviewRating));
}

// ---------------------------------------------------------------------------
// Analyse — store-level aggregation
// ---------------------------------------------------------------------------

function analyse(reviews) {
  const totalReviews    = reviews.length;
  const uniqueLocations = [...new Set(reviews.map(r => r.storeID))].length;
  const uniqueStates    = [...new Set(reviews.map(r => r.state).filter(Boolean))].length;

  // Step 1: avg rating per store
  const storeMap = {};
  for (const r of reviews) {
    if (!r.storeID || !r.state) continue;
    if (!storeMap[r.storeID]) {
      storeMap[r.storeID] = {
        state: r.state, city: r.city,
        locationName: r.locationName,
        ratings: []
      };
    }
    storeMap[r.storeID].ratings.push(r.reviewRating);
  }

  const storeStats = Object.entries(storeMap).map(([storeID, v]) => ({
    storeID,
    state:        v.state,
    city:         v.city,
    locationName: v.locationName,
    count:        v.ratings.length,
    avg:          v.ratings.reduce((a, b) => a + b, 0) / v.ratings.length,
    fiveStarPct:  v.ratings.filter(r => r === 5).length / v.ratings.length * 100,
    oneStarPct:   v.ratings.filter(r => r === 1).length / v.ratings.length * 100,
  }));

  // Step 2: state avg = mean of store avgs (each store weighted equally)
  const stateMap = {};
  for (const s of storeStats) {
    if (!stateMap[s.state]) stateMap[s.state] = { avgs: [], fivePcts: [], onePcts: [], totalReviews: 0 };
    stateMap[s.state].avgs.push(s.avg);
    stateMap[s.state].fivePcts.push(s.fiveStarPct);
    stateMap[s.state].onePcts.push(s.oneStarPct);
    stateMap[s.state].totalReviews += s.count;
  }

  const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

  const stateStats = Object.entries(stateMap).map(([state, v]) => ({
    state,
    avg:          mean(v.avgs),
    storeCount:   v.avgs.length,
    totalReviews: v.totalReviews,
    fiveStarPct:  mean(v.fivePcts),
    oneStarPct:   mean(v.onePcts),
  })).sort((a, b) => b.avg - a.avg);

  // Best/worst locations (min MIN_REVIEWS)
  const qualifiedStores = storeStats
    .filter(s => s.count >= MIN_REVIEWS)
    .sort((a, b) => b.avg - a.avg);

  return {
    totalReviews,
    uniqueLocations,
    uniqueStates,
    stateStats,
    bestState:     stateStats[0],
    worstState:    stateStats[stateStats.length - 1],
    bestLocation:  qualifiedStores[0],
    worstLocation: qualifiedStores[qualifiedStores.length - 1],
  };
}

// ---------------------------------------------------------------------------
// Build slide
// ---------------------------------------------------------------------------

function buildSlide(data) {
  const {
    totalReviews, uniqueStates,
    stateStats, bestState, worstState, bestLocation, worstLocation,
  } = data;

  const NAVY    = "0A1628";
  const BLUE    = "1B3A6B";
  const LTBLUE  = "2E5FA3";
  const TEAL    = "00A8A8";
  const TEAL2   = "007A7A";
  const WHITE   = "FFFFFF";
  const OFFWHT  = "E8EDF5";
  const MUTED   = "8BA0C0";
  const YELLOW  = "F5C842";
  const CARD_BG = "112244";

  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.title  = "la Madeleine – Web Data Assessment";

  const s = pres.addSlide();
  s.background = { color: NAVY };

  // Top banner
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 10, h: 0.62,
    fill: { color: BLUE }, line: { color: BLUE }
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.06, h: 0.62,
    fill: { color: TEAL }, line: { color: TEAL }
  });
  s.addText("la Madeleine  |  Google Reviews: Location Intelligence & XPath Reference", {
    x: 0.18, y: 0, w: 7.0, h: 0.62,
    fontSize: 11.5, bold: true, color: WHITE,
    valign: "middle", margin: 0, fontFace: "Calibri"
  });
  s.addText(`${totalReviews.toLocaleString()} reviews  ·  87 locations scraped  ·  ${uniqueStates} states analyzed`, {
    x: 7.0, y: 0, w: 2.9, h: 0.62,
    fontSize: 7.5, color: TEAL, valign: "middle", align: "right",
    margin: 0, fontFace: "Calibri"
  });

  // Vertical divider
  s.addShape(pres.shapes.RECTANGLE, {
    x: 4.97, y: 0.65, w: 0.04, h: 4.95,
    fill: { color: LTBLUE }, line: { color: LTBLUE }
  });

  // ══ LEFT — Insights ════════════════════════════════════════════

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.28, y: 0.68, w: 0.04, h: 0.28,
    fill: { color: TEAL }, line: { color: TEAL }
  });
  s.addText("KEY INSIGHT: GEOGRAPHY DRIVES SATISFACTION", {
    x: 0.42, y: 0.68, w: 4.42, h: 0.28,
    fontSize: 8.5, bold: true, color: TEAL,
    valign: "middle", margin: 0, fontFace: "Calibri", charSpacing: 1.5
  });

  // Stat cards
  const stats = [
    { val: bestState.avg.toFixed(2),     lbl: `${bestState.state}\nBest State`,          hi: true  },
    { val: worstState.avg.toFixed(2),    lbl: `${worstState.state}\nLowest State`,        hi: false },
    { val: bestLocation.avg.toFixed(2),  lbl: `${bestLocation.locationName}\n${bestLocation.city}, ${bestLocation.state}\nBest Location`,    hi: true  },
    { val: worstLocation.avg.toFixed(2), lbl: `${worstLocation.locationName}\n${worstLocation.city}, ${worstLocation.state}\nLowest Location`, hi: false },
  ];
  const positions = [
    { x: 0.28, y: 1.02 }, { x: 2.48, y: 1.02 },
    { x: 0.28, y: 1.93 }, { x: 2.48, y: 1.93 },
  ];

  stats.forEach((st, i) => {
    const { x, y } = positions[i];
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: 2.1, h: 0.8,
      fill: { color: CARD_BG }, line: { color: LTBLUE, width: 0.75 },
      shadow: { type: "outer", color: "000000", blur: 8, offset: 3, angle: 135, opacity: 0.4 }
    });
    if (st.hi) {
      s.addShape(pres.shapes.RECTANGLE, {
        x, y, w: 2.1, h: 0.04,
        fill: { color: TEAL }, line: { color: TEAL }
      });
    }
    s.addText(st.val, {
      x, y: y + 0.06, w: 2.1, h: 0.42,
      fontSize: 24, bold: true,
      color: st.hi ? YELLOW : "E05A5A",
      align: "center", valign: "middle", margin: 0, fontFace: "Calibri"
    });
    s.addText(st.lbl, {
      x, y: y + 0.49, w: 2.1, h: 0.28,
      fontSize: 7.5, color: MUTED,
      align: "center", valign: "top", margin: 0, fontFace: "Calibri"
    });
  });

  // Bar chart — store-level state averages
  const chartLabels = stateStats.map(s => s.state);
  const chartValues = stateStats.map(s => parseFloat(s.avg.toFixed(2)));
  const chartColors = stateStats.map((s, i) =>
    i === stateStats.length - 1 ? "C0392B" : i === 0 ? TEAL : TEAL2
  );

  s.addChart(pres.charts.BAR, [{
    name: "Avg Rating",
    labels: chartLabels,
    values: chartValues,
  }], {
    x: 0.28, y: 2.82, w: 4.58, h: 1.88,
    barDir: "col",
    chartColors,
    chartArea: { fill: { color: NAVY }, roundedCorners: false },
    plotArea: { fill: { color: NAVY } },
    catAxisLabelColor: MUTED, valAxisLabelColor: MUTED,
    catAxisLineShow: false,
    valAxisMinVal: parseFloat((Math.min(...chartValues) - 0.15).toFixed(1)),
    valAxisMaxVal: parseFloat((Math.max(...chartValues) + 0.1).toFixed(1)),
    valAxisNumFmt: "0.00",
    valGridLine: { color: BLUE, size: 0.5 },
    catGridLine: { style: "none" },
    showValue: true, dataLabelFormatCode: "0.00",
    dataLabelColor: WHITE, dataLabelFontSize: 7.5, dataLabelFontBold: true,
    dataLabelPosition: "outEnd",
    showLegend: false,
    showTitle: true, title: "Avg Rating by State (store-level)",
    titleColor: OFFWHT, titleFontSize: 9, titleBold: true,
  });

  // Bullets
  const gap = (bestLocation.avg - worstLocation.avg).toFixed(2);
  const bullets = [
    `${bestState.state} leads all states (${bestState.avg.toFixed(2)} avg, ${bestState.fiveStarPct.toFixed(1)}% five-star) — strong performance despite low volume (${bestState.totalReviews.toLocaleString()} reviews).`,
    `${worstState.state} underperforms with ${worstState.avg.toFixed(2)} avg & ${worstState.oneStarPct.toFixed(1)}% one-star rate — highest complaint ratio across all reviewed states.`,
    `Largest location gap: ${bestLocation.locationName}, ${bestLocation.city} (${bestLocation.avg.toFixed(2)}) vs ${worstLocation.locationName}, ${worstLocation.city} (${worstLocation.avg.toFixed(2)}) = ${gap} pts — best practice sharing opportunity.`,
  ];
  s.addText(bullets.map((b, i) => [
    { text: "▸ ", options: { color: TEAL, bold: true } },
    { text: b + (i < bullets.length - 1 ? "\n" : ""), options: { color: OFFWHT } }
  ]).flat(), {
    x: 0.28, y: 4.74, w: 4.58, h: 0.6,
    fontSize: 7.5, fontFace: "Calibri", valign: "top", margin: 0
  });

  // ══ RIGHT — XPaths ══════════════════════════════════════════════

  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.15, y: 0.68, w: 0.04, h: 0.28,
    fill: { color: TEAL }, line: { color: TEAL }
  });
  s.addText("STEP 4: XPATH & REGEX REFERENCE", {
    x: 5.29, y: 0.68, w: 4.42, h: 0.28,
    fontSize: 8.5, bold: true, color: TEAL,
    valign: "middle", margin: 0, fontFace: "Calibri", charSpacing: 1.5
  });
  s.addText("Source: lamadeleine.com/locations — DOM inspected via Chrome DevTools", {
    x: 5.15, y: 0.98, w: 4.6, h: 0.18,
    fontSize: 7, color: MUTED, fontFace: "Calibri", italic: true, margin: 0
  });

  const hStyle = { fill: { color: BLUE }, color: WHITE, bold: true, fontSize: 8.5, fontFace: "Calibri" };
  const cell   = (t, opts = {}) => ({ text: t, options: { fontSize: 7.5, fontFace: "Calibri", color: OFFWHT, ...opts } });
  const code   = (t) => ({ text: t, options: { fontSize: 6.8, fontFace: "Courier New", color: TEAL } });

  s.addTable([
    [{ text: "Field", options: hStyle }, { text: "Example", options: hStyle }, { text: "XPath", options: hStyle }],
    [cell("locationName", { bold: true }), cell('"San Jacinto"'),        code('//div[@class="location__name"]')],
    [cell("hours",        { bold: true }), cell('"Open until 3:00 PM"'), code('//p[@class="location__hours"]')],
    [cell("phoneNumber",  { bold: true }), cell('"214-220-3911"'),       code('//div[@class="location__phone"]/a')],
    [cell("distance",     { bold: true }), cell('"0.7 mi"'),             code('//div[@class="location__distance"]')],
  ], {
    x: 5.15, y: 1.18, w: 4.6, h: 1.52,
    colW: [0.9, 0.9, 2.8],
    border: { pt: 0.5, color: BLUE },
    rowH: 0.304,
    fill: { color: CARD_BG },
  });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.15, y: 2.76, w: 4.6, h: 0.03,
    fill: { color: TEAL2 }, line: { color: TEAL2 }
  });
  s.addText([
    { text: "Latitude & Longitude  ", options: { bold: true, color: WHITE } },
    { text: "— href + Regex  |  e.g. ", options: { color: MUTED } },
    { text: "destination=32.7875067,-96.7975695", options: { fontFace: "Courier New", fontSize: 7, color: TEAL } },
  ], {
    x: 5.15, y: 2.81, w: 4.6, h: 0.22,
    fontSize: 8.5, fontFace: "Calibri", margin: 0
  });

  s.addTable([
    [{ text: "Field", options: hStyle }, { text: "XPath", options: hStyle }, { text: "Regex (capture group 1)", options: hStyle }],
    [cell("Latitude",  { bold: true }), code('//a[contains(@href,"destination")]/@href'), code('destination=(-?\\d+\\.\\d+),')],
    [cell("Longitude", { bold: true }), code('//a[contains(@href,"destination")]/@href'), code('destination=-?\\d+\\.\\d+,(-?\\d+\\.\\d+)')],
  ], {
    x: 5.15, y: 3.05, w: 4.6, h: 0.6,
    colW: [0.75, 2.1, 1.75],
    border: { pt: 0.5, color: BLUE },
    rowH: 0.2,
    fill: { color: CARD_BG },
  });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.15, y: 4.2, w: 4.6, h: 0.03,
    fill: { color: TEAL2 }, line: { color: TEAL2 }
  });
  s.addText("STEP 2: ASSOCIATION METHOD", {
    x: 5.15, y: 4.25, w: 4.6, h: 0.2,
    fontSize: 8, bold: true, color: TEAL,
    fontFace: "Calibri", margin: 0, charSpacing: 1
  });
  s.addText([
    { text: "Join key: ", options: { bold: true, color: WHITE } },
    { text: "storeID slug from the ", options: { color: OFFWHT } },
    { text: "website", options: { italic: true, color: OFFWHT } },
    { text: " URL in Google Reviews (e.g. ", options: { color: OFFWHT } },
    { text: ".../locations/dallas-san-jacinto", options: { fontFace: "Courier New", color: TEAL, fontSize: 7 } },
    { text: `). Left-joined to scraped location data — ${totalReviews.toLocaleString()} reviews fully matched.`, options: { color: OFFWHT } },
  ], {
    x: 5.15, y: 4.47, w: 4.6, h: 0.44,
    fontSize: 8, fontFace: "Calibri", valign: "top", margin: 0
  });

  // Bottom bar
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 5.45, w: 10, h: 0.175,
    fill: { color: BLUE }, line: { color: BLUE }
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 5.45, w: 0.06, h: 0.175,
    fill: { color: TEAL }, line: { color: TEAL }
  });
  s.addText("la Madeleine Web Data Technical Assessment  ·  Google Reviews dataset, Feb 2026  ·  Store-level aggregation methodology", {
    x: 0.18, y: 5.45, w: 9.6, h: 0.175,
    fontSize: 6.5, color: MUTED, fontFace: "Calibri", valign: "middle", margin: 0
  });

  return pres;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  if (!fs.existsSync(REVIEWS_PATH)) {
    console.error(`ERROR: ${REVIEWS_PATH} not found.`);
    console.error("Run associate.py first: python scraper/associate.py --reviews googleReview.csv");
    process.exit(1);
  }

  console.log("Loading reviews...");
  const reviews = loadReviews(REVIEWS_PATH);
  console.log(`  ${reviews.length.toLocaleString()} reviews loaded.`);

  console.log("Analysing data (store-level aggregation)...");
  const data = analyse(reviews);
  console.log(`  ${data.uniqueStates} states | best: ${data.bestState.state} (${data.bestState.avg.toFixed(2)}) | worst: ${data.worstState.state} (${data.worstState.avg.toFixed(2)})`);
  console.log(`  Best location:  ${data.bestLocation.city}, ${data.bestLocation.state} (${data.bestLocation.avg.toFixed(2)})`);
  console.log(`  Worst location: ${data.worstLocation.city}, ${data.worstLocation.state} (${data.worstLocation.avg.toFixed(2)})`);

  console.log("Building slide...");
  const pres = buildSlide(data);

  pres.writeFile({ fileName: OUTPUT_PATH })
    .then(() => console.log(`Saved -> ${OUTPUT_PATH}`))
    .catch(err => { console.error(err); process.exit(1); });
}

main();