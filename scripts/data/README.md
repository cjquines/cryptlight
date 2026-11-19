Sources for .gitignored files:

- `./clueclinic/...`: [Clue Clinic's Clinical Data](https://clueclinic.com/index.php/clinical-data/), normalized to one row per phrase (see `scripts/scrape-clueclinic.ts`); run `npm run scrape:clueclinic` (290 kB).

- `./georgeho-charades.csv`: [cryptics.georgeho.org](https://cryptics.georgeho.org/data/charades), under "charades", select CSV options "download file" and "stream all rows" (5.0 MB).

- `./georgeho-indicators.csv`: [cryptics.georgeho.org](https://cryptics.georgeho.org/data/indicators), under "indicators", select CSV options "download file" and "stream all rows" (3.2 MB).

- `./rdeits/...`: files of [rdeits/cryptics](https://github.com/rdeits/cryptics/tree/master/indicators), under "indicators" (36 kB).

- `./wordnet/...`: files of [Wordnet 3.1](https://wordnet.princeton.edu/download/current-version) (16 MB gzipped, 53 MB unpacked).
