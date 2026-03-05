# ANSIR Research Projects

Public-facing project database for the **Australian National Seismic Imaging Resource (ANSIR)**, an [AuScope](https://www.auscope.org.au/) national research facility.

Browse active and completed geophysical research projects using ANSIR equipment across Australia and internationally.

**Live site:** [auscope.org.au/ansir-test](https://www.auscope.org.au/ansir-test)

## How it works

```
Google Sheet (master data)
    |  GAS export on save
    v
data/data.json (pushed via GitHub API)
    |  GitHub Action triggered
    v
data/data.json (enriched with DOI metadata)
ro-crate-metadata.json (generated for standards compliance)
    |  GitHub Pages serves
    v
index.html + data/data.json -> embedded in Squarespace via iframe
```

1. Project data is managed in a Google Sheet by the ANSIR team
2. When a project is saved in the internal dashboard, a Google Apps Script function exports public-facing fields as structured JSON and pushes `data/data.json` to this repo via the GitHub API
3. A GitHub Action detects the data change and runs two steps:
   - **DOI enrichment** — resolves publication/dataset metadata (title, authors, journal, year) via CrossRef and DataCite APIs
   - **RO-Crate generation** — produces a standards-compliant `ro-crate-metadata.json` for machine-readable research metadata
4. GitHub Pages serves `index.html` which fetches `data/data.json` and renders an interactive project browser with map, filters, and search
5. The page is embedded in the AuScope Squarespace site via an iframe with deep-linking support

## Repository structure

```
ansir-data/
├── .github/workflows/
│   └── resolve-dois.yml          # GitHub Action: enrich DOIs + generate RO-Crate
├── assets/images/
│   └── ORCID_iD.png              # ORCID icon for contributor links
├── data/
│   └── data.json                 # Project data (auto-published from dashboard)
├── scripts/
│   ├── resolve-dois.js           # DOI metadata resolution via CrossRef/DataCite
│   └── generate-ro-crate.js      # RO-Crate 1.1 metadata generator
├── index.html                    # Main project browser page
├── ro-crate-metadata.json        # RO-Crate metadata (auto-generated)
├── LICENSE                       # CC BY 4.0
└── README.md
```

## Data format

### data/data.json

Optimised for the frontend. Contains structured project records with:

- Project metadata (title, ANSIR code, status, dates, description)
- Methods and keywords (arrays)
- Location (region, country, coordinates, polygon)
- Contributors (name, title, ORCID, organisation, role hierarchy)
- Funding (agency, title, identifier)
- ANSIR instrumentation (type, count)
- Related objects with resolved DOI metadata (publications, datasets, FDSN networks)
- Data access and indigenous engagement information

### ro-crate-metadata.json

[RO-Crate 1.1](https://www.researchobject.org/ro-crate/specification/1.1/) compliant metadata for machine consumption. Auto-generated from `data.json` after DOI enrichment. Uses Schema.org JSON-LD to describe:

- The ANSIR project collection as a root `Dataset`
- Each project as a `Dataset` entity with `hasPart` relationship
- Contributors as `Person` entities (linked via ORCID where available)
- Organisations, funding grants, instruments as contextual entities
- Publications as `ScholarlyArticle` entities with DOI identifiers
- FDSN networks and datasets as linked `Dataset` entities
- Spatial coverage via `Place` and `GeoCoordinates`
- Temporal coverage, keywords, and access conditions

This enables discovery by ARDC Research Data Australia, institutional repositories, and other RO-Crate-aware harvesters.

## Technologies

- **Frontend:** Vanilla HTML/CSS/JS with [Leaflet.js](https://leafletjs.com/) for interactive maps
- **Backend:** Google Apps Script (data management + export)
- **Hosting:** GitHub Pages
- **DOI resolution:** CrossRef API + DataCite API via GitHub Actions
- **Research metadata:** [RO-Crate 1.1](https://www.researchobject.org/ro-crate/specification/1.1/) (Schema.org JSON-LD)
- **Embedding:** Squarespace iframe with postMessage deep-linking

## License

This project is licensed under [CC BY 4.0](LICENSE) - Creative Commons Attribution 4.0 International.

Data sourced from ANSIR research projects. Publication metadata resolved via [CrossRef](https://www.crossref.org/) and [DataCite](https://datacite.org/) APIs.
