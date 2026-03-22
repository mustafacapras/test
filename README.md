# la Madeleine Location Scraper

Bain & Company — WDF Specialist Technical Assessment

---

## Background

This project started with a network inspection problem. The goal was to extract restaurant location data from lamadeleine.com — but instead of scraping rendered HTML, I opened Chrome DevTools on the locations page and watched the network traffic. The page fires a single WordPress REST API request that returns all US locations as clean JSON. That's the endpoint this scraper targets.

The rest of the pipeline joins that location data with a provided Google Reviews dataset, enabling per-location sentiment analysis across 32,232 reviews.

---

## Project structure

```
├── .github/
│   └── workflows/
│       └── scrape.yaml             # Quarterly automation
├── scraper/
│   ├── constants.py                # API endpoint, headers, output columns, state name map
│   ├── parser.py                   # Parses raw API records into clean rows
│   ├── lamadeleine_scraper.py      # Fetches data from API, writes CSV + XLSX
│   └── associate.py                # Joins Google Reviews to location data
├── data/
│   ├── lamadeleine_locations.csv   # 87 US locations — refreshed quarterly by CI
│   ├── lamadeleine_locations.xlsx  # Same data, Excel format
│   └── reviews_with_locations.csv  # Reviews joined to locations (32,232 rows)
├── googleReview.csv                # Source review data provided by Bain
├── create_slide.js                 # Generates assessment slide from CSV data
├── run.py                          # Single entry point: scrape + associate
├── requirements.txt
└── README.md
```

---

## Setup

```bash
git clone https://github.com/<your-username>/<repo-name>.git
cd <repo-name>

python -m venv venv
venv\Scripts\activate      # Windows
source venv/bin/activate   # Mac/Linux

pip install -r requirements.txt
```

---

## Usage

**Scrape location data:**
```bash
python scraper/lamadeleine_scraper.py
```
Writes `data/lamadeleine_locations.csv` and `data/lamadeleine_locations.xlsx`.

**Scrape + associate reviews in one command:**
```bash
python run.py --reviews googleReview.csv
```
Writes everything above plus `data/reviews_with_locations.csv`.

**Associate reviews separately:**
```bash
python scraper/associate.py --reviews googleReview.csv
```

**Generate the insight slide:**
```bash
npm install pptxgenjs papaparse
node create_slide.js
```
Reads `data/reviews_with_locations.csv`, computes all statistics, and writes `lamadeleine_assessment.pptx`. No hardcoded values — the slide updates automatically when the underlying data changes.

---

## How the API was found

Opening `lamadeleine.com/locations` in Chrome and filtering Network → Fetch/XHR revealed this request firing on page load:

```
GET https://lamadeleine.com/wp-json/wp/v2/restaurant-locations?per_page=150
```

The response contains all US locations as structured JSON with full address data, coordinates, and store metadata. Pagination is handled via `X-WP-Total` and `X-WP-TotalPages` response headers — the scraper reads these to ensure all records are captured even if the location count grows past 150.

---

## How the association works

Each row in the Google Reviews CSV includes a `website` column:

```
https://lamadeleine.com/locations/dallas-san-jacinto
                                   ^^^^^^^^^^^^^^^^^^
                                   storeID
```

The scraper captures this same slug as `storeID`. A left join on that field produces `reviews_with_locations.csv` — all 32,232 reviews matched cleanly with no unmatched rows.

---

## Output fields

| Field | Description |
|---|---|
| `locationName` | Restaurant name |
| `postalCode` | ZIP code |
| `streetAddress` | Primary street address |
| `streetAddress2` | Suite / unit |
| `fullAddress` | Full formatted address |
| `city` | City |
| `state` | 2-letter state code |
| `storeID` | URL slug, used as join key |

---

## Quarterly automation

A GitHub Actions workflow runs the scraper on the 1st of January, April, July, and October at 06:00 UTC. Updated CSV and XLSX files are committed back to the repository automatically. Manual runs are available from the Actions tab at any time.

Required one-time setup: **Settings → Actions → General → Workflow permissions → Read and write permissions**.
